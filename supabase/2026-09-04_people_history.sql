-- =====================================================================
-- Л2. Отметка об ознакомлении с инструктажем.
-- Л4. История сотрудника: приём, изменения оклада, переводы, взыскания.
--
-- «Техника безопасности» и «Обучение» были папками на Диске: кто открывал
-- и кто прочитал — нигде. При несчастном случае подтвердить инструктаж
-- нечем. Про сотрудника система знала только текущее состояние: через год
-- не ответить, когда человек пришёл и сколько получал прошлой весной.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- --- Л2 -------------------------------------------------------------

create table if not exists public.safety_acknowledgements (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.profiles(id) on delete cascade,
  -- какой материал: ключ из DRIVE_LINKS, например drive_safety
  doc_key         text not null,
  acknowledged_at timestamptz not null default now(),
  note            text
);

create index if not exists safety_ack_person_idx on public.safety_acknowledgements (person_id);

alter table public.safety_acknowledgements enable row level security;

-- Видят все вошедшие: руководителю нужно видеть, кто ознакомился.
drop policy if exists "safety_ack select" on public.safety_acknowledgements;
create policy "safety_ack select" on public.safety_acknowledgements
  for select to authenticated using (true);

-- Отмечается человек ЗА СЕБЯ — в этом весь смысл подтверждения.
-- Отметить за другого нельзя даже администратору: подпись должна быть своей.
drop policy if exists "safety_ack insert" on public.safety_acknowledgements;
create policy "safety_ack insert" on public.safety_acknowledgements
  for insert to authenticated with check (person_id = auth.uid());

-- Удалять отметки нельзя никому: запись об инструктаже — документ.

-- --- Л4 -------------------------------------------------------------

create table if not exists public.employee_events (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.profiles(id) on delete cascade,
  -- hired | salary | transfer | penalty | award | left | other
  kind        text not null default 'other',
  happened_on date not null default current_date,
  -- для оклада: новая сумма; для взыскания или премии: сумма
  amount      numeric,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists employee_events_person_idx on public.employee_events (person_id, happened_on desc);

alter table public.employee_events enable row level security;

drop policy if exists "employee_events select" on public.employee_events;
create policy "employee_events select" on public.employee_events
  for select to authenticated
  using (person_id = auth.uid() or public.is_admin() or public.kd_has_permission('action.team_manage'));

drop policy if exists "employee_events write" on public.employee_events;
create policy "employee_events write" on public.employee_events
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.team_manage'))
  with check (public.is_admin() or public.kd_has_permission('action.team_manage'));

-- Проверка после запуска:
-- select p.full_name, e.kind, e.happened_on, e.amount from public.employee_events e
--   join public.profiles p on p.id = e.person_id order by e.happened_on desc;
-- select p.full_name, a.doc_key, a.acknowledged_at from public.safety_acknowledgements a
--   join public.profiles p on p.id = a.person_id order by a.acknowledged_at desc;
