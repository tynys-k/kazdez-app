-- Кадровая карточка хантера: save_employee_profile_details держит свой список
-- ролей и отклонял «hunter» с ошибкой «Неизвестная роль доступа».
-- Тело функции — как в живой базе (2026-09-14_employee_hr_fields.sql), изменён
-- только список ролей. Он должен совпадать с profiles_role_kazdez_check.

begin;

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
as $function$
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

  if v_old_role <> 'admin' and p_role not in ('tech', 'manager', 'marketer', 'accountant', 'tender', 'curator', 'hunter') then
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
$function$;

notify pgrst, 'reload schema';
commit;
