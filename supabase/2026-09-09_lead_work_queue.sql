-- Управляемая очередь продаж: у каждого открытого лида есть ответственный,
-- конкретный следующий шаг и срок. Старые вкладки остаются совместимыми:
-- если они не передали план, сервер создаёт срочный шаг автоматически.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_role(text[])') is null then
    raise exception 'Сначала примените миграции доступа от 2026-09-07: очередь продаж не была изменена';
  end if;
end
$dependencies$;

alter table public.leads add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists first_response_at timestamptz;
alter table public.leads add column if not exists next_action text;
alter table public.leads add column if not exists next_action_at timestamptz;
alter table public.leads add column if not exists lost_reason text;

-- Восстанавливаем владельца там, где автор ещё работает в системе.
update public.leads l
   set owner_id = l.created_by
 where l.owner_id is null
   and l.created_by is not null
   and exists (select 1 from public.profiles p where p.id = l.created_by);

-- Закрытым лидам действие больше не нужно; проигранным сохраняем явную причину.
update public.leads l
   set next_action = null,
       next_action_at = null,
       lost_reason = case when coalesce(s.is_lost, false)
         then coalesce(nullif(btrim(l.lost_reason), ''), 'Причина не указана')
         else null end
  from public.lead_stages s
 where s.id = l.stage_id
   and (coalesce(s.is_final, false) or coalesce(s.is_lost, false));

-- Старый открытый лид без обещания не прячем: он сразу попадёт в просроченную
-- очередь и потребует решения менеджера.
update public.leads l
   set next_action = coalesce(nullif(btrim(l.next_action), ''), 'Связаться с клиентом'),
       next_action_at = coalesce(l.next_action_at, l.updated_at, l.created_at, now()),
       lost_reason = null
 where l.converted_job_id is null
   and not exists (
     select 1 from public.lead_stages s
      where s.id = l.stage_id
        and (coalesce(s.is_final, false) or coalesce(s.is_lost, false))
   );

create index if not exists leads_open_next_action_idx
  on public.leads (next_action_at, owner_id)
  where converted_job_id is null and next_action_at is not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.leads'::regclass
       and conname = 'leads_next_action_pair_check'
  ) then
    alter table public.leads add constraint leads_next_action_pair_check
      check ((next_action is null) = (next_action_at is null));
  end if;
end
$constraints$;

create or replace function public.kd_prepare_lead_workflow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_is_final boolean := false;
  v_is_lost boolean := false;
begin
  if NEW.stage_id is not null then
    select coalesce(s.is_final, false), coalesce(s.is_lost, false)
      into v_is_final, v_is_lost
      from public.lead_stages s
     where s.id = NEW.stage_id;
  end if;

  NEW.owner_id := coalesce(NEW.owner_id, NEW.created_by, auth.uid());

  if NEW.converted_job_id is not null then
    NEW.lost_reason := null;
    NEW.next_action := null;
    NEW.next_action_at := null;
  elsif v_is_lost then
    NEW.lost_reason := coalesce(nullif(btrim(NEW.lost_reason), ''), 'Причина не указана');
    NEW.next_action := null;
    NEW.next_action_at := null;
  elsif v_is_final then
    NEW.lost_reason := null;
    NEW.next_action := null;
    NEW.next_action_at := null;
  else
    NEW.next_action := coalesce(nullif(btrim(NEW.next_action), ''), 'Связаться с клиентом');
    NEW.next_action_at := coalesce(NEW.next_action_at, NEW.updated_at, NEW.created_at, now());
    NEW.lost_reason := null;
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

drop trigger if exists kd_prepare_lead_workflow on public.leads;
create trigger kd_prepare_lead_workflow
  before insert or update on public.leads
  for each row execute function public.kd_prepare_lead_workflow();

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
  if v_lead.converted_job_id is not null or v_is_final or v_is_lost then
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

revoke all on function public.kd_prepare_lead_workflow() from public, anon, authenticated;
revoke all on function public.touch_lead_atomic(uuid, text, timestamptz) from public, anon;
grant execute on function public.touch_lead_atomic(uuid, text, timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Быстрая проверка после применения:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'leads'
--   and column_name in ('owner_id','first_response_at','next_action','next_action_at','lost_reason');
