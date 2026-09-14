-- =====================================================================
-- Должность, дата приёма и единое сохранение кадровой карточки.
-- Запускать в Supabase -> SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists hired_on date;

comment on column public.profiles.job_title is 'Кадровая должность; не определяет права доступа';
comment on column public.profiles.hired_on is 'Дата приёма на работу';

create or replace function public.save_employee_profile_details(
  p_person_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_role text,
  p_job_title text,
  p_hired_on date,
  p_salary_monthly numeric,
  p_work_schedule text,
  p_cash_opening_balance numeric,
  p_cash_opening_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_person_id uuid;
  v_old_role text;
  v_old_salary numeric;
  v_hired_event uuid;
begin
  if not (coalesce(public.is_admin(), false) or coalesce(public.kd_has_permission('action.team_manage'), false)) then
    raise exception 'Недостаточно прав для изменения кадровой карточки' using errcode = '42501';
  end if;

  v_person_id := p_person_id;
  if v_person_id is null and nullif(trim(p_email), '') is not null then
    select u.id into v_person_id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  end if;
  if v_person_id is null then raise exception 'Сотрудник не найден'; end if;

  select p.role, coalesce(p.salary_monthly, 0)
    into v_old_role, v_old_salary
    from public.profiles p where p.id = v_person_id for update;
  if not found then raise exception 'Профиль сотрудника не найден'; end if;

  if v_old_role <> 'admin' and p_role not in ('tech', 'manager', 'marketer', 'accountant', 'tender', 'curator') then
    raise exception 'Неизвестная роль доступа';
  end if;

  update public.profiles
     set full_name = nullif(trim(p_full_name), ''),
         phone = nullif(trim(p_phone), ''),
         role = case when v_old_role = 'admin' then 'admin' else p_role end,
         job_title = nullif(trim(p_job_title), ''),
         hired_on = p_hired_on,
         salary_monthly = greatest(coalesce(p_salary_monthly, 0), 0),
         work_schedule = nullif(trim(p_work_schedule), ''),
         cash_opening_balance = coalesce(p_cash_opening_balance, 0),
         cash_opening_date = p_cash_opening_date
   where id = v_person_id;

  if p_hired_on is not null then
    select e.id into v_hired_event
      from public.employee_events e
     where e.person_id = v_person_id and e.kind = 'hired'
     order by e.happened_on, e.created_at
     limit 1;
    if v_hired_event is null then
      insert into public.employee_events(person_id, kind, happened_on, note, created_by)
      values (v_person_id, 'hired', p_hired_on, p_job_title, auth.uid());
    else
      update public.employee_events set happened_on = p_hired_on, note = p_job_title where id = v_hired_event;
    end if;
  end if;

  if greatest(coalesce(p_salary_monthly, 0), 0) <> v_old_salary then
    insert into public.employee_events(person_id, kind, happened_on, amount, note, created_by)
    values (v_person_id, 'salary', current_date, greatest(coalesce(p_salary_monthly, 0), 0),
      'Было ' || v_old_salary::text || ' ₸', auth.uid());
  end if;

  if v_old_role <> p_role and v_old_role <> 'admin' then
    insert into public.employee_events(person_id, kind, happened_on, note, created_by)
    values (v_person_id, 'transfer', current_date, v_old_role || ' → ' || p_role, auth.uid());
  end if;

  return v_person_id;
end;
$$;

revoke all on function public.save_employee_profile_details(uuid,text,text,text,text,text,date,numeric,text,numeric,date) from public, anon;
grant execute on function public.save_employee_profile_details(uuid,text,text,text,text,text,date,numeric,text,numeric,date) to authenticated;

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', p.id, 'role', p.role, 'job_title', p.job_title, 'hired_on', p.hired_on,
    'full_name', p.full_name, 'phone', p.phone, 'is_active', p.is_active,
    'access_overrides', coalesce(p.access_overrides, '{}'::jsonb), 'branch_id', p.branch_id
  ) from public.profiles p where p.id = auth.uid() limit 1
$$;

create or replace function public.list_profiles_safe()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid(); v_branch uuid; v_active boolean;
  v_admin boolean; v_finance boolean; v_team boolean; v_jobs boolean;
begin
  select p.branch_id, p.is_active into v_branch, v_active from public.profiles p where p.id = v_actor;
  if not found or v_active is not true then return; end if;
  v_admin := coalesce(public.is_admin(), false);
  v_finance := v_admin or coalesce(public.kd_has_permission('action.finance_edit'), false);
  v_team := v_admin or coalesce(public.kd_has_permission('action.team_manage'), false);
  v_jobs := v_admin or coalesce(public.kd_has_permission('action.jobs_edit'), false);
  return query select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name,
    'phone', case when p.id = v_actor or v_team or v_jobs then p.phone else null end,
    'role', p.role, 'job_title', p.job_title, 'hired_on', p.hired_on,
    'is_active', p.is_active,
    'access_overrides', case when p.id = v_actor or v_team then coalesce(p.access_overrides, '{}'::jsonb) else null end,
    'created_at', p.created_at,
    'cash_opening_balance', case when p.id = v_actor or v_finance then p.cash_opening_balance else null end,
    'cash_opening_date', case when p.id = v_actor or v_finance then p.cash_opening_date else null end,
    'salary_monthly', case when p.id = v_actor or v_finance then p.salary_monthly else null end,
    'work_schedule', p.work_schedule, 'branch_id', p.branch_id
  ) from public.profiles p
  where p.id = v_actor or v_admin or (v_branch is not null and p.branch_id = v_branch and (p.is_active or v_team or v_finance))
  order by p.full_name nulls last, p.id;
end;
$$;

drop trigger if exists kd_changes_profiles on public.profiles;
create trigger kd_changes_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.kd_log_changes(
    'role','job_title','hired_on','is_active','salary_monthly','work_schedule',
    'access_overrides','cash_opening_balance','cash_opening_date');

notify pgrst, 'reload schema';

-- Проверка:
-- select full_name, job_title, hired_on, role, salary_monthly from public.profiles order by full_name;
