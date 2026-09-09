-- Полноценная CRM-история по лидам: звонки, WhatsApp, встречи, комментарии
-- и изменения стадий хранятся отдельно от самой карточки клиента.

begin;

do $dependencies$
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.lead_stages') is null
     or to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_role(text[])') is null then
    raise exception 'Сначала примените миграции CRM и доступа до 2026-09-09 включительно';
  end if;
end
$dependencies$;

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('call', 'whatsapp', 'message', 'meeting', 'note', 'system', 'stage_change')),
  outcome text not null check (outcome in ('connected', 'no_answer', 'interested', 'proposal_sent', 'thinking', 'agreed', 'refused', 'note', 'created', 'stage_changed')),
  comment text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  from_stage_id uuid references public.lead_stages(id) on delete set null,
  to_stage_id uuid references public.lead_stages(id) on delete set null,
  legacy_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_lead_timeline_idx
  on public.lead_activities (lead_id, occurred_at desc, created_at desc);

alter table public.lead_activities enable row level security;
drop policy if exists lead_activities_select on public.lead_activities;
create policy lead_activities_select on public.lead_activities
  for select to authenticated
  using (public.kd_has_role(array['admin', 'manager']));

revoke all on table public.lead_activities from public, anon, authenticated;
grant select on table public.lead_activities to authenticated;
grant all on table public.lead_activities to service_role;

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

  select v_lead.converted_job_id is not null or coalesce(s.is_final, false) or coalesce(s.is_lost, false)
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

create or replace function public.kd_log_lead_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_from_name text;
  v_to_name text;
begin
  if TG_OP = 'INSERT' then
    select s.name into v_to_name from public.lead_stages s where s.id = NEW.stage_id;
    insert into public.lead_activities (lead_id, kind, outcome, comment, occurred_at, created_by, to_stage_id, legacy_key)
    values (NEW.id, 'system', 'created', 'Карточка лида создана' || coalesce(' · стадия «' || v_to_name || '»', ''),
      coalesce(NEW.created_at, now()), coalesce(NEW.created_by, auth.uid()), NEW.stage_id, 'lead-created:' || NEW.id::text)
    on conflict (legacy_key) do nothing;
  elsif NEW.stage_id is distinct from OLD.stage_id then
    select s.name into v_from_name from public.lead_stages s where s.id = OLD.stage_id;
    select s.name into v_to_name from public.lead_stages s where s.id = NEW.stage_id;
    insert into public.lead_activities (lead_id, kind, outcome, comment, occurred_at, created_by, from_stage_id, to_stage_id)
    values (NEW.id, 'stage_change', 'stage_changed',
      'Стадия: «' || coalesce(v_from_name, 'не указана') || '» → «' || coalesce(v_to_name, 'не указана') || '»',
      now(), auth.uid(), OLD.stage_id, NEW.stage_id);
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_log_lead_lifecycle() from public, anon, authenticated;
drop trigger if exists kd_log_lead_lifecycle on public.leads;
create trigger kd_log_lead_lifecycle
  after insert or update of stage_id on public.leads
  for each row execute function public.kd_log_lead_lifecycle();

-- Фактическую историю старых контактов восстановить нельзя. Переносим только
-- достоверные события: создание карточки и уже записанную постоянную заметку.
insert into public.lead_activities (lead_id, kind, outcome, comment, occurred_at, created_by, to_stage_id, legacy_key)
select l.id, 'system', 'created', 'Карточка лида создана', coalesce(l.created_at, now()), l.created_by, l.stage_id,
       'lead-created:' || l.id::text
  from public.leads l
on conflict (legacy_key) do nothing;

insert into public.lead_activities (lead_id, kind, outcome, comment, occurred_at, created_by, legacy_key)
select l.id, 'note', 'note', btrim(l.note), coalesce(l.updated_at, l.created_at, now()), l.created_by,
       'lead-note:' || l.id::text
  from public.leads l
 where nullif(btrim(coalesce(l.note, '')), '') is not null
on conflict (legacy_key) do nothing;

notify pgrst, 'reload schema';
commit;

-- Быстрая проверка после применения:
-- select kind, outcome, count(*) from public.lead_activities group by kind, outcome order by kind, outcome;
