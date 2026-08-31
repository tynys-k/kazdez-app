-- =====================================================================
-- Подтверждение работ по заявке: фото «до/после», подпись клиента, геометки.
-- Запускать в Supabase → SQL Editor целиком. Повторный запуск безопасен.
--
-- ВАЖНО: ниже job_id объявлен как uuid. Если в вашей таблице jobs
-- колонка id имеет другой тип (например text) — поменяйте тип job_id
-- на такой же, иначе создание таблицы упадёт с ошибкой о несовпадении типов.
-- =====================================================================

-- 1. Таблица -----------------------------------------------------------
create table if not exists public.job_proofs (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null unique references public.jobs(id) on delete cascade,
  before_paths        text[] not null default '{}',
  after_paths         text[] not null default '{}',
  signature_path      text,
  signed_name         text,
  arrival_lat         numeric,
  arrival_lng         numeric,
  arrival_accuracy    numeric,
  completion_lat      numeric,
  completion_lng      numeric,
  completion_accuracy numeric,
  created_by          uuid references auth.users(id),
  updated_at          timestamptz not null default now()
);

-- unique по job_id обязателен: приложение делает upsert с onConflict:"job_id"
create unique index if not exists job_proofs_job_id_key on public.job_proofs (job_id);

alter table public.job_proofs enable row level security;

-- 2. Доступ к таблице --------------------------------------------------
-- Читать и писать может любой вошедший сотрудник: дезинфектор заполняет
-- своё подтверждение, админ проверяет чужие. Если понадобится ограничить
-- дезинфектора только своими заявками — заменить using(true) на проверку
-- assigned_to через подзапрос к jobs.
drop policy if exists "job_proofs select" on public.job_proofs;
create policy "job_proofs select" on public.job_proofs
  for select to authenticated using (true);

drop policy if exists "job_proofs insert" on public.job_proofs;
create policy "job_proofs insert" on public.job_proofs
  for insert to authenticated with check (true);

drop policy if exists "job_proofs update" on public.job_proofs;
create policy "job_proofs update" on public.job_proofs
  for update to authenticated using (true) with check (true);

-- 3. Хранилище файлов --------------------------------------------------
-- Закрытое (public = false): фото и подписи клиентов не должны открываться
-- по прямой ссылке. Приложение читает их через createSignedUrls на 1 час.
insert into storage.buckets (id, name, public)
values ('job-proofs', 'job-proofs', false)
on conflict (id) do nothing;

drop policy if exists "job-proofs read" on storage.objects;
create policy "job-proofs read" on storage.objects
  for select to authenticated using (bucket_id = 'job-proofs');

drop policy if exists "job-proofs upload" on storage.objects;
create policy "job-proofs upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'job-proofs');
