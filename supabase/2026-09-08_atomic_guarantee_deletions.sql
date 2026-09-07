-- Атомарное удаление тендерного обеспечения и его возвратов.
-- Перед удалением сервер сверяет связанные движения денег; любая ошибка откатывает всю операцию.
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

create or replace function public.delete_tender_guarantee_return_atomic(p_return_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_guarantee_id uuid;
  v_return public.guarantee_returns%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.tenders_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для удаления возврата';
  end if;
  if p_return_id is null then
    raise exception using errcode = '22004', message = 'Не указан возврат обеспечения';
  end if;

  select guarantee_id into v_guarantee_id
  from public.guarantee_returns
  where id = p_return_id;
  if not found then return false; end if;

  perform 1 from public.tender_guarantees
  where id = v_guarantee_id
  for update;

  select * into v_return
  from public.guarantee_returns
  where id = p_return_id
  for update;
  if not found then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('tender_return:' || p_return_id::text, 0));

  select count(*) into v_move_count
  from public.money_moves
  where source = 'tender_return' and ref_id = p_return_id;

  if v_move_count > 1 or (v_move_count = 0 and v_return.account_id is not null) then
    raise exception using
      errcode = '55000',
      message = 'Возврат не совпадает с движениями по счёту',
      hint = 'Сначала выполните сверку финансов.';
  end if;

  if v_move_count = 1 then
    select * into v_move
    from public.money_moves
    where source = 'tender_return' and ref_id = p_return_id
    for update;

    if v_move.direction <> 'income'
       or v_move.account_id is distinct from v_return.account_id
       or v_move.amount is distinct from v_return.amount
       or v_move.move_date is distinct from v_return.return_date then
      raise exception using
        errcode = '55000',
        message = 'Возврат не совпадает с движением по счёту',
        hint = 'Сначала выполните сверку финансов.';
    end if;
    delete from public.money_moves where id = v_move.id;
  end if;

  delete from public.guarantee_returns where id = p_return_id;
  return true;
end
$function$;

create or replace function public.delete_tender_guarantee_atomic(p_guarantee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_guarantee public.tender_guarantees%rowtype;
  v_return public.guarantee_returns%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.tenders_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для удаления обеспечения';
  end if;
  if p_guarantee_id is null then
    raise exception using errcode = '22004', message = 'Не указано тендерное обеспечение';
  end if;

  select * into v_guarantee
  from public.tender_guarantees
  where id = p_guarantee_id
  for update;
  if not found then return false; end if;

  perform r.id
  from public.guarantee_returns r
  where r.guarantee_id = p_guarantee_id
  order by r.id
  for update;

  perform pg_advisory_xact_lock(hashtextextended('tender_pledge:' || p_guarantee_id::text, 0));

  select count(*) into v_move_count
  from public.money_moves
  where source = 'tender_pledge' and ref_id = p_guarantee_id;

  if v_move_count > 1 or (v_move_count = 0 and v_guarantee.paid and v_guarantee.account_id is not null) then
    raise exception using
      errcode = '55000',
      message = 'Обеспечение не совпадает с движениями по счёту',
      hint = 'Сначала выполните сверку финансов.';
  end if;

  if v_move_count = 1 then
    select * into v_move
    from public.money_moves
    where source = 'tender_pledge' and ref_id = p_guarantee_id
    for update;

    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from v_guarantee.account_id
       or v_move.amount is distinct from v_guarantee.amount
       or v_move.move_date is distinct from v_guarantee.paid_date then
      raise exception using
        errcode = '55000',
        message = 'Обеспечение не совпадает с движением по счёту',
        hint = 'Сначала выполните сверку финансов.';
    end if;
  end if;

  for v_return in
    select * from public.guarantee_returns
    where guarantee_id = p_guarantee_id
    order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended('tender_return:' || v_return.id::text, 0));

    select count(*) into v_move_count
    from public.money_moves
    where source = 'tender_return' and ref_id = v_return.id;

    if v_move_count > 1 or (v_move_count = 0 and v_return.account_id is not null) then
      raise exception using
        errcode = '55000',
        message = 'Один из возвратов не совпадает с движениями по счёту',
        hint = 'Сначала выполните сверку финансов.';
    end if;

    if v_move_count = 1 and not exists (
      select 1 from public.money_moves m
      where m.source = 'tender_return'
        and m.ref_id = v_return.id
        and m.direction = 'income'
        and m.account_id is not distinct from v_return.account_id
        and m.amount is not distinct from v_return.amount
        and m.move_date is not distinct from v_return.return_date
    ) then
      raise exception using
        errcode = '55000',
        message = 'Один из возвратов не совпадает с движением по счёту',
        hint = 'Сначала выполните сверку финансов.';
    end if;
  end loop;

  delete from public.money_moves
  where source = 'tender_return'
    and ref_id in (select id from public.guarantee_returns where guarantee_id = p_guarantee_id);
  delete from public.guarantee_returns where guarantee_id = p_guarantee_id;
  delete from public.money_moves where source = 'tender_pledge' and ref_id = p_guarantee_id;
  delete from public.tender_guarantees where id = p_guarantee_id;
  return true;
end
$function$;

revoke all on function public.delete_tender_guarantee_return_atomic(uuid) from public, anon;
revoke all on function public.delete_tender_guarantee_atomic(uuid) from public, anon;
grant execute on function public.delete_tender_guarantee_return_atomic(uuid) to authenticated, service_role;
grant execute on function public.delete_tender_guarantee_atomic(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения:
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('delete_tender_guarantee_return_atomic', 'delete_tender_guarantee_atomic');
