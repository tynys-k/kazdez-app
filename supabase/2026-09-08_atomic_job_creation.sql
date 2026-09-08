-- Обычная заявка, объект и заказ создаются одной транзакцией.
-- Устойчивый request_id защищает от дубля после обрыва связи или повторного клика.

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regprocedure('public.kd_address_key(text)') is null
     or to_regclass('public.jobs') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.objects') is null then
    raise exception 'Required access-control functions, jobs, orders or objects were not found';
  end if;
end
$migration$;

alter table public.jobs add column if not exists creation_request_id uuid;

create unique index if not exists jobs_creation_request_key
  on public.jobs (creation_request_id)
  where creation_request_id is not null;

create or replace function public.create_job_atomic(
  p_request_id uuid,
  p_job jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_input public.jobs%rowtype;
  v_existing_id uuid;
  v_object_id uuid;
  v_order_id uuid;
  v_job_id uuid;
  v_branch_id uuid;
  v_address_key text;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.jobs_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для создания заявки';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22004', message = 'Номер попытки создания заявки обязателен';
  end if;
  if p_job is null or jsonb_typeof(p_job) <> 'object' then
    raise exception using errcode = '22023', message = 'Некорректные данные заявки';
  end if;

  -- Один request_id сериализуется даже при двух одновременных запросах.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select id into v_existing_id
    from public.jobs
   where creation_request_id = p_request_id
   limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  begin
    v_input := jsonb_populate_record(null::public.jobs, p_job);
  exception when others then
    raise exception using errcode = '22023', message = 'Одно из полей заявки заполнено неверно';
  end;

  v_input.address := nullif(btrim(v_input.address), '');
  v_input.client_phone := nullif(btrim(v_input.client_phone), '');
  v_input.pest := nullif(btrim(v_input.pest), '');
  if v_input.address is null then
    raise exception using errcode = '22023', message = 'Укажите адрес';
  end if;
  if v_input.pest is null then
    raise exception using errcode = '22023', message = 'Укажите вид работ';
  end if;
  if length(regexp_replace(coalesce(v_input.client_phone, ''), '\D', '', 'g')) < 10 then
    raise exception using errcode = '22023', message = 'Укажите корректный телефон клиента';
  end if;
  if v_input.area is not null and v_input.area < 0 then
    raise exception using errcode = '22023', message = 'Площадь не может быть отрицательной';
  end if;
  if coalesce(v_input.guarantee_months, 0) < 0 then
    raise exception using errcode = '22023', message = 'Срок гарантии не может быть отрицательным';
  end if;
  if coalesce(v_input.pricing_mode, 'quoted') not in ('quoted', 'on_site_estimate') then
    raise exception using errcode = '22023', message = 'Некорректный режим цены';
  end if;
  if v_input.pricing_mode = 'on_site_estimate' then
    v_input.quoted_price := null;
    v_input.price_options := '[]'::jsonb;
  elsif coalesce(v_input.type, '') <> 'Осмотр' and (
    jsonb_typeof(coalesce(v_input.price_options, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(v_input.price_options, '[]'::jsonb)) = 0
  ) then
    raise exception using errcode = '22023', message = 'Укажите стоимость или выберите оценку на месте';
  end if;

  v_branch_id := v_input.branch_id;
  if v_branch_id is null then
    select branch_id into v_branch_id from public.profiles where id = auth.uid();
  end if;
  if v_branch_id is null then
    select id into v_branch_id
      from public.branches
     order by is_default desc nulls last, created_at, id
     limit 1;
  end if;
  if v_branch_id is null then
    raise exception using errcode = '22023', message = 'Не найден филиал для заявки';
  end if;

  v_address_key := public.kd_address_key(v_input.address);
  if v_address_key is null then
    raise exception using errcode = '22023', message = 'Адрес не содержит распознаваемого названия или номера';
  end if;
  insert into public.objects (address_key, address, area, updated_at)
  values (v_address_key, v_input.address, v_input.area, now())
  on conflict (address_key) do update
    set address = excluded.address,
        area = coalesce(excluded.area, objects.area),
        updated_at = now()
  returning id into v_object_id;

  insert into public.orders (
    address, object_id, client_phone, contact_name, branch_id,
    agreed_price, status, opened_on, created_by
  ) values (
    v_input.address, v_object_id, v_input.client_phone, v_input.contact_name,
    v_branch_id, v_input.quoted_price, 'open', v_input.scheduled_date, auth.uid()
  ) returning id into v_order_id;

  insert into public.jobs (
    type, scheduled_date, scheduled_time, address, floor, area, source, pest,
    price_options, quoted_price, pricing_mode, client_phone, contact_name,
    extra_contacts, guarantee_months, brand, partner_id, partner_share, note,
    assigned_to, executor_partner_id, executor_share_pct, joint_work,
    joint_supplier, joint_cost_share, partner_comp, status, work_stage,
    object_id, branch_id, order_id, visit_no, visit_kind, created_by,
    creation_request_id
  ) values (
    coalesce(v_input.type, 'Первичная'), v_input.scheduled_date,
    coalesce(v_input.scheduled_time, ''), v_input.address, v_input.floor,
    v_input.area, v_input.source, v_input.pest,
    coalesce(v_input.price_options, '[]'::jsonb), v_input.quoted_price,
    coalesce(v_input.pricing_mode, 'quoted'), v_input.client_phone,
    v_input.contact_name, coalesce(v_input.extra_contacts, '[]'::jsonb),
    coalesce(v_input.guarantee_months, 6), coalesce(v_input.brand, 'KazDez'),
    v_input.partner_id, v_input.partner_share, v_input.note, v_input.assigned_to,
    v_input.executor_partner_id, v_input.executor_share_pct,
    coalesce(v_input.joint_work, false), coalesce(v_input.joint_supplier, 'us'),
    v_input.joint_cost_share, v_input.partner_comp,
    case when v_input.assigned_to is null then 'new' else 'assigned' end,
    case when v_input.assigned_to is null then 'new' else 'assigned' end,
    v_object_id, v_branch_id, v_order_id, 1, 'primary', auth.uid(), p_request_id
  ) returning id into v_job_id;

  update public.orders set root_job_id = v_job_id where id = v_order_id;
  return v_job_id;
end
$function$;

revoke all on function public.create_job_atomic(uuid, jsonb) from public, anon;
grant execute on function public.create_job_atomic(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'create_job_atomic';
