-- Расчётный период выплаты отдельно от даты оплаты.
-- Зарплату за сентябрь платят в октябре: до этой миграции такая выплата
-- попадала в октябрь, потому что месяц брался из expense_date. Теперь у
-- каждой выплаты есть period_month (YYYY-MM), и раздел «Зарплата» считает
-- выплачено/к выплате по нему. Касса и движения по счетам по-прежнему идут
-- датой оплаты.
begin;

alter table public.tech_expenses
  add column if not exists period_month text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tech_expenses'::regclass and conname = 'tech_expenses_period_month_format'
  ) then
    alter table public.tech_expenses
      add constraint tech_expenses_period_month_format
      check (period_month is null or period_month ~ '^\d{4}-(0[1-9]|1[0-2])$');
  end if;
end
$migration$;

-- Месяц, названный в заметке («Сентябрь», «За август», «Зарплата за Июнь»).
-- Берём его, только если месяц в заметке ровно один и он не позже месяца
-- оплаты и не раньше чем за два месяца до него — иначе это не период, а шум.
create or replace function public.kd_payroll_period_from_note(p_note text, p_paid_on date)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public
as $function$
declare
  v_note text := lower(coalesce(p_note, ''));
  v_stems text[] := array['январ', 'феврал', 'март', 'апрел', 'ма[йяе]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
  v_found int[] := '{}';
  v_month int;
  v_candidate date;
  i int;
begin
  if p_paid_on is null or v_note = '' then return null; end if;
  for i in 1..12 loop
    if v_note ~ ('(^|[^а-яё])' || v_stems[i]) then
      v_found := v_found || i;
    end if;
  end loop;
  if coalesce(array_length(v_found, 1), 0) <> 1 then return null; end if;
  v_month := v_found[1];
  v_candidate := make_date(extract(year from p_paid_on)::int, v_month, 1);
  if v_candidate > date_trunc('month', p_paid_on)::date then
    v_candidate := (v_candidate - interval '1 year')::date;
  end if;
  if v_candidate < (date_trunc('month', p_paid_on) - interval '2 months')::date then
    return null;
  end if;
  return to_char(v_candidate, 'YYYY-MM');
end
$function$;

-- Бэкфилл. Закрытые периоды трогаем намеренно: меняется только новая колонка,
-- суммы, даты и движения по счетам остаются прежними. Триггер закрытого
-- периода на время бэкфилла выключаем, иначе он не даст записать период
-- старым выплатам.
do $migration$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.tech_expenses'::regclass and tgname = 'kd_closed_period_tech_expenses') then
    alter table public.tech_expenses disable trigger kd_closed_period_tech_expenses;
  end if;
end
$migration$;

update public.tech_expenses
set period_month = coalesce(
  public.kd_payroll_period_from_note(note, expense_date),
  to_char(expense_date, 'YYYY-MM')
)
where period_month is null and expense_date is not null;

do $migration$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.tech_expenses'::regclass and tgname = 'kd_closed_period_tech_expenses') then
    alter table public.tech_expenses enable trigger kd_closed_period_tech_expenses;
  end if;
end
$migration$;

-- Записи, созданные без периода (старые клиенты, ручные начисления), получают
-- месяц даты — так же, как считалось до этой миграции.
create or replace function public.kd_fill_payroll_period()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if NEW.period_month is null and NEW.expense_date is not null then
    NEW.period_month := to_char(NEW.expense_date, 'YYYY-MM');
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_fill_payroll_period() from public, anon, authenticated;
drop trigger if exists kd_fill_payroll_period on public.tech_expenses;
create trigger kd_fill_payroll_period
  before insert or update on public.tech_expenses
  for each row execute function public.kd_fill_payroll_period();

-- Проведение выплаты с периодом. Тело — прежнее post_payroll_payment_atomic
-- плюс период и расширенный список видов выплат.
create or replace function public.post_payroll_payment_atomic(
  p_request_id uuid,
  p_tech_id uuid,
  p_type text,
  p_amount numeric,
  p_paid_on date,
  p_account_id uuid,
  p_note text,
  p_expense_id uuid,
  p_period_month text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_expense public.tech_expenses%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
  v_expense_id uuid;
  v_note text := nullif(btrim(p_note), '');
  v_type text := lower(nullif(btrim(p_type), ''));
  v_period text := nullif(btrim(p_period_month), '');
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (public.is_admin() or public.kd_has_permission('action.finance_edit'))
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для проведения выплаты';
  end if;
  if p_account_id is null or p_paid_on is null or p_tech_id is null then
    raise exception using errcode = '22004', message = 'Для выплаты нужны сотрудник, счёт и дата';
  end if;
  if v_period is not null and v_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = '22023', message = 'Период выплаты указывается как ГГГГ-ММ';
  end if;

  if p_expense_id is null then
    if p_request_id is null or p_amount is null or p_amount <= 0
       or v_type not in ('salary', 'advance', 'bonus', 'tax', 'travel', 'other') then
      raise exception using errcode = '22023', message = 'Некорректные реквизиты выплаты';
    end if;
    v_period := coalesce(v_period, to_char(p_paid_on, 'YYYY-MM'));

    perform pg_advisory_xact_lock(hashtextextended('payroll_request:' || p_request_id::text, 0));
    select * into v_expense
    from public.tech_expenses
    where request_id = p_request_id
    for update;

    if not found then
      insert into public.tech_expenses (
        tech_id, type, amount, expense_date, account_id, paid_at, status, note, created_by, request_id, period_month
      ) values (
        p_tech_id, v_type, p_amount, p_paid_on, p_account_id, p_paid_on, 'paid', v_note, auth.uid(), p_request_id, v_period
      ) returning * into v_expense;
    elsif v_expense.tech_id is distinct from p_tech_id
       or v_expense.type is distinct from v_type
       or v_expense.amount is distinct from p_amount
       or v_expense.expense_date is distinct from p_paid_on
       or v_expense.paid_at is distinct from p_paid_on
       or v_expense.account_id is distinct from p_account_id
       or v_expense.note is distinct from v_note
       or v_expense.period_month is distinct from v_period
       or v_expense.status <> 'paid' then
      raise exception using errcode = '23505', message = 'Этот запрос выплаты уже использован с другими данными';
    end if;
  else
    select * into v_expense
    from public.tech_expenses
    where id = p_expense_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'Начисление не найдено';
    end if;
    if v_expense.tech_id is distinct from p_tech_id or v_expense.amount <= 0 then
      raise exception using errcode = '55000', message = 'Начисление содержит некорректные данные';
    end if;
  end if;

  v_expense_id := v_expense.id;
  perform pg_advisory_xact_lock(hashtextextended('payroll:' || v_expense_id::text, 0));

  select count(*) into v_move_count
  from public.money_moves
  where source = 'payroll' and ref_id = v_expense_id;
  if v_move_count > 1 then
    raise exception using
      errcode = '55000',
      message = 'По выплате найдено несколько движений',
      hint = 'Сначала выполните сверку финансов.';
  end if;

  select * into v_move
  from public.money_moves
  where source = 'payroll' and ref_id = v_expense_id
  order by created_at, id
  limit 1
  for update;

  if found then
    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_expense.amount
       or v_move.move_date is distinct from p_paid_on then
      raise exception using
        errcode = '23505',
        message = 'По этой выплате уже есть другое движение по счёту',
        hint = 'Сначала выполните сверку существующего движения.';
    end if;
    if v_expense.status = 'paid'
       and v_expense.account_id = p_account_id
       and v_expense.paid_at = p_paid_on then
      return v_expense_id;
    end if;
    raise exception using errcode = '55000', message = 'Начисление не совпадает с существующим движением';
  end if;

  if p_expense_id is not null then
    update public.tech_expenses
    set status = 'paid', account_id = p_account_id, paid_at = p_paid_on,
        period_month = coalesce(v_period, period_month)
    where id = v_expense_id
    returning * into v_expense;
  end if;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'expense', v_expense.amount, p_paid_on,
    'Выплата сотруднику' || case when v_expense.note is null then '' else ' · ' || v_expense.note end,
    'payroll', v_expense_id, auth.uid()
  );

  return v_expense_id;
end
$function$;

-- Прежняя сигнатура остаётся для уже открытых вкладок со старой версией
-- приложения: период тогда берётся из даты оплаты.
create or replace function public.post_payroll_payment_atomic(
  p_request_id uuid,
  p_tech_id uuid,
  p_type text,
  p_amount numeric,
  p_paid_on date,
  p_account_id uuid,
  p_note text,
  p_expense_id uuid
)
returns uuid
language sql
security definer
set search_path = pg_catalog, public
as $function$
  select public.post_payroll_payment_atomic(
    p_request_id, p_tech_id, p_type, p_amount, p_paid_on, p_account_id, p_note, p_expense_id, null::text
  );
$function$;

-- Перенос переплаты считает исходным месяцем расчётный период выплаты.
create or replace function public.carry_payroll_overpayment(p_request_id uuid,p_payment_id uuid,p_to_month text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_payment public.tech_expenses%rowtype; v_previous public.payroll_carryovers%rowtype; v_id uuid; v_total numeric; v_from text;
begin
 if not coalesce(public.kd_has_permission('action.finance_edit'),false) then raise exception 'Нет прав на зарплату' using errcode='42501'; end if;
 if p_request_id is null or p_payment_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or nullif(btrim(p_reason),'') is null then raise exception 'Проверьте сумму и основание'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll_carryover:'||p_request_id::text,0));
 select * into v_previous from public.payroll_carryovers where request_id=p_request_id;
 if found then
  if v_previous.payment_id is distinct from p_payment_id or v_previous.to_month is distinct from p_to_month or v_previous.amount is distinct from p_amount or v_previous.reason is distinct from btrim(p_reason) then raise exception 'Запрос уже проведён с другими данными'; end if;
  return v_previous.id;
 end if;
 if p_to_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_to_month is null then raise exception 'Укажите месяц переноса'; end if;
 if (p_to_month||'-01')::date <= public.kd_books_closed_until() then raise exception 'Месяц назначения закрыт'; end if;
 select * into v_payment from public.tech_expenses where id=p_payment_id for update;
 if not found or v_payment.status<>'paid' or v_payment.tech_id is null then raise exception 'Нужна проведённая выплата сотруднику'; end if;
 v_from := coalesce(v_payment.period_month, to_char(v_payment.expense_date,'YYYY-MM'));
 if p_to_month <= v_from then raise exception 'Перенести переплату можно только на более поздний месяц'; end if;
 select coalesce(sum(amount),0) into v_total from public.payroll_carryovers where payment_id=p_payment_id;
 if v_total+p_amount>v_payment.amount then raise exception 'Перенос превышает сумму исходной выплаты с учётом прошлых переносов'; end if;
 insert into public.payroll_carryovers(request_id,payment_id,tech_id,from_month,to_month,amount,reason)
 values(p_request_id,p_payment_id,v_payment.tech_id,v_from,p_to_month,p_amount,btrim(p_reason)) returning id into v_id;
 return v_id;
end $$;

-- Выплату с перенесённой переплатой нельзя и переотнести к другому периоду.
create or replace function public.kd_guard_carried_payment() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.payroll_carryovers where payment_id=old.id) then
  if tg_op='DELETE' then raise exception 'У выплаты есть перенос переплаты'; end if;
  if (new.amount,new.tech_id,new.expense_date,new.status,new.period_month) is distinct from (old.amount,old.tech_id,old.expense_date,old.status,old.period_month) then raise exception 'У выплаты есть перенос переплаты'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.kd_guard_carried_payment() from public,anon,authenticated;

revoke all on function public.kd_payroll_period_from_note(text, date) from public, anon;
grant execute on function public.kd_payroll_period_from_note(text, date) to authenticated, service_role;
revoke all on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid, text) from public, anon;
revoke all on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid) from public, anon;
grant execute on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid) to authenticated, service_role;
revoke all on function public.carry_payroll_overpayment(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.carry_payroll_overpayment(uuid,uuid,text,numeric,text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select period_month, count(*) from public.tech_expenses group by 1 order by 1;
-- select expense_date, note, period_month from public.tech_expenses
-- where period_month <> to_char(expense_date, 'YYYY-MM');
