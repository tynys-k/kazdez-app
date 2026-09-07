-- =====================================================================
-- Безопасная выдача профиля и списка сотрудников.
--
-- ЭТАП 1 ИЗ 2. Этот файл сначала добавляет безопасные RPC, не отключая старый
-- клиент. После публикации новой версии приложения выполнить второй файл:
-- 2026-09-07_profile_privacy_lockdown.sql.
--
-- Обычному сотруднику сервер больше не отдаёт оклады, кассовые остатки и
-- персональные настройки доступа коллег. Список ограничен его филиалом.
-- =====================================================================

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p.id,
    'role', p.role,
    'full_name', p.full_name,
    'phone', p.phone,
    'is_active', p.is_active,
    'access_overrides', coalesce(p.access_overrides, '{}'::jsonb),
    'branch_id', p.branch_id
  )
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

create or replace function public.list_profiles_safe()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_branch uuid;
  v_active boolean;
  v_admin boolean;
  v_finance boolean;
  v_team boolean;
  v_jobs boolean;
begin
  select p.branch_id, p.is_active
    into v_branch, v_active
    from public.profiles p
   where p.id = v_actor;

  if not found or v_active is not true then
    return;
  end if;

  v_admin := coalesce(public.is_admin(), false);
  v_finance := v_admin or coalesce(public.kd_has_permission('action.finance_edit'), false);
  v_team := v_admin or coalesce(public.kd_has_permission('action.team_manage'), false);
  v_jobs := v_admin or coalesce(public.kd_has_permission('action.jobs_edit'), false);

  return query
  select jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'phone', case when p.id = v_actor or v_team or v_jobs then p.phone else null end,
    'role', p.role,
    'is_active', p.is_active,
    'access_overrides', case when p.id = v_actor or v_team then coalesce(p.access_overrides, '{}'::jsonb) else null end,
    'created_at', p.created_at,
    'cash_opening_balance', case when p.id = v_actor or v_finance then p.cash_opening_balance else null end,
    'cash_opening_date', case when p.id = v_actor or v_finance then p.cash_opening_date else null end,
    'salary_monthly', case when p.id = v_actor or v_finance then p.salary_monthly else null end,
    'work_schedule', p.work_schedule,
    'branch_id', p.branch_id
  )
  from public.profiles p
  where p.id = v_actor
     or v_admin
     or (v_branch is not null and p.branch_id = v_branch and (p.is_active or v_team or v_finance))
  order by p.full_name nulls last, p.id;
end;
$$;

revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.list_profiles_safe() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.list_profiles_safe() to authenticated;

notify pgrst, 'reload schema';

-- Проверка:
-- select routine_name from information_schema.routines
--  where routine_schema = 'public'
--    and routine_name in ('get_my_profile', 'list_profiles_safe');
