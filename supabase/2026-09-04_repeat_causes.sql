-- =====================================================================
-- Почему пришлось выехать повторно.
--
-- Доля возвратов по сотрудникам считается, связь с оборудованием и
-- препаратами теперь тоже видна. Не хватает главного: причины.
--
-- Брак обработки, клиент вымыл полы на следующий день и новый занос с
-- соседнего объекта — три разных явления с тремя разными выводами. Пока они
-- лежат в одной куче, показатель «4% возвратов» ничем не управляет: непонятно,
-- учить людей, менять препарат или переписывать памятку клиенту.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.repeat_causes (
  -- повторная заявка, а не исходная: разбирается именно выезд
  job_id      uuid primary key references public.jobs(id) on delete cascade,
  -- коды из REPEAT_CAUSES в src/shared.jsx
  cause       text not null,
  -- на ком ответственность: исполнитель, клиент, объект или никто
  fault       text not null default 'none',
  -- кто именно, если виноват сотрудник
  person_id   uuid references public.profiles(id),
  action      text,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists repeat_causes_cause_idx on public.repeat_causes (cause);

alter table public.repeat_causes enable row level security;

-- Читают все вошедшие: исполнителю полезно видеть разбор своей работы, а не
-- узнавать о претензии из разговора о премии.
drop policy if exists "repeat_causes select" on public.repeat_causes;
create policy "repeat_causes select" on public.repeat_causes
  for select to authenticated using (true);

-- Разбирает тот, кто отвечает за качество и заявки. Исполнитель себе разбор
-- не пишет: иначе виноват всегда будет клиент.
drop policy if exists "repeat_causes write" on public.repeat_causes;
create policy "repeat_causes write" on public.repeat_causes
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

-- Изменения разбора попадают в журнал «было → стало»: это оценка работы
-- человека, и переписывать её задним числом молча нельзя.
drop trigger if exists kd_changes_repeat_causes on public.repeat_causes;
create trigger kd_changes_repeat_causes
  after insert or update or delete on public.repeat_causes
  for each row execute function public.kd_log_changes('cause', 'fault', 'person_id', 'action');

-- Проверка после запуска:
-- select c.cause, c.fault, count(*) from public.repeat_causes c group by 1, 2 order by 3 desc;
