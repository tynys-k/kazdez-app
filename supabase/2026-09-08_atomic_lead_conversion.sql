-- Лид, заказ и первый визит создаются как одна операция.
-- Повторный вызов для того же лида возвращает уже созданную заявку.

begin;

alter table public.jobs
  add column if not exists origin_lead_id uuid references public.leads(id) on delete set null;

do $data_check$
begin
  if exists (
    select converted_job_id
      from public.leads
     where converted_job_id is not null
     group by converted_job_id
    having count(*) > 1
  ) then
    raise exception 'Одна заявка связана с несколькими лидами — сначала нужна сверка CRM';
  end if;
end
$data_check$;

update public.jobs j
   set origin_lead_id = l.id
  from public.leads l
 where l.converted_job_id = j.id
   and j.origin_lead_id is null;

create unique index if not exists jobs_origin_lead_id_key
  on public.jobs (origin_lead_id) where origin_lead_id is not null;
create unique index if not exists leads_converted_job_id_key
  on public.leads (converted_job_id) where converted_job_id is not null;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_role(text[])') is null
     or to_regclass('public.orders') is null then
    raise exception 'Required access-control functions or orders table were not found';
  end if;
end
$migration$;

create or replace function public.convert_lead_to_job_atomic(
  p_lead_id uuid,
  p_guarantee_months integer default 6
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_lead public.leads%rowtype;
  v_existing_job_id uuid;
  v_job_id uuid;
  v_order_id uuid;
  v_final_stage_id uuid;
  v_branch_id uuid;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_role(array['admin', 'manager'])
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для создания заявки из лида';
  end if;
  if p_lead_id is null then
    raise exception using errcode = '22004', message = 'Лид не указан';
  end if;
  if p_guarantee_months is null or p_guarantee_months < 0 or p_guarantee_months > 120 then
    raise exception using errcode = '22023', message = 'Некорректный срок гарантии';
  end if;

  select * into v_lead
    from public.leads
   where id = p_lead_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Лид не найден';
  end if;

  -- Точный повтор после обрыва связи не создаёт второй заказ или визит.
  if v_lead.converted_job_id is not null then
    select id into v_existing_job_id
      from public.jobs
     where id = v_lead.converted_job_id
       and origin_lead_id = p_lead_id;
    if v_existing_job_id is null then
      raise exception using errcode = '23503', message = 'Связь лида с заявкой повреждена — нужна сверка';
    end if;
    return v_existing_job_id;
  end if;

  -- Если предыдущая транзакция была выполнена старой версией функции до
  -- обновления лида, восстанавливаем связь вместо создания дубля.
  select id into v_existing_job_id
    from public.jobs
   where origin_lead_id = p_lead_id
   for update;

  select id into v_final_stage_id
    from public.lead_stages
   where is_final = true
     and coalesce(is_lost, false) = false
   order by sort nulls last, id
   limit 1;

  if v_existing_job_id is not null then
    update public.leads
       set converted_job_id = v_existing_job_id,
           stage_id = coalesce(v_final_stage_id, v_lead.stage_id),
           updated_at = now()
     where id = p_lead_id;
    return v_existing_job_id;
  end if;

  select p.branch_id into v_branch_id
    from public.profiles p
   where p.id = auth.uid();
  if v_branch_id is null then
    select b.id into v_branch_id
      from public.branches b
     order by b.is_default desc nulls last, b.created_at, b.id
     limit 1;
  end if;

  insert into public.orders (
    address, client_phone, contact_name, branch_id,
    status, opened_on, created_by
  ) values (
    nullif(btrim(v_lead.address), ''), nullif(btrim(v_lead.phone), ''),
    nullif(btrim(v_lead.name), ''), v_branch_id,
    'open', null, auth.uid()
  ) returning id into v_order_id;

  insert into public.jobs (
    type, scheduled_date, address, source, client_phone, brand,
    guarantee_months, pest, price_options, note, created_by,
    branch_id, order_id, visit_no, visit_kind, work_stage, origin_lead_id
  ) values (
    'Первичная', null, coalesce(v_lead.address, ''), coalesce(v_lead.source, ''),
    coalesce(nullif(btrim(v_lead.phone), ''), '+7 '), 'KazDez',
    p_guarantee_months, '', '[]'::jsonb,
    case when nullif(btrim(v_lead.name), '') is not null then 'Клиент: ' || btrim(v_lead.name) else null end,
    auth.uid(), v_branch_id, v_order_id, 1, 'primary', 'new', p_lead_id
  ) returning id into v_job_id;

  update public.orders set root_job_id = v_job_id where id = v_order_id;
  update public.leads
     set converted_job_id = v_job_id,
         stage_id = coalesce(v_final_stage_id, v_lead.stage_id),
         updated_at = now()
   where id = p_lead_id;

  return v_job_id;
end
$function$;

revoke all on function public.convert_lead_to_job_atomic(uuid, integer) from public, anon;
grant execute on function public.convert_lead_to_job_atomic(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'convert_lead_to_job_atomic';
