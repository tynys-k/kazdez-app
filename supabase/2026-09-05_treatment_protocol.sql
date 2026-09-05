-- =====================================================================
-- Протокол обработки: действующее вещество, концентрация, метод.
--
-- Расход в миллилитрах есть, но для журнала применения пестицидов этого
-- мало. Проверяющий спрашивает не «сколько литров», а «чем, в какой
-- концентрации и каким методом» — и на этот вопрос система ответить не
-- может.
--
-- Та же нехватка мешает разбирать рекламации: две обработки одним
-- препаратом в разной концентрации дают разный результат, и пока
-- концентрация нигде не записана, спор остаётся спором.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- Действующее вещество — свойство препарата, а не отдельной обработки.
alter table public.chemicals
  add column if not exists active_substance text;

-- Рабочая концентрация по умолчанию: подставляется в отчёт, чтобы
-- исполнителю не приходилось вспоминать её на объекте.
alter table public.chemicals
  add column if not exists default_concentration numeric;

-- Концентрация и метод — свойства конкретной обработки: один и тот же
-- препарат на складе разводят по-разному под клопов и под тараканов.
--
-- Отдельная таблица, а не колонки в report_chemicals: строки расхода
-- пишет защищённая функция submit_report, куда поля не добавить.
create table if not exists public.job_chem_details (
  job_id        uuid not null references public.jobs(id) on delete cascade,
  chemical_id   uuid not null references public.chemicals(id),
  -- процент рабочего раствора
  concentration numeric,
  -- код метода из TREATMENT_METHODS в src/shared.jsx
  method        text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  primary key (job_id, chemical_id)
);

create index if not exists job_chem_details_job_idx on public.job_chem_details (job_id);

alter table public.job_chem_details enable row level security;

drop policy if exists "job_chem_details select" on public.job_chem_details;
create policy "job_chem_details select" on public.job_chem_details
  for select to authenticated using (true);

-- Заполняет исполнитель по своей заявке: он один знает, чем и как разводил.
drop policy if exists "job_chem_details write" on public.job_chem_details;
create policy "job_chem_details write" on public.job_chem_details
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

-- Проверка после запуска — тот самый журнал применения пестицидов:
-- select j.scheduled_date, o.address, c.name, c.active_substance,
--        d.concentration, d.method, p.full_name
--   from public.job_chem_details d
--   join public.jobs j        on j.id = d.job_id
--   join public.chemicals c   on c.id = d.chemical_id
--   left join public.objects o  on o.id = j.object_id
--   left join public.profiles p on p.id = j.assigned_to
--  order by j.scheduled_date desc;
