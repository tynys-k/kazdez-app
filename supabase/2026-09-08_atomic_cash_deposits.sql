-- Атомарное подтверждение, отклонение и отмена заявок на сдачу наличных.
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

create or replace function public.kd_prevent_duplicate_derived_settlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if NEW.source in ('paperwork', 'tender_pledge', 'tender_return', 'deposit') and NEW.ref_id is not null then
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

create or replace function public.decide_cash_deposit_atomic(
  p_deposit_id uuid,
  p_status text,
  p_account_id uuid default null,
  p_decided_on date default null,
  p_admin_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deposit public.cash_deposits%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
  v_move_id uuid;
  v_status text := lower(nullif(btrim(p_status), ''));
  v_note text := nullif(btrim(p_admin_note), '');
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (public.is_admin() or public.kd_has_permission('action.finance_edit'))
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для подтверждения поступления';
  end if;
  if p_deposit_id is null or v_status not in ('confirmed', 'rejected') then
    raise exception using errcode = '22023', message = 'Некорректное решение по заявке';
  end if;
  if v_status = 'confirmed' and (p_account_id is null or p_decided_on is null) then
    raise exception using errcode = '22004', message = 'Для подтверждения нужны счёт и дата поступления';
  end if;

  select * into v_deposit
  from public.cash_deposits
  where id = p_deposit_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Заявка на внесение не найдена';
  end if;
  if v_deposit.amount is null or v_deposit.amount <= 0 then
    raise exception using errcode = '22023', message = 'Сумма внесения должна быть больше нуля';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deposit:' || p_deposit_id::text, 0));
  select count(*) into v_move_count
  from public.money_moves
  where source = 'deposit' and ref_id = p_deposit_id;

  if v_move_count > 1 then
    raise exception using
      errcode = '55000',
      message = 'По заявке найдено несколько денежных движений',
      hint = 'Сначала выполните сверку финансов.';
  end if;

  if v_deposit.status = 'rejected' then
    if v_status = 'rejected' and v_move_count = 0 then return null; end if;
    raise exception using errcode = '55000', message = 'Заявка уже отклонена';
  end if;

  if v_deposit.status = 'confirmed' and v_status <> 'confirmed' then
    raise exception using errcode = '55000', message = 'Подтверждённое поступление нельзя отклонить';
  end if;

  if v_status = 'rejected' then
    if v_deposit.status <> 'pending' or v_move_count <> 0 then
      raise exception using errcode = '55000', message = 'Заявку уже нельзя отклонить';
    end if;
    update public.cash_deposits
    set status = 'rejected', decided_at = now(), decided_by = auth.uid(), admin_note = v_note
    where id = p_deposit_id;
    return null;
  end if;

  if v_move_count = 1 then
    select * into v_move
    from public.money_moves
    where source = 'deposit' and ref_id = p_deposit_id
    for update;

    if v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_deposit.amount then
      raise exception using
        errcode = '55000',
        message = 'Заявка не совпадает с движением по счёту',
        hint = 'Сначала выполните сверку финансов.';
    end if;
    if v_deposit.status = 'confirmed' then return v_move.id; end if;
    raise exception using errcode = '55000', message = 'У ожидающей заявки уже есть движение по счёту';
  end if;

  if coalesce(v_deposit.status, '') not in ('pending', 'confirmed') then
    raise exception using errcode = '55000', message = 'Заявка уже обработана';
  end if;

  update public.cash_deposits
  set status = 'confirmed', decided_at = now(), decided_by = auth.uid(), admin_note = v_note
  where id = p_deposit_id;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'income', v_deposit.amount, p_decided_on,
    'Сдача наличных через банкомат', 'deposit', p_deposit_id, auth.uid()
  ) returning id into v_move_id;

  return v_move_id;
end
$function$;

create or replace function public.cancel_cash_deposit_atomic(p_deposit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_deposit public.cash_deposits%rowtype;
begin
  if not coalesce(public.kd_account_active(), false) then
    raise exception using errcode = '42501', message = 'Аккаунт неактивен';
  end if;
  if p_deposit_id is null then
    raise exception using errcode = '22004', message = 'Не указана заявка на внесение';
  end if;

  select * into v_deposit
  from public.cash_deposits
  where id = p_deposit_id
  for update;
  if not found then return false; end if;

  if v_deposit.tech_id <> auth.uid()
     and not public.is_admin()
     and not public.kd_has_permission('action.finance_edit') then
    raise exception using errcode = '42501', message = 'Можно отменить только свою заявку';
  end if;
  if coalesce(v_deposit.status, '') <> 'pending' then
    raise exception using errcode = '55000', message = 'Можно отменить только ожидающую заявку';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deposit:' || p_deposit_id::text, 0));
  if exists (
    select 1 from public.money_moves where source = 'deposit' and ref_id = p_deposit_id
  ) then
    raise exception using errcode = '55000', message = 'Заявка уже связана с движением по счёту';
  end if;

  delete from public.cash_deposits where id = p_deposit_id;
  return true;
end
$function$;

revoke all on function public.decide_cash_deposit_atomic(uuid, text, uuid, date, text) from public, anon;
revoke all on function public.cancel_cash_deposit_atomic(uuid) from public, anon;
grant execute on function public.decide_cash_deposit_atomic(uuid, text, uuid, date, text) to authenticated, service_role;
grant execute on function public.cancel_cash_deposit_atomic(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения:
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('decide_cash_deposit_atomic', 'cancel_cash_deposit_atomic');
