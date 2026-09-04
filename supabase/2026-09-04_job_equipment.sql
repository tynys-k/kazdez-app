-- =====================================================================
-- Чем работали на заявке.
--
-- Дезинфектор отмечает использованное оборудование. Само по себе это учёт,
-- но нужен он ради другого: сопоставить оборудование и препарат с тем, по
-- каким заявкам потом пришлось выезжать по гарантии.
--
-- Без этих данных на вопрос «почему возвращаемся» есть только догадки. С
-- ними видно, например, что по клопам холодный туман даёт возвраты вдвое
-- чаще горячего — и это уже повод менять технологию, а не людей.
--
-- Отдельная таблица, а не колонка в заявке: отчёт исполнителя уходит через
-- защищённую функцию submit_report, куда добавить поле нельзя, а писать в
-- jobs напрямую дезинфектору запрещено политикой.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.job_equipment (
  job_id     uuid primary key references public.jobs(id) on delete cascade,
  -- коды из WORK_EQUIPMENT в src/shared.jsx; на одной заявке их может быть
  -- несколько — оборудование миксуют
  codes      text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.job_equipment enable row level security;

drop policy if exists "job_equipment select" on public.job_equipment;
create policy "job_equipment select" on public.job_equipment
  for select to authenticated using (true);

-- Отмечает тот, кто выполнял заявку: он один знает, чем работал. Плюс те,
-- кто правит заявки, — чтобы можно было дозаполнить задним числом.
drop policy if exists "job_equipment write" on public.job_equipment;
create policy "job_equipment write" on public.job_equipment
  for all to authenticated
  using (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  )
  with check (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  );

-- Проверка после запуска:
-- select j.pest, e.codes, j.scheduled_date
--   from public.job_equipment e join public.jobs j on j.id = e.job_id
--  order by j.scheduled_date desc limit 20;
