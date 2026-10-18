-- Воронка Хантера (B2B): девять стадий с кодами, поля карточки сделки и
-- серверная блокировка перехода вперёд без обязательных полей.
-- Цель — «Абонент» (регулярное обслуживание), поэтому заявка из лида больше
-- не закрывает сделку: она встаёт на «Первую обработку» и ждёт решения.
-- Правила полей повторяют src/workflows/hunterFunnelModel.js.

begin;

do $dependencies$
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.lead_stages') is null
     or to_regclass('public.proposals') is null
     or to_regclass('public.lead_activities') is null
     or to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_role(text[])') is null
     or to_regprocedure('public.kd_prepare_lead_workflow()') is null then
    raise exception 'Сначала примените миграции CRM от 2026-09-09 и КП от 2026-09-17: воронка не была изменена';
  end if;
end
$dependencies$;

-- 1. Стадии получают постоянный код: по нему, а не по названию, работают правила.
alter table public.lead_stages add column if not exists code text;
create unique index if not exists lead_stages_code_key on public.lead_stages (code) where code is not null;

update public.lead_stages set code = 'new' where code is null and name = 'Новый лид'
  and not exists (select 1 from public.lead_stages where code = 'new');
update public.lead_stages set code = 'lpr_found' where code is null and name = 'Связались'
  and not exists (select 1 from public.lead_stages where code = 'lpr_found');
update public.lead_stages set code = 'kp_sent' where code is null and name = 'КП выдано'
  and not exists (select 1 from public.lead_stages where code = 'kp_sent');
update public.lead_stages set code = 'contract' where code is null and name = 'Договор'
  and not exists (select 1 from public.lead_stages where code = 'contract');
update public.lead_stages set code = 'first_service' where code is null and name = 'Готов к выезду'
  and not exists (select 1 from public.lead_stages where code = 'first_service');
update public.lead_stages set code = 'lost' where code is null and name = 'Отказ'
  and not exists (select 1 from public.lead_stages where code = 'lost');

insert into public.lead_stages (code, name, sort, is_final, is_lost)
select v.code, v.name, v.sort, v.is_final, v.is_lost
  from (values
    ('new', 'Новый / Разведка', 10, false, false),
    ('lpr_found', 'ЛПР найден', 20, false, false),
    ('kp_sent', 'КП отправлено', 30, false, false),
    ('negotiation', 'Переговоры', 40, false, false),
    ('contract', 'Договор на согласовании', 50, false, false),
    ('first_service', 'Первая обработка', 60, false, false),
    ('subscriber', 'Абонент', 70, true, false),
    ('lost', 'Отказ', 80, true, true),
    ('snoozed', 'Отложено', 90, false, false)
  ) as v(code, name, sort, is_final, is_lost)
 where not exists (select 1 from public.lead_stages s where s.code = v.code);

-- Названия, порядок и флаги — по ТЗ. «Первая обработка» больше не финал,
-- «Отложено» живёт в очереди с датой возврата.
update public.lead_stages s
   set name = v.name, sort = v.sort, is_final = v.is_final, is_lost = v.is_lost
  from (values
    ('new', 'Новый / Разведка', 10, false, false),
    ('lpr_found', 'ЛПР найден', 20, false, false),
    ('kp_sent', 'КП отправлено', 30, false, false),
    ('negotiation', 'Переговоры', 40, false, false),
    ('contract', 'Договор на согласовании', 50, false, false),
    ('first_service', 'Первая обработка', 60, false, false),
    ('subscriber', 'Абонент', 70, true, false),
    ('lost', 'Отказ', 80, true, true),
    ('snoozed', 'Отложено', 90, false, false)
  ) as v(code, name, sort, is_final, is_lost)
 where s.code = v.code;

-- Самодельные стадии без кода уходят в конец, чтобы не разрывать воронку.
update public.lead_stages set sort = 100 + coalesce(sort, 0) where code is null and coalesce(sort, 0) < 100;

-- 2. Поля карточки сделки. Перечисления хранятся текстом (коды из модели),
-- чтобы добавлять варианты без миграции.
alter table public.leads add column if not exists object_type text;
alter table public.leads add column if not exists area_m2 numeric;
alter table public.leads add column if not exists pests text[] not null default '{}';
alter table public.leads add column if not exists current_provider text;
alter table public.leads add column if not exists desired_frequency text;
alter table public.leads add column if not exists lpr_name text;
alter table public.leads add column if not exists lpr_position text;
alter table public.leads add column if not exists lpr_phone text;
alter table public.leads add column if not exists quoted_price numeric;
alter table public.leads add column if not exists agreed_frequency text;
alter table public.leads add column if not exists expected_mrr numeric;
alter table public.leads add column if not exists company_id uuid references public.clients(id) on delete set null;
alter table public.leads add column if not exists signer_name text;
alter table public.leads add column if not exists first_service_at date;
alter table public.leads add column if not exists contract_signed_at date;
alter table public.leads add column if not exists next_service_at date;
alter table public.leads add column if not exists keeper_id uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists snooze_until date;
alter table public.leads add column if not exists snooze_reason text;
alter table public.leads add column if not exists stage_changed_at timestamptz;

