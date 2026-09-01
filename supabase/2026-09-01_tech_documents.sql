-- =====================================================================
-- Допуски и документы сотрудника: медкнижка, санминимум, инструктаж по ТБ.
--
-- Дезинфекция — работа с ядохимикатами. Сотрудник с просроченной медкнижкой
-- на объекте это не беспорядок, а штраф и остановка работ. Сейчас сроки
-- держатся в голове у того, кто помнит.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.tech_documents (
  id          uuid primary key default gen_random_uuid(),
  tech_id     uuid not null references public.profiles(id) on delete cascade,
  -- medbook | sanmin | safety | driver | other — расшифровка в src/shared.jsx
  kind        text not null default 'other',
  number      text,
  issued_on   date,
  expires_on  date,
  note        text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index if not exists tech_documents_tech_idx    on public.tech_documents (tech_id);
create index if not exists tech_documents_expires_idx on public.tech_documents (expires_on);

alter table public.tech_documents enable row level security;

-- Свои документы сотрудник видит: он же должен знать, когда продлевать.
drop policy if exists "tech_documents select" on public.tech_documents;
create policy "tech_documents select" on public.tech_documents
  for select to authenticated
  using (tech_id = auth.uid() or public.is_admin() or public.kd_has_permission('action.team_manage'));

-- Заводит и правит тот, кто управляет командой.
drop policy if exists "tech_documents write" on public.tech_documents;
create policy "tech_documents write" on public.tech_documents
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.team_manage'))
  with check (public.is_admin() or public.kd_has_permission('action.team_manage'));

-- Проверка после запуска:
-- select p.full_name, d.kind, d.expires_on
-- from public.tech_documents d join public.profiles p on p.id = d.tech_id
-- order by d.expires_on;
