-- =====================================================================
-- Обучение менеджеров: какие темы пройдены, когда и с каким результатом.
--
-- Скрипты продаж лежат на Диске, но факта обучения нет: ни кто проходил,
-- ни когда, ни с каким результатом. Рейтинг менеджеров по конверсии уже
-- считается — не хватало второй половины, чтобы понять, кто провалился
-- и по какой теме.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.training_records (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.profiles(id) on delete cascade,
  topic         text not null,
  passed_on     date,
  -- 0..100; null означает «прошёл без оценки», а не «ноль баллов»
  score         int,
  next_check_on date,
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists training_records_person_idx on public.training_records (person_id);
create index if not exists training_records_next_idx   on public.training_records (next_check_on);

alter table public.training_records enable row level security;

-- Своё обучение человек видит: он должен знать, что и когда перепроходить.
drop policy if exists "training_records select" on public.training_records;
create policy "training_records select" on public.training_records
  for select to authenticated
  using (person_id = auth.uid() or public.is_admin() or public.kd_has_permission('action.team_manage'));

drop policy if exists "training_records write" on public.training_records;
create policy "training_records write" on public.training_records
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.team_manage'))
  with check (public.is_admin() or public.kd_has_permission('action.team_manage'));

-- Проверка после запуска:
-- select p.full_name, t.topic, t.passed_on, t.score, t.next_check_on
-- from public.training_records t join public.profiles p on p.id = t.person_id
-- order by t.next_check_on nulls last;
