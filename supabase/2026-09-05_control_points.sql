-- =====================================================================
-- Точки контроля: приманочные станции, ловушки, клеевые мониторы.
--
-- Объект появился, но для пищевого производства и склада этого мало. Там
-- работа устроена иначе: на объекте расставлены пронумерованные станции, и
-- каждый визит — это обход с отметкой по каждой из них. Проверяющий смотрит
-- не «сколько раз приезжали», а карту точек и журнал осмотров.
--
-- Без этого договор с сетью или производством не подписать: там, где чек
-- выше всего, а отток ниже.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.control_points (
  id          uuid primary key default gen_random_uuid(),
  object_id   uuid not null references public.objects(id) on delete cascade,
  -- номер на самой станции: по нему её ищут на объекте
  number      text not null,
  -- bait_station | glue_board | snap_trap | live_trap | insect_monitor | uv_lamp
  kind        text not null default 'bait_station',
  location    text,
  installed_on date not null default current_date,
  removed_on  date,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (object_id, number)
);

create index if not exists control_points_object_idx on public.control_points (object_id) where removed_on is null;

-- Осмотр точки. Привязан к визиту: отметка без выезда — это не осмотр.
create table if not exists public.control_checks (
  id         uuid primary key default gen_random_uuid(),
  point_id   uuid not null references public.control_points(id) on delete cascade,
  job_id     uuid references public.jobs(id) on delete set null,
  checked_on date not null default current_date,
  -- clean | activity | consumed | damaged | missing | replaced
  result     text not null default 'clean',
  -- сколько особей обнаружено, если считали
  count      int,
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (point_id, job_id)
);

create index if not exists control_checks_point_idx on public.control_checks (point_id, checked_on desc);
create index if not exists control_checks_job_idx   on public.control_checks (job_id);

alter table public.control_points enable row level security;
alter table public.control_checks enable row level security;

drop policy if exists "control_points select" on public.control_points;
create policy "control_points select" on public.control_points
  for select to authenticated using (true);

drop policy if exists "control_points write" on public.control_points;
create policy "control_points write" on public.control_points
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

drop policy if exists "control_checks select" on public.control_checks;
create policy "control_checks select" on public.control_checks
  for select to authenticated using (true);

-- Отмечает результат тот, кто был на объекте. Это и есть смысл осмотра.
drop policy if exists "control_checks write" on public.control_checks;
create policy "control_checks write" on public.control_checks
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

-- Появление и снятие станции — событие для журнала: карта точек это часть
-- договора, и менять её задним числом молча нельзя.
drop trigger if exists kd_changes_control_points on public.control_points;
create trigger kd_changes_control_points
  after insert or update or delete on public.control_points
  for each row execute function public.kd_log_changes('number', 'kind', 'location', 'removed_on');

-- Проверка после запуска — журнал осмотров, который спрашивают на аудите:
-- select o.address, cp.number, cp.kind, cc.checked_on, cc.result, cc.count
--   from public.control_checks cc
--   join public.control_points cp on cp.id = cc.point_id
--   join public.objects o on o.id = cp.object_id
--  order by cc.checked_on desc;
