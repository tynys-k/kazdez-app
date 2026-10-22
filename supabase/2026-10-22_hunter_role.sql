-- Роль «Хантер»: отдельный вход, только вкладка «Лиды» и только свои сделки.
-- Менеджеры и админ по-прежнему видят всю воронку. Ограничение держит база:
-- ограничивающие (restrictive) политики складываются с существующими по «И»,
-- поэтому хантер не увидит чужой лид, даже имея tab.leads.

begin;

do $dependencies$
begin
  if to_regclass('public.leads') is null
     or to_regprocedure('public.kd_has_role(text[])') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regprocedure('public.kd_phone_key(text)') is null
     or to_regprocedure('public.kd_lead_stage_missing(public.leads,text)') is null then
    raise exception 'Сначала примените миграцию воронки 2026-10-18_hunter_funnel.sql: роль не была добавлена';
  end if;
end
$dependencies$;

-- 1. Роль в профиле.
alter table public.profiles drop constraint if exists profiles_role_kazdez_check;
alter table public.profiles add constraint profiles_role_kazdez_check
  check (role = any (array['admin', 'tech', 'manager', 'marketer', 'accountant', 'tender', 'curator', 'hunter']));

-- 2. Права хантера: только вкладка «Лиды» и работа с лидами.
create or replace function public.kd_has_permission(permission_key text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare p public.profiles%rowtype; allowed boolean := false;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or not p.is_active then return false; end if;
  if p.role = 'admin' then return true; end if;

  allowed := case p.role
    when 'tech' then permission_key = any(array['tab.today','tab.jobs','tab.done','tab.tasks','tab.cash','tab.materials','tab.knowledge','tab.myequip','data.stock_self','data.equipment'])
    when 'manager' then permission_key = any(array['tab.today','tab.jobs','tab.schedule','tab.done','tab.canceled','tab.routes','tab.tasks','action.tasks_manage','action.jobs_edit','tab.leads','action.leads_edit','tab.repeats','tab.retention','tab.subscriptions','tab.partners','action.partners_edit','tab.materials','tab.knowledge'])
    when 'marketer' then permission_key = any(array['tab.today','tab.leads','action.leads_edit','tab.retention','tab.growth','tab.materials','tab.knowledge','tab.tasks'])
    when 'accountant' then permission_key = any(array['tab.today','tab.finance','tab.opex','tab.cash','tab.docs','action.docs_edit','tab.tasks','action.finance_edit','tab.materials'])
    when 'tender' then permission_key = any(array['tab.today','tab.tenders','action.tenders_edit','tab.docs','action.docs_edit','tab.tasks','action.tasks_manage','tab.materials','tab.knowledge'])
    when 'curator' then permission_key = any(array['tab.today','tab.jobs','tab.schedule','tab.done','tab.canceled','tab.routes','tab.tasks','action.tasks_manage','action.jobs_edit','tab.retention','action.leads_edit','tab.team','tab.stock','data.stock_self','data.equipment','tab.materials','tab.knowledge'])
    when 'hunter' then permission_key = any(array['tab.leads','action.leads_edit'])
    else false end;

  if p.access_overrides ? permission_key then
    allowed := coalesce((p.access_overrides ->> permission_key)::boolean, allowed);
  end if;
  return allowed;
end $function$;

create or replace function public.kd_is_hunter()
returns boolean
language sql
stable security definer
set search_path = pg_catalog, public
as $function$
  select coalesce(public.kd_has_role(array['hunter']), false)
$function$;

revoke all on function public.kd_is_hunter() from public, anon;
grant execute on function public.kd_is_hunter() to authenticated, service_role;

-- 3. Хантер видит и меняет только свои лиды, не передаёт их другим и не удаляет.
drop policy if exists leads_hunter_own on public.leads;
create policy leads_hunter_own on public.leads
  as restrictive for all to authenticated
  using (not public.kd_is_hunter() or owner_id = auth.uid())
  with check (not public.kd_is_hunter() or owner_id = auth.uid());

drop policy if exists leads_hunter_no_delete on public.leads;
create policy leads_hunter_no_delete on public.leads
  as restrictive for delete to authenticated
  using (not public.kd_is_hunter());

-- Стадии воронки хантер только читает.
drop policy if exists lead_stages_hunter_insert on public.lead_stages;
create policy lead_stages_hunter_insert on public.lead_stages
  as restrictive for insert to authenticated with check (not public.kd_is_hunter());
drop policy if exists lead_stages_hunter_update on public.lead_stages;
create policy lead_stages_hunter_update on public.lead_stages
  as restrictive for update to authenticated using (not public.kd_is_hunter());
drop policy if exists lead_stages_hunter_delete on public.lead_stages;
create policy lead_stages_hunter_delete on public.lead_stages
  as restrictive for delete to authenticated using (not public.kd_is_hunter());

-- История — только по своим сделкам.
drop policy if exists lead_activities_hunter_own on public.lead_activities;
create policy lead_activities_hunter_own on public.lead_activities
  for select to authenticated
  using (public.kd_is_hunter() and exists (
    select 1 from public.leads l where l.id = lead_id and l.owner_id = auth.uid()
  ));

-- Из справочника клиентов — только юрлица своих сделок.
drop policy if exists clients_hunter_own_companies on public.clients;
create policy clients_hunter_own_companies on public.clients
  for select to authenticated
  using (public.kd_is_hunter() and exists (
    select 1 from public.leads l where l.company_id = clients.id and l.owner_id = auth.uid()
  ));

-- 4. Юрлицо для договора: находим по БИН или телефону, иначе создаём,
-- и сразу привязываем к сделке. Так хантер не видит чужих клиентов.
create or replace function public.create_lead_company(
  p_lead_id uuid,
  p_legal_name text,
  p_bin text,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_lead public.leads%rowtype;
  v_client_id uuid;
  v_name text := nullif(btrim(coalesce(p_legal_name, '')), '');
  v_bin text := nullif(regexp_replace(coalesce(p_bin, ''), '\D', '', 'g'), '');
  v_phone_key text := nullif(public.kd_phone_key(coalesce(p_phone, '')), '');
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_role(array['admin', 'manager', 'hunter'])
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для работы с лидами';
  end if;
  if v_name is null then
    raise exception using errcode = '22004', message = 'Укажи название юрлица';
  end if;
  if v_bin is null or length(v_bin) <> 12 then
    raise exception using errcode = '22023', message = 'БИН — 12 цифр';
  end if;
  if v_phone_key is null or length(v_phone_key) < 10 then
    raise exception using errcode = '22023', message = 'Укажи телефон юрлица';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Лид не найден';
  end if;
  if public.kd_is_hunter() and v_lead.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Это сделка другого сотрудника';
  end if;

  select c.id into v_client_id from public.clients c where c.bin_iin = v_bin order by c.updated_at desc nulls last limit 1;
  if v_client_id is null then
    select c.id into v_client_id from public.clients c where c.phone_key = v_phone_key;
  end if;
  if v_client_id is null then
    insert into public.clients (phone_key, phone, name, client_type, legal_name, bin_iin)
    values (v_phone_key, btrim(p_phone), v_name, 'company', v_name, v_bin)
    returning id into v_client_id;
  end if;

  update public.leads set company_id = v_client_id, updated_at = now() where id = p_lead_id;
  return v_client_id;
end
$function$;

revoke all on function public.create_lead_company(uuid, text, text, text) from public, anon;
grant execute on function public.create_lead_company(uuid, text, text, text) to authenticated, service_role;

-- 5. Касание, история и заявка — хантеру только по своим сделкам.
create or replace function public.touch_lead_atomic(
  p_lead_id uuid,
  p_next_action text,
  p_next_action_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_lead public.leads%rowtype;
  v_is_final boolean := false;
  v_is_lost boolean := false;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_role(array['admin', 'manager', 'hunter'])
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для работы с лидами';
  end if;
  if p_lead_id is null or nullif(btrim(p_next_action), '') is null or p_next_action_at is null then
    raise exception using errcode = '22004', message = 'Укажи следующий шаг и его срок';
  end if;
  if p_next_action_at <= now() then
    raise exception using errcode = '22023', message = 'Следующий шаг должен быть назначен на будущее';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Лид не найден';
  end if;
  -- Хантер работает только со своими сделками.
  if public.kd_is_hunter() and v_lead.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Это сделка другого сотрудника';
  end if;
  if v_lead.stage_id is not null then
    select coalesce(s.is_final, false), coalesce(s.is_lost, false)
      into v_is_final, v_is_lost
      from public.lead_stages s where s.id = v_lead.stage_id;
  end if;
  if v_is_final or v_is_lost then
    raise exception using errcode = '55000', message = 'Закрытому лиду нельзя назначить следующее касание';
  end if;

  update public.leads
     set first_response_at = coalesce(first_response_at, now()),
         owner_id = coalesce(owner_id, auth.uid()),
         next_action = btrim(p_next_action),
         next_action_at = p_next_action_at,
         updated_at = now()
   where id = p_lead_id;

  return p_lead_id;
end
$function$;

revoke all on function public.touch_lead_atomic(uuid, text, timestamptz) from public, anon;
grant execute on function public.touch_lead_atomic(uuid, text, timestamptz) to authenticated, service_role;

create or replace function public.record_lead_activity_atomic(
  p_lead_id uuid,
  p_kind text,
  p_outcome text,
  p_comment text,
  p_occurred_at timestamptz,
  p_next_action text,
  p_next_action_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_lead public.leads%rowtype;
  v_activity_id uuid;
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_is_closed boolean := false;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_role(array['admin', 'manager', 'hunter'])
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для работы с лидами';
  end if;
  if p_lead_id is null then
    raise exception using errcode = '22004', message = 'Лид не указан';
  end if;
  if v_kind not in ('call', 'whatsapp', 'message', 'meeting', 'note') then
    raise exception using errcode = '22023', message = 'Выбери способ общения';
  end if;
  if (v_kind = 'note' and v_outcome <> 'note')
     or (v_kind <> 'note' and v_outcome not in ('connected', 'no_answer', 'interested', 'proposal_sent', 'thinking', 'agreed', 'refused')) then
    raise exception using errcode = '22023', message = 'Выбери результат общения';
  end if;
  if v_comment is null and not (v_kind <> 'note' and v_outcome = 'no_answer') then
    raise exception using errcode = '22004', message = 'Напиши, что обсудили или что сказал клиент';
  end if;
  if v_occurred_at > now() + interval '5 minutes' then
    raise exception using errcode = '22023', message = 'Контакт не может быть из будущего';
  end if;

  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Лид не найден';
  end if;
  -- Хантер работает только со своими сделками.
  if public.kd_is_hunter() and v_lead.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Это сделка другого сотрудника';
  end if;

  select coalesce(s.is_final, false) or coalesce(s.is_lost, false)
    into v_is_closed
    from (select 1) x
    left join public.lead_stages s on s.id = v_lead.stage_id;

  if v_is_closed and v_kind <> 'note' then
    raise exception using errcode = '55000', message = 'У закрытого лида можно оставить комментарий, но нельзя записать новый контакт';
  end if;

  if v_kind <> 'note' then
    if nullif(btrim(coalesce(p_next_action, '')), '') is null or p_next_action_at is null then
      raise exception using errcode = '22004', message = 'Укажи следующий шаг и его срок';
    end if;
    if p_next_action_at <= now() then
      raise exception using errcode = '22023', message = 'Следующий шаг должен быть назначен на будущее';
    end if;
  elsif (p_next_action is null) <> (p_next_action_at is null) then
    raise exception using errcode = '22004', message = 'Для нового плана нужны и действие, и срок';
  elsif p_next_action_at is not null and p_next_action_at <= now() then
    raise exception using errcode = '22023', message = 'Следующий шаг должен быть назначен на будущее';
  end if;

  insert into public.lead_activities (lead_id, kind, outcome, comment, occurred_at, created_by)
  values (p_lead_id, v_kind, v_outcome,
    coalesce(v_comment, case when v_outcome = 'no_answer' then 'Не удалось связаться' end),
    v_occurred_at, auth.uid())
  returning id into v_activity_id;

  update public.leads
     set first_response_at = case
           when v_kind <> 'note' and v_outcome <> 'no_answer' then coalesce(first_response_at, v_occurred_at)
           else first_response_at end,
         owner_id = coalesce(owner_id, auth.uid()),
         next_action = case when p_next_action_at is not null then btrim(p_next_action) else next_action end,
         next_action_at = coalesce(p_next_action_at, next_action_at),
         updated_at = now()
   where id = p_lead_id;

  return v_activity_id;
end
$function$;

revoke all on function public.record_lead_activity_atomic(uuid, text, text, text, timestamptz, text, timestamptz) from public, anon;
grant execute on function public.record_lead_activity_atomic(uuid, text, text, text, timestamptz, text, timestamptz) to authenticated, service_role;

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
  v_service_stage_id uuid;
  v_branch_id uuid;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_role(array['admin', 'manager', 'hunter'])
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
  -- Хантер работает только со своими сделками.
  if public.kd_is_hunter() and v_lead.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Это сделка другого сотрудника';
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

  select id into v_existing_job_id
    from public.jobs
   where origin_lead_id = p_lead_id
   for update;

  -- Стадию после заявки выбирает сервер: «Первая обработка», а если сделка уже
  -- дальше (например, «Абонент») — не откатываем её.
  select s.id into v_service_stage_id
    from public.lead_stages s
   where s.code = 'first_service';
  if exists (
    select 1 from public.lead_stages cur
     where cur.id = v_lead.stage_id and cur.code in ('first_service', 'subscriber')
  ) then
    v_service_stage_id := v_lead.stage_id;
  end if;

  if v_existing_job_id is not null then
    update public.leads
       set converted_job_id = v_existing_job_id,
           stage_id = coalesce(v_service_stage_id, v_lead.stage_id),
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
    nullif(btrim(v_lead.address), ''),
    coalesce(nullif(btrim(v_lead.lpr_phone), ''), nullif(btrim(v_lead.phone), '')),
    coalesce(nullif(btrim(v_lead.lpr_name), ''), nullif(btrim(v_lead.name), '')), v_branch_id,
    'open', null, auth.uid()
  ) returning id into v_order_id;

  insert into public.jobs (
    type, scheduled_date, address, area, source, client_phone, brand,
    guarantee_months, pest, price_options, note, created_by,
    branch_id, order_id, visit_no, visit_kind, work_stage, origin_lead_id
  ) values (
    'Первичная', v_lead.first_service_at, coalesce(v_lead.address, ''), v_lead.area_m2, coalesce(v_lead.source, ''),
    coalesce(nullif(btrim(v_lead.phone), ''), nullif(btrim(v_lead.lpr_phone), ''), '+7 '), 'KazDez',
    p_guarantee_months, coalesce(array_to_string(v_lead.pests, ', '), ''), '[]'::jsonb,
    case when nullif(btrim(v_lead.name), '') is not null then 'Клиент: ' || btrim(v_lead.name) else null end,
    auth.uid(), v_branch_id, v_order_id, 1, 'primary', 'new', p_lead_id
  ) returning id into v_job_id;

  update public.orders set root_job_id = v_job_id where id = v_order_id;
  update public.leads
     set converted_job_id = v_job_id,
         stage_id = coalesce(v_service_stage_id, v_lead.stage_id),
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
-- select policyname, permissive, cmd from pg_policies where tablename in ('leads', 'lead_stages', 'lead_activities', 'clients') and policyname like '%hunter%';
