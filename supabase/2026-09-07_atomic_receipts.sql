-- Атомарное проведение входящих оплат по долгам и продажам препаратов.
-- Отметка оплаты и движение по счёту записываются одной транзакцией.
-- Клиент передаёт только ссылку, счёт и дату; сумму сервер берёт из источника.
-- Повторный запуск безопасен.

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required access-control functions were not found';
  end if;
end
$migration$;

create index if not exists money_moves_source_ref_idx
  on public.money_moves (source, ref_id);

-- Уникальный индекс мог бы не установиться из-за старых дублей. Триггер не
-- трогает историю, но не разрешает появляться новым дублям, в том числе из
-- старой вкладки приложения, открытой до публикации нового клиента.
create or replace function public.kd_prevent_duplicate_derived_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if NEW.source in ('job_debt', 'chem_sale') and NEW.ref_id is not null then
    -- Одинаковые параллельные вставки выстраиваются в очередь, поэтому обе не
    -- смогут одновременно увидеть, что движения ещё нет.
    perform pg_advisory_xact_lock(
      hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0)
    );

    if exists (
      select 1 from public.money_moves m
      where m.source = NEW.source and m.ref_id = NEW.ref_id
    ) then
      raise exception using
        errcode = '23505',
        message = 'Движение по этой оплате уже существует';
    end if;
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_prevent_duplicate_derived_receipt() from public, anon, authenticated;

drop trigger if exists kd_no_duplicate_derived_receipt on public.money_moves;
create trigger kd_no_duplicate_derived_receipt
  before insert on public.money_moves
  for each row execute function public.kd_prevent_duplicate_derived_receipt();

create or replace function public.post_job_debt_payment_atomic(
  p_debt_id uuid,
  p_account_id uuid,
  p_paid_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_debt public.job_debts%rowtype;
  v_move public.money_moves%rowtype;
  v_move_id uuid;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (public.is_admin() or public.kd_has_permission('action.finance_edit'))
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для проведения оплаты';
  end if;

  if p_debt_id is null or p_account_id is null or p_paid_on is null then
    raise exception using errcode = '22004', message = 'Для оплаты нужны долг, счёт и дата';
  end if;

  select * into v_debt
  from public.job_debts
  where id = p_debt_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Долг не найден';
  end if;
  if v_debt.amount <= 0 then
    raise exception using errcode = '22023', message = 'Сумма долга должна быть больше нуля';
  end if;
  if v_debt.paid_on is not null and v_debt.paid_on <> p_paid_on then
    raise exception using errcode = '55000', message = 'Долг уже отмечен оплаченным другой датой';
  end if;
  if v_debt.paid_account_id is not null and v_debt.paid_account_id <> p_account_id then
    raise exception using errcode = '55000', message = 'Долг уже привязан к другому счёту';
  end if;

  select * into v_move
  from public.money_moves
  where source = 'job_debt' and ref_id = p_debt_id
  order by created_at, id
  limit 1
  for update;

  if found then
    if v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_debt.amount
       or v_move.move_date is distinct from p_paid_on then
      raise exception using
        errcode = '23505',
        message = 'По этому долгу уже есть другое движение по счёту',
        hint = 'Не создавайте вторую оплату. Сначала выполните сверку существующего движения.';
    end if;

    if v_debt.paid_on = p_paid_on and v_debt.paid_account_id = p_account_id then
      return v_move.id;
    end if;
  end if;

  update public.job_debts
  set paid_on = p_paid_on, paid_account_id = p_account_id
  where id = p_debt_id;

  if v_move.id is not null then
    return v_move.id;
  end if;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'income', v_debt.amount, p_paid_on,
    'Погашен долг по заявке', 'job_debt', p_debt_id, auth.uid()
  )
  returning id into v_move_id;

  return v_move_id;
end
$function$;

create or replace function public.post_chemical_sale_payment_atomic(
  p_sale_id uuid,
  p_account_id uuid,
  p_paid_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sale public.chemical_sales%rowtype;
  v_move public.money_moves%rowtype;
  v_move_id uuid;
  v_partner_name text;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (public.is_admin() or public.kd_has_permission('action.finance_edit'))
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для проведения оплаты';
  end if;

  if p_sale_id is null or p_account_id is null or p_paid_on is null then
    raise exception using errcode = '22004', message = 'Для оплаты нужны продажа, счёт и дата';
  end if;

  select * into v_sale
  from public.chemical_sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Продажа препарата не найдена';
  end if;
  if v_sale.total <= 0 then
    raise exception using errcode = '22023', message = 'Сумма продажи должна быть больше нуля';
  end if;
  if v_sale.paid_on is not null and v_sale.paid_on <> p_paid_on then
    raise exception using errcode = '55000', message = 'Продажа уже отмечена оплаченной другой датой';
  end if;
  if v_sale.account_id is not null and v_sale.account_id <> p_account_id then
    raise exception using errcode = '55000', message = 'Продажа уже привязана к другому счёту';
  end if;

  select * into v_move
  from public.money_moves
  where source = 'chem_sale' and ref_id = p_sale_id
  order by created_at, id
  limit 1
  for update;

  if found then
    if v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_sale.total
       or v_move.move_date is distinct from p_paid_on then
      raise exception using
        errcode = '23505',
        message = 'По этой продаже уже есть другое движение по счёту',
        hint = 'Не создавайте вторую оплату. Сначала выполните сверку существующего движения.';
    end if;

    if v_sale.paid_on = p_paid_on and v_sale.account_id = p_account_id then
      return v_move.id;
    end if;
  end if;

  update public.chemical_sales
  set paid_on = p_paid_on, account_id = p_account_id
  where id = p_sale_id;

  if v_move.id is not null then
    return v_move.id;
  end if;

  select coalesce(p.name, 'партнёр') into v_partner_name
  from public.partners p
  where p.id = v_sale.partner_id;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'income', v_sale.total, p_paid_on,
    'Оплата за препарат: ' || coalesce(v_partner_name, 'партнёр'),
    'chem_sale', p_sale_id, auth.uid()
  )
  returning id into v_move_id;

  return v_move_id;
end
$function$;

revoke all on function public.post_job_debt_payment_atomic(uuid, uuid, date) from public, anon;
revoke all on function public.post_chemical_sale_payment_atomic(uuid, uuid, date) from public, anon;
grant execute on function public.post_job_debt_payment_atomic(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.post_chemical_sale_payment_atomic(uuid, uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения:
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('post_job_debt_payment_atomic', 'post_chemical_sale_payment_atomic');
