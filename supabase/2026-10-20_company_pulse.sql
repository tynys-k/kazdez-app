-- Вкладка «Пульс»: цели месяца для план/факта и решения по отклонениям.
-- Цель задаёт руководитель — система её не выдумывает. Решение по
-- отклонению — это ответственный со сроком (и задача у него в «Задачах»)
-- или осознанный перенос до даты. Расчёты остаются в src/workflows/pulseModel.js.

begin;

do $dependencies$
begin
  if to_regclass('public.tasks') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Не найдены tasks, profiles или функции доступа: пульс не был создан';
  end if;
end
$dependencies$;

-- Доступ к пульсу: админ или тот, кому выдали вкладку.
create or replace function public.kd_can_pulse()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce(public.is_admin(), false) or coalesce(public.kd_has_permission('tab.pulse'), false) $$;
revoke all on function public.kd_can_pulse() from public, anon;
grant execute on function public.kd_can_pulse() to authenticated, service_role;

-- 1. Цели месяца. Пустое поле — цели по показателю нет.
create table if not exists public.pulse_targets (
  month date primary key check (month = date_trunc('month', month)::date),
  revenue numeric(14,2) check (revenue is null or revenue >= 0),
  profit numeric(14,2),
  jobs integer check (jobs is null or jobs >= 0),
  new_subscribers integer check (new_subscribers is null or new_subscribers >= 0),
  mrr numeric(14,2) check (mrr is null or mrr >= 0),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.pulse_targets enable row level security;
drop policy if exists pulse_targets_read on public.pulse_targets;
create policy pulse_targets_read on public.pulse_targets for select to authenticated using (public.kd_can_pulse());
drop policy if exists pulse_targets_write on public.pulse_targets;
create policy pulse_targets_write on public.pulse_targets for insert to authenticated with check (public.kd_can_pulse());
drop policy if exists pulse_targets_update on public.pulse_targets;
create policy pulse_targets_update on public.pulse_targets for update to authenticated using (public.kd_can_pulse()) with check (public.kd_can_pulse());
-- Supabase по умолчанию выдаёт на новые таблицы всё, включая anon: оставляем нужное.
revoke all on table public.pulse_targets from public, anon, authenticated;
grant select, insert, update on public.pulse_targets to authenticated;

-- 2. Решения по отклонениям. По одному открытому решению на отклонение.
create table if not exists public.pulse_decisions (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null check (length(btrim(alert_key)) > 0),
  alert_label text,
  status text not null default 'open' check (status in ('open', 'closed')),
  owner_id uuid references public.profiles(id) on delete set null,
  due_on date,
  snoozed_until date,
  note text,
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (owner_id is not null or snoozed_until is not null or status = 'closed')
);
create unique index if not exists pulse_decisions_open_key on public.pulse_decisions (alert_key) where status = 'open';

alter table public.pulse_decisions enable row level security;
drop policy if exists pulse_decisions_read on public.pulse_decisions;
create policy pulse_decisions_read on public.pulse_decisions for select to authenticated using (public.kd_can_pulse());
-- Пишет только функция ниже: задача и решение появляются вместе.
revoke all on table public.pulse_decisions from public, anon, authenticated;
grant select on public.pulse_decisions to authenticated;

-- p_action: assign — назначить ответственного (создаёт задачу),
-- snooze — отложить до даты, close — снять решение.
create or replace function public.kd_pulse_decide(
  p_alert_key text, p_alert_label text, p_action text,
  p_owner_id uuid default null, p_due_on date default null,
  p_snoozed_until date default null, p_note text default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_open public.pulse_decisions%rowtype;
  v_task uuid;
  v_id uuid;
  v_label text := coalesce(nullif(btrim(p_alert_label), ''), p_alert_key);
begin
  if not public.kd_can_pulse() then
    raise exception using errcode = '42501', message = 'Нет доступа к пульсу компании';
  end if;
  if nullif(btrim(coalesce(p_alert_key, '')), '') is null or p_action not in ('assign', 'snooze', 'close') then
    raise exception using errcode = '22023', message = 'Не указано отклонение или действие';
  end if;

  select * into v_open from public.pulse_decisions where alert_key = p_alert_key and status = 'open' for update;

  if p_action = 'close' then
    update public.pulse_decisions set status = 'closed', closed_at = now(), updated_at = now() where id = v_open.id;
    return v_open.id;
  end if;

  if p_action = 'snooze' then
    if p_snoozed_until is null or p_snoozed_until <= current_date then
      raise exception using errcode = '22023', message = 'Отложить можно только до будущей даты';
    end if;
  else
    if p_owner_id is null or p_due_on is null then
      raise exception using errcode = '22023', message = 'Укажите ответственного и срок';
    end if;
    if not exists (select 1 from public.profiles where id = p_owner_id) then
      raise exception using errcode = '22023', message = 'Ответственный не найден';
    end if;
  end if;

  if v_open.id is not null then
    update public.pulse_decisions set status = 'closed', closed_at = now(), updated_at = now() where id = v_open.id;
  end if;

  if p_action = 'assign' then
    insert into public.tasks (title, description, type, priority, assignee_id, status, due_date, created_by)
    values (
      'Пульс: ' || v_label,
      concat_ws(E'\n', 'Отклонение из вкладки «Пульс». Разобраться и устранить причину.', nullif(btrim(coalesce(p_note, '')), '')),
      'errand', 'urgent', p_owner_id, 'new', p_due_on, auth.uid()
    ) returning id into v_task;
  end if;

  insert into public.pulse_decisions (alert_key, alert_label, owner_id, due_on, snoozed_until, note, task_id, created_by)
  values (
    p_alert_key, v_label,
    case when p_action = 'assign' then p_owner_id end,
    case when p_action = 'assign' then p_due_on end,
    case when p_action = 'snooze' then p_snoozed_until end,
    nullif(btrim(coalesce(p_note, '')), ''), v_task, auth.uid()
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.kd_pulse_decide(text, text, text, uuid, date, date, text) from public, anon;
grant execute on function public.kd_pulse_decide(text, text, text, uuid, date, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select to_regclass('public.pulse_targets'), to_regclass('public.pulse_decisions'),
--        to_regprocedure('public.kd_pulse_decide(text, text, text, uuid, date, date, text)');
