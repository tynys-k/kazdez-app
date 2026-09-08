-- Повторные и контрольные выезды создаются с серверным номером внутри заказа.
-- Блокировка заказа исключает дубли номеров при одновременной работе менеджеров.

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regclass('public.jobs') is null
     or to_regclass('public.orders') is null then
    raise exception 'Required access-control functions, jobs or orders were not found';
  end if;
end
$migration$;

alter table public.jobs add column if not exists visit_request_id uuid;

do $data_check$
begin
  if exists (
    select order_id, visit_no
      from public.jobs
     where order_id is not null and visit_no is not null
     group by order_id, visit_no
    having count(*) > 1
  ) then
    raise exception 'В одном заказе найдены одинаковые номера визитов — сначала нужна сверка';
  end if;
  if exists (
    select repeat_of
      from public.jobs
     where repeat_of is not null
       and visit_kind = 'guarantee'
       and coalesce(status, '') <> 'canceled'
     group by repeat_of
    having count(*) > 1
  ) then
    raise exception 'Для одной заявки найдено несколько действующих гарантийных выездов — сначала нужна сверка';
  end if;
end
$data_check$;

create unique index if not exists jobs_order_visit_no_key
  on public.jobs (order_id, visit_no)
  where order_id is not null and visit_no is not null;

create unique index if not exists jobs_visit_request_key
  on public.jobs (visit_request_id)
  where visit_request_id is not null;

create unique index if not exists jobs_repeat_origin_active_key
  on public.jobs (repeat_of)
  where repeat_of is not null
    and visit_kind = 'guarantee'
    and coalesce(status, '') <> 'canceled';

create or replace function public.create_order_visit_atomic(
  p_origin_job_id uuid,
  p_kind text,
  p_request_id uuid default null,
  p_scheduled_date date default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_origin public.jobs%rowtype;
  v_existing_id uuid;
  v_job_id uuid;
  v_visit_no integer;
  v_note text;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.jobs_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для создания выезда';
  end if;
  if p_origin_job_id is null or p_kind not in ('control', 'guarantee') then
    raise exception using errcode = '22023', message = 'Некорректный вид выезда';
  end if;
  if p_kind = 'control' and p_request_id is null then
    raise exception using errcode = '22004', message = 'Номер попытки контрольного выезда обязателен';
  end if;
  v_note := nullif(btrim(p_note), '');
  if length(coalesce(v_note, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Комментарий слишком длинный';
  end if;

  select * into v_origin
    from public.jobs
   where id = p_origin_job_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Исходная заявка не найдена';
  end if;
  if v_origin.order_id is null then
    raise exception using errcode = '22023', message = 'У исходной заявки нет заказа';
  end if;

  -- Все новые номера внутри заказа выдаются строго по очереди.
  perform 1 from public.orders where id = v_origin.order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Заказ исходной заявки не найден';
  end if;

  if p_kind = 'guarantee' then
    select id into v_existing_id
      from public.jobs
     where repeat_of = p_origin_job_id
       and visit_kind = 'guarantee'
       and coalesce(status, '') <> 'canceled'
     order by created_at, id
     limit 1;
    if v_existing_id is not null then
      update public.jobs set repeat_state = 'finished' where id = p_origin_job_id;
      return v_existing_id;
    end if;
    if v_origin.status <> 'done' or coalesce(v_origin.repeat_state, '') <> 'on_repeat' then
      raise exception using errcode = '22023', message = 'Исходная заявка не ожидает повторного выезда';
    end if;
  else
    select id into v_existing_id
      from public.jobs
     where visit_request_id = p_request_id
     limit 1;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  select coalesce(max(visit_no), 0) + 1 into v_visit_no
    from public.jobs
   where order_id = v_origin.order_id;

  insert into public.jobs (
    type, scheduled_date, scheduled_time, address, floor, area, source, pest,
    price_options, client_phone, contact_name, guarantee_months, status,
    repeat_of, object_id, branch_id, order_id, visit_no, visit_kind, note,
    created_by, work_stage, visit_request_id
  ) values (
    case when p_kind = 'guarantee' then 'Вторичная' else 'Плановая' end,
    case when p_kind = 'control' then p_scheduled_date else null end,
    '', v_origin.address, v_origin.floor, v_origin.area, v_origin.source,
    v_origin.pest,
    case when p_kind = 'guarantee' then v_origin.price_options
      else jsonb_build_array(jsonb_build_object('label', 'Входит в заказ', 'amount', 0)) end,
    v_origin.client_phone, v_origin.contact_name, v_origin.guarantee_months, 'new',
    case when p_kind = 'guarantee' then p_origin_job_id else null end,
    v_origin.object_id, v_origin.branch_id, v_origin.order_id, v_visit_no,
    p_kind, v_note, auth.uid(), 'new',
    case when p_kind = 'control' then p_request_id else null end
  ) returning id into v_job_id;

  if p_kind = 'guarantee' then
    update public.jobs set repeat_state = 'finished' where id = p_origin_job_id;
  end if;

  return v_job_id;
end
$function$;

revoke all on function public.create_order_visit_atomic(uuid, text, uuid, date, text) from public, anon;
grant execute on function public.create_order_visit_atomic(uuid, text, uuid, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'create_order_visit_atomic';
