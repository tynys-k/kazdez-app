-- Атомарное создание, проведение и удаление выплат сотрудникам.
begin;

alter table public.tech_expenses
  add column if not exists request_id uuid;

create unique index if not exists tech_expenses_request_id_key
  on public.tech_expenses (request_id)
  where request_id is not null;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required access-control functions were not found';
  end if;
end
$migration$;

create or replace function public.kd_prevent_duplicate_derived_settlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if NEW.source in ('paperwork', 'tender_pledge', 'tender_return', 'deposit', 'payroll') and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0));
    if exists (
      select 1 from public.money_moves m
      where m.source = NEW.source and m.ref_id = NEW.ref_id
    ) then
      raise exception using errcode = '23505', message = 'Движение по этой операции уже существует';
    end if;
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_prevent_duplicate_derived_settlement() from public, anon, authenticated;
drop trigger if exists kd_no_duplicate_derived_settlement on public.money_moves;
create trigger kd_no_duplicate_derived_settlement
  before insert on public.money_moves
  for each row execute function public.kd_prevent_duplicate_derived_settlement();

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

  if p_expense_id is null then
    if p_request_id is null or p_amount is null or p_amount <= 0 or v_type not in ('salary', 'travel', 'other') then
      raise exception using errcode = '22023', message = 'Некорректные реквизиты выплаты';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('payroll_request:' || p_request_id::text, 0));
    select * into v_expense
    from public.tech_expenses
    where request_id = p_request_id
    for update;

    if not found then
      insert into public.tech_expenses (
        tech_id, type, amount, expense_date, account_id, paid_at, status, note, created_by, request_id
      ) values (
        p_tech_id, v_type, p_amount, p_paid_on, p_account_id, p_paid_on, 'paid', v_note, auth.uid(), p_request_id
      ) returning * into v_expense;
    elsif v_expense.tech_id is distinct from p_tech_id
       or v_expense.type is distinct from v_type
       or v_expense.amount is distinct from p_amount
       or v_expense.expense_date is distinct from p_paid_on
       or v_expense.paid_at is distinct from p_paid_on
       or v_expense.account_id is distinct from p_account_id
       or v_expense.note is distinct from v_note
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
    set status = 'paid', account_id = p_account_id, paid_at = p_paid_on
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

create or replace function public.delete_payroll_expense_atomic(p_expense_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_expense public.tech_expenses%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (public.is_admin() or public.kd_has_permission('action.finance_edit'))
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для удаления выплаты';
  end if;
  if p_expense_id is null then
    raise exception using errcode = '22004', message = 'Не указана выплата';
  end if;

  select * into v_expense
  from public.tech_expenses
  where id = p_expense_id
  for update;
  if not found then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('payroll:' || p_expense_id::text, 0));
  select count(*) into v_move_count
  from public.money_moves
  where source = 'payroll' and ref_id = p_expense_id;

  if v_move_count > 1 or (v_move_count = 0 and v_expense.status = 'paid' and v_expense.account_id is not null) then
    raise exception using errcode = '55000', message = 'Выплата не совпадает с движениями по счёту', hint = 'Сначала выполните сверку финансов.';
  end if;

  if v_move_count = 1 then
    select * into v_move
    from public.money_moves
    where source = 'payroll' and ref_id = p_expense_id
    for update;
    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from v_expense.account_id
       or v_move.amount is distinct from v_expense.amount
       or v_move.move_date is distinct from coalesce(v_expense.paid_at, v_expense.expense_date) then
      raise exception using errcode = '55000', message = 'Выплата не совпадает с движением по счёту', hint = 'Сначала выполните сверку финансов.';
    end if;
    delete from public.money_moves where id = v_move.id;
  end if;

  delete from public.tech_expenses where id = p_expense_id;
  return true;
end
$function$;

revoke all on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid) from public, anon;
revoke all on function public.delete_payroll_expense_atomic(uuid) from public, anon;
grant execute on function public.post_payroll_payment_atomic(uuid, uuid, text, numeric, date, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.delete_payroll_expense_atomic(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('post_payroll_payment_atomic', 'delete_payroll_expense_atomic');
