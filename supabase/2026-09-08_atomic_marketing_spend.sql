-- Атомарные рекламные расходы и безопасное удаление рекламных каналов.
begin;

alter table public.mkt_topups
  add column if not exists request_id uuid;

create unique index if not exists mkt_topups_request_id_key
  on public.mkt_topups (request_id)
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
  if NEW.source in ('paperwork', 'tender_pledge', 'tender_return', 'deposit', 'payroll', 'marketing') and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0));
    if exists (select 1 from public.money_moves m where m.source = NEW.source and m.ref_id = NEW.ref_id) then
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

create or replace function public.post_marketing_spend_atomic(
  p_request_id uuid,
  p_channel_id uuid,
  p_amount numeric,
  p_spent_on date,
  p_account_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_channel public.mkt_channels%rowtype;
  v_topup public.mkt_topups%rowtype;
  v_move public.money_moves%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  if not (coalesce(public.kd_account_active(), false) and (public.is_admin() or public.kd_has_permission('action.finance_edit'))) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для записи рекламного расхода';
  end if;
  if p_request_id is null or p_channel_id is null or p_account_id is null or p_spent_on is null then
    raise exception using errcode = '22004', message = 'Для рекламного расхода нужны операция, канал, счёт и дата';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Сумма рекламного расхода должна быть больше нуля';
  end if;

  select * into v_channel from public.mkt_channels where id = p_channel_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Рекламный канал не найден'; end if;

  perform pg_advisory_xact_lock(hashtextextended('marketing_request:' || p_request_id::text, 0));
  select * into v_topup from public.mkt_topups where request_id = p_request_id for update;

  if found then
    if v_topup.channel_id is distinct from p_channel_id
       or v_topup.amount is distinct from p_amount
       or v_topup.topup_date is distinct from p_spent_on
       or v_topup.account_id is distinct from p_account_id
       or v_topup.note is distinct from v_note then
      raise exception using errcode = '23505', message = 'Этот запрос рекламы уже использован с другими данными';
    end if;
  else
    insert into public.mkt_topups (channel_id, amount, topup_date, account_id, note, created_by, request_id)
    values (p_channel_id, p_amount, p_spent_on, p_account_id, v_note, auth.uid(), p_request_id)
    returning * into v_topup;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketing:' || v_topup.id::text, 0));
  select * into v_move
  from public.money_moves
  where source = 'marketing' and ref_id = v_topup.id
  order by created_at, id limit 1 for update;

  if found then
    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_topup.amount
       or v_move.move_date is distinct from p_spent_on then
      raise exception using errcode = '23505', message = 'Рекламный расход не совпадает с движением по счёту';
    end if;
    return v_topup.id;
  end if;

  insert into public.money_moves (account_id, direction, amount, move_date, note, source, ref_id, created_by)
  values (p_account_id, 'expense', v_topup.amount, p_spent_on, 'Реклама: ' || v_channel.name, 'marketing', v_topup.id, auth.uid());
  return v_topup.id;
end
$function$;

create or replace function public.delete_marketing_spend_atomic(p_topup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_channel_id uuid;
  v_topup public.mkt_topups%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
begin
  if not (coalesce(public.kd_account_active(), false) and (public.is_admin() or public.kd_has_permission('action.finance_edit'))) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для удаления рекламного расхода';
  end if;
  if p_topup_id is null then raise exception using errcode = '22004', message = 'Не указан рекламный расход'; end if;

  select channel_id into v_channel_id from public.mkt_topups where id = p_topup_id;
  if not found then return false; end if;
  perform 1 from public.mkt_channels where id = v_channel_id for update;
  select * into v_topup from public.mkt_topups where id = p_topup_id for update;
  if not found then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('marketing:' || p_topup_id::text, 0));
  select count(*) into v_move_count from public.money_moves where source = 'marketing' and ref_id = p_topup_id;
  if v_move_count > 1 or (v_move_count = 0 and v_topup.account_id is not null) then
    raise exception using errcode = '55000', message = 'Рекламный расход не совпадает с движениями по счёту', hint = 'Сначала выполните сверку финансов.';
  end if;
  if v_move_count = 1 then
    select * into v_move from public.money_moves where source = 'marketing' and ref_id = p_topup_id for update;
    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from v_topup.account_id
       or v_move.amount is distinct from v_topup.amount
       or v_move.move_date is distinct from v_topup.topup_date then
      raise exception using errcode = '55000', message = 'Рекламный расход не совпадает с движением по счёту', hint = 'Сначала выполните сверку финансов.';
    end if;
    delete from public.money_moves where id = v_move.id;
  end if;
  delete from public.mkt_topups where id = p_topup_id;
  return true;
end
$function$;

create or replace function public.delete_marketing_channel_atomic(p_channel_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_topup public.mkt_topups%rowtype;
  v_move_count integer;
begin
  if not (coalesce(public.kd_account_active(), false) and (public.is_admin() or public.kd_has_permission('action.finance_edit'))) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для удаления рекламного канала';
  end if;
  if p_channel_id is null then raise exception using errcode = '22004', message = 'Не указан рекламный канал'; end if;

  perform 1 from public.mkt_channels where id = p_channel_id for update;
  if not found then return false; end if;
  perform t.id from public.mkt_topups t where t.channel_id = p_channel_id order by t.id for update;

  for v_topup in select * from public.mkt_topups where channel_id = p_channel_id order by id loop
    perform pg_advisory_xact_lock(hashtextextended('marketing:' || v_topup.id::text, 0));
    select count(*) into v_move_count from public.money_moves where source = 'marketing' and ref_id = v_topup.id;
    if v_move_count > 1 or (v_move_count = 0 and v_topup.account_id is not null) then
      raise exception using errcode = '55000', message = 'Один из рекламных расходов не совпадает с движениями', hint = 'Сначала выполните сверку финансов.';
    end if;
    if v_move_count = 1 and not exists (
      select 1 from public.money_moves m
      where m.source = 'marketing' and m.ref_id = v_topup.id and m.direction = 'expense'
        and m.account_id is not distinct from v_topup.account_id
        and m.amount is not distinct from v_topup.amount
        and m.move_date is not distinct from v_topup.topup_date
    ) then
      raise exception using errcode = '55000', message = 'Один из рекламных расходов не совпадает с движением', hint = 'Сначала выполните сверку финансов.';
    end if;
  end loop;

  delete from public.money_moves
  where source = 'marketing' and ref_id in (select id from public.mkt_topups where channel_id = p_channel_id);
  delete from public.mkt_topups where channel_id = p_channel_id;
  delete from public.mkt_channels where id = p_channel_id;
  return true;
end
$function$;

revoke all on function public.post_marketing_spend_atomic(uuid, uuid, numeric, date, uuid, text) from public, anon;
revoke all on function public.delete_marketing_spend_atomic(uuid) from public, anon;
revoke all on function public.delete_marketing_channel_atomic(uuid) from public, anon;
grant execute on function public.post_marketing_spend_atomic(uuid, uuid, numeric, date, uuid, text) to authenticated, service_role;
grant execute on function public.delete_marketing_spend_atomic(uuid) to authenticated, service_role;
grant execute on function public.delete_marketing_channel_atomic(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('post_marketing_spend_atomic', 'delete_marketing_spend_atomic', 'delete_marketing_channel_atomic');