update public.leads set stage_changed_at = coalesce(updated_at, created_at, now()) where stage_changed_at is null;

-- 3. Чего не хватает сделке для стадии p_code. Пустой массив — можно.
create or replace function public.kd_lead_stage_missing(p_lead public.leads, p_code text)
returns text[]
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order text[] := array['new', 'lpr_found', 'kp_sent', 'negotiation', 'contract', 'first_service', 'subscriber'];
  v_target integer := coalesce(array_position(v_order, p_code), 0);
  v_missing text[] := '{}';
  v_has_kp boolean;
  v_job_done boolean;
begin
  if p_code = 'lost' then
    if nullif(btrim(coalesce(p_lead.lost_reason, '')), '') is null then v_missing := array_append(v_missing, 'причина отказа'::text); end if;
    return v_missing;
  end if;
  if p_code = 'snoozed' then
    if p_lead.snooze_until is null then v_missing := array_append(v_missing, 'дата возврата'::text); end if;
    if nullif(btrim(coalesce(p_lead.snooze_reason, '')), '') is null then v_missing := array_append(v_missing, 'причина переноса'::text); end if;
    return v_missing;
  end if;
  -- Правила воронки — для юрлиц. Физлица двигаются свободно.
  if coalesce(p_lead.client_type, 'person') <> 'company' or v_target < 2 then
    return v_missing;
  end if;

  if nullif(btrim(coalesce(p_lead.object_type, '')), '') is null then v_missing := array_append(v_missing, 'тип объекта'::text); end if;
  if nullif(btrim(coalesce(p_lead.address, '')), '') is null then v_missing := array_append(v_missing, 'адрес объекта'::text); end if;
  if coalesce(p_lead.area_m2, 0) <= 0 then v_missing := array_append(v_missing, 'площадь, м²'::text); end if;

  if v_target >= 3 then
    if nullif(btrim(coalesce(p_lead.lpr_name, '')), '') is null then v_missing := array_append(v_missing, 'ФИО ЛПР'::text); end if;
    if length(regexp_replace(coalesce(p_lead.lpr_phone, ''), '\D', '', 'g')) < 10 then v_missing := array_append(v_missing, 'телефон ЛПР'::text); end if;
    if not exists (select 1 from unnest(coalesce(p_lead.pests, '{}')) p where btrim(p) <> '') then
      v_missing := array_append(v_missing, 'какие вредители беспокоят'::text);
    end if;
    if nullif(btrim(coalesce(p_lead.current_provider, '')), '') is null then v_missing := array_append(v_missing, 'текущий подрядчик (или «нет»)'::text); end if;
    if nullif(btrim(coalesce(p_lead.desired_frequency, '')), '') is null then v_missing := array_append(v_missing, 'нужная периодичность'::text); end if;
    select nullif(btrim(coalesce(p_lead.kp_url, '')), '') is not null
        or exists (select 1 from public.proposals p where p.lead_id = p_lead.id)
      into v_has_kp;
    if not v_has_kp then v_missing := array_append(v_missing, 'КП (ссылка на файл или КП из раздела «КП»)'::text); end if;
  end if;

  if v_target >= 5 then
    if coalesce(p_lead.quoted_price, 0) <= 0 then v_missing := array_append(v_missing, 'согласованная цена'::text); end if;
    if nullif(btrim(coalesce(p_lead.agreed_frequency, '')), '') is null then v_missing := array_append(v_missing, 'согласованная периодичность'::text); end if;
    if coalesce(p_lead.expected_mrr, 0) <= 0 then v_missing := array_append(v_missing, 'ожидаемая выручка в месяц'::text); end if;
  end if;

  if v_target >= 6 then
    if p_lead.company_id is null then v_missing := array_append(v_missing, 'юрлицо (карточка клиента с БИН)'::text); end if;
    if nullif(btrim(coalesce(p_lead.signer_name, '')), '') is null then v_missing := array_append(v_missing, 'подписант договора'::text); end if;
    if p_lead.first_service_at is null then v_missing := array_append(v_missing, 'дата первой обработки'::text); end if;
  end if;

  if v_target >= 7 then
    if p_lead.contract_signed_at is null then v_missing := array_append(v_missing, 'дата подписания договора'::text); end if;
    select exists (select 1 from public.jobs j where j.id = p_lead.converted_job_id and j.status = 'done') into v_job_done;
    if not v_job_done then v_missing := array_append(v_missing, 'закрытый акт первой обработки (заявка выполнена)'::text); end if;
    if p_lead.next_service_at is null then v_missing := array_append(v_missing, 'дата следующего регулярного выезда'::text); end if;
    if p_lead.keeper_id is null then v_missing := array_append(v_missing, 'ответственный за удержание'::text); end if;
  end if;

  return v_missing;
end
$function$;

revoke all on function public.kd_lead_stage_missing(public.leads, text) from public, anon;
grant execute on function public.kd_lead_stage_missing(public.leads, text) to authenticated, service_role;

