-- =====================================================================
-- Помощники на заявке.
--
-- На крупный объект к основному исполнителю отправляют второго сотрудника —
-- обычно «процентника», который получает бонус за помощь. Раньше такие
-- выплаты было негде записать: бонус на заявке один и принадлежит тому,
-- кто назначен.
--
-- Отдельная таблица, а не пара полей в jobs: помощников может быть больше
-- одного, и запись заодно отвечает на вопрос «кто был на этой заявке».
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.job_helpers (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.jobs(id) on delete cascade,
  tech_id    uuid not null references public.profiles(id),
  amount     numeric not null default 0,
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (job_id, tech_id)          -- один человек на заявке один раз
);

create index if not exists job_helpers_job_idx  on public.job_helpers (job_id);
create index if not exists job_helpers_tech_idx on public.job_helpers (tech_id);

alter table public.job_helpers enable row level security;

-- Читают все вошедшие: сотрудник должен видеть свои бонусы за помощь.
drop policy if exists "job_helpers select" on public.job_helpers;
create policy "job_helpers select" on public.job_helpers
  for select to authenticated using (true);

-- Назначает помощника и сумму тот, кто и так правит заявки.
drop policy if exists "job_helpers write" on public.job_helpers;
create policy "job_helpers write" on public.job_helpers
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));
