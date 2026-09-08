-- Плановый заказ, первый визит и перенос даты договора создаются вместе.
-- Ожидаемая дата цикла защищает от двойного клика и повторной отправки.

begin;

alter table public.jobs add column if not exists contract_cycle_date date;

update public.jobs
   set contract_cycle_date = scheduled_date
 where service_contract_id is not null
   and contract_cycle_date is null
   and scheduled_date is not null;

do $data_check$
begin
  if exists (
    select service_contract_id, contract_cycle_date
      from public.jobs
     where service_contract_id is not null
       and contract_cycle_date is not null
       and coalesce(status, '') <> 'canceled'
     group by service_contract_id, contract_cycle_date
    having count(*) > 1
  ) then
    raise exception 'По одной дате договора найдено несколько действующих заявок — сначала нужна сверка';
  end if;
end
$data_check$;

create unique index if not exists jobs_contract_cycle_active_key
  on public.jobs (service_contract_id, contract_cycle_date)
  where service_contract_id is not null
    and contract_cycle_date is not null
    and coalesce(status, '') <> 'canceled';

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regclass('public.orders') is null
     or to_regclass('public.service_contracts') is null then
    raise exception 'Required access-control functions, orders or service_contracts were not found';
  end if;
end
$migration$;

create or replace function public.create_contract_visit_atomic(
  p_contract_id uuid,
  p_expected_service_date date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_contract public.service_contracts%rowtype;
  v_existing_job_id uuid;
  v_job_id uuid;
  v_order_id uuid;
  v_branch_id uuid;
  v_interval integer;
  v_price numeric;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.jobs_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для создания планового выезда';
  end if;
  if p_contract_id is null or p_expected_service_date is null then
    raise exception using errcode = '22004', message = 'Договор и дата обслуживания обязательны';
  end if;

  select * into v_contract
    from public.service_contracts
   where id = p_contract_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Договор не найден';
  end if;
  if coalesce(v_contract.active, true) = false then
    raise exception using errcode = '22023', message = 'Договор приостановлен';
  end if;

  v_interval := coalesce(v_contract.interval_days, 30);
  v_price := coalesce(v_contract.price, 0);
  if v_interval <= 0 or v_interval > 3660 then
    raise exception using errcode = '22023', message = 'Некорректная периодичность договора';
  end if;
  if v_price < 0 then
    raise exception using errcode = '22023', message = 'Стоимость выезда не может быть отрицательной';
  end if;

  -- Точный повтор возвращает заявку именно запрошенного цикла. Проверка
  -- выполняется после блокировки договора, поэтому два клика не создадут
  -- одновременно текущий и следующий выезд.
  select id into v_existing_job_id
    from public.jobs
   where service_contract_id = p_contract_id
     and contract_cycle_date = p_expected_service_date
     and coalesce(status, '') <> 'canceled'
   order by created_at, id
   limit 1
   for update;

  if v_existing_job_id is not null then
    if v_contract.next_service_date = p_expected_service_date then
      update public.service_contracts
         set last_generated_date = p_expected_service_date,
             next_service_date = p_expected_service_date + v_interval,
             updated_at = now()
       where id = p_contract_id;
    end if;
    return v_existing_job_id;
  end if;

  if v_contract.next_service_date is distinct from p_expected_service_date then
    raise exception using errcode = '23505', message = 'Дата договора уже изменилась — обновите страницу перед созданием выезда';
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
    address, client_phone, contact_name, branch_id, agreed_price,
    status, opened_on, created_by
  ) values (
    nullif(btrim(v_contract.address), ''), nullif(btrim(v_contract.phone), ''),
    nullif(btrim(v_contract.client_name), ''), v_branch_id, v_price,
    'open', p_expected_service_date, auth.uid()
  ) returning id into v_order_id;

  insert into public.jobs (
    type, scheduled_date, scheduled_time, address, source, pest,
    price_options, quoted_price, client_phone, contact_name,
    guarantee_months, status, service_contract_id, contract_cycle_date,
    created_by, branch_id, order_id, visit_no, visit_kind, work_stage
  ) values (
    'Плановая', p_expected_service_date, '', coalesce(v_contract.address, ''),
    'Абонентский договор', coalesce(v_contract.service, ''),
    jsonb_build_array(jsonb_build_object('label', 'Абонентское обслуживание', 'amount', v_price)),
    v_price, coalesce(nullif(btrim(v_contract.phone), ''), '+7 '),
    nullif(btrim(v_contract.client_name), ''), 0, 'new', p_contract_id,
    p_expected_service_date, auth.uid(), v_branch_id, v_order_id, 1, 'contract', 'new'
  ) returning id into v_job_id;

  update public.orders set root_job_id = v_job_id where id = v_order_id;
  update public.service_contracts
     set last_generated_date = p_expected_service_date,
         next_service_date = p_expected_service_date + v_interval,
         updated_at = now()
   where id = p_contract_id;

  return v_job_id;
end
$function$;

revoke all on function public.create_contract_visit_atomic(uuid, date) from public, anon;
grant execute on function public.create_contract_visit_atomic(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'create_contract_visit_atomic';