-- 4. Блокировка перехода. Назад — можно всегда, вперёд и в выходы — только
-- с заполненными полями. Срабатывает раньше kd_prepare_lead_workflow (по алфавиту).
create or replace function public.kd_check_lead_stage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order text[] := array['new', 'lpr_found', 'kp_sent', 'negotiation', 'contract', 'first_service', 'subscriber'];
  v_to_code text;
  v_to_name text;
  v_from_code text;
  v_missing text[];
begin
  if TG_OP = 'UPDATE' and NEW.stage_id is not distinct from OLD.stage_id then
    return NEW;
  end if;
  if NEW.stage_id is null then
    return NEW;
  end if;

  select s.code, s.name into v_to_code, v_to_name from public.lead_stages s where s.id = NEW.stage_id;
  if v_to_code is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.stage_id is not null then
    select s.code into v_from_code from public.lead_stages s where s.id = OLD.stage_id;
  end if;

  if array_position(v_order, v_to_code) is not null
     and array_position(v_order, v_from_code) is not null
     and array_position(v_order, v_to_code) < array_position(v_order, v_from_code) then
    return NEW;
  end if;

  v_missing := public.kd_lead_stage_missing(NEW, v_to_code);
  if coalesce(array_length(v_missing, 1), 0) > 0 then
    raise exception using errcode = '23514',
      message = 'Нельзя перевести на «' || v_to_name || '»: не заполнено — ' || array_to_string(v_missing, ', ');
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_check_lead_stage() from public, anon, authenticated;
drop trigger if exists kd_check_lead_stage on public.leads;
create trigger kd_check_lead_stage
  before insert or update on public.leads
  for each row execute function public.kd_check_lead_stage();

-- 5. План касаний: сделка закрыта только на финальной стадии или в отказе.
-- Заявка из лида больше не закрывает сделку. «Отложено» возвращается в очередь
-- в дату возврата.
create or replace function public.kd_prepare_lead_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_is_final boolean := false;
  v_is_lost boolean := false;
  v_code text;
begin
  if NEW.stage_id is not null then
    select coalesce(s.is_final, false), coalesce(s.is_lost, false), s.code
      into v_is_final, v_is_lost, v_code
      from public.lead_stages s
     where s.id = NEW.stage_id;
  end if;

  NEW.owner_id := coalesce(NEW.owner_id, NEW.created_by, auth.uid());

  if v_is_lost then
    NEW.lost_reason := coalesce(nullif(btrim(NEW.lost_reason), ''), 'Причина не указана');
    NEW.next_action := null;
    NEW.next_action_at := null;
  elsif v_is_final then
    NEW.lost_reason := null;
    NEW.next_action := null;
    NEW.next_action_at := null;
  elsif v_code = 'snoozed' and NEW.snooze_until is not null
        and (TG_OP = 'INSERT' or NEW.stage_id is distinct from OLD.stage_id
             or NEW.snooze_until is distinct from OLD.snooze_until) then
    NEW.lost_reason := null;
    NEW.next_action := 'Вернуться к клиенту' || coalesce(': ' || nullif(btrim(NEW.snooze_reason), ''), '');
    NEW.next_action_at := (NEW.snooze_until + time '10:00') at time zone 'Asia/Almaty';
  else
    NEW.next_action := coalesce(nullif(btrim(NEW.next_action), ''), 'Связаться с клиентом');
    NEW.next_action_at := coalesce(NEW.next_action_at, NEW.updated_at, NEW.created_at, now());
    NEW.lost_reason := null;
  end if;

  if TG_OP = 'INSERT' or NEW.stage_id is distinct from OLD.stage_id then
    NEW.stage_changed_at := now();
  end if;

  if TG_OP = 'UPDATE' and OLD.first_response_at is not null then
    NEW.first_response_at := OLD.first_response_at;
  elsif TG_OP = 'UPDATE' and OLD.first_response_at is null
        and NEW.stage_id is distinct from OLD.stage_id then
    NEW.first_response_at := now();
  end if;

  return NEW;
end
$function$;

revoke all on function public.kd_prepare_lead_workflow() from public, anon, authenticated;

-- 6. Касания разрешены и после создания заявки — пока сделка не закрыта стадией.
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
    public.is_admin() or public.kd_has_role(array['admin', 'manager'])
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
    public.is_admin() or public.kd_has_role(array['admin', 'manager'])
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

-- 7. Заявка из лида ставит сделку на «Первую обработку». У юрлица это
-- переход вперёд — без договорных полей сервер его не пропустит.
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

-- 8. Сделки с заявкой на «Первой обработке» снова в работе: нужен план —
-- решить, абонент это, отложено или отказ.
update public.leads l
   set next_action = coalesce(nullif(btrim(l.next_action), ''), 'Решить по сделке: абонент, отложено или отказ'),
       next_action_at = coalesce(l.next_action_at, now())
  from public.lead_stages s
 where s.id = l.stage_id and s.code = 'first_service';

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select code, name, sort, is_final, is_lost from public.lead_stages order by sort;
