-- =====================================================================
-- Журнал ошибок приложения. Своя таблица вместо внешнего сервиса:
-- меньше зависимостей и содержимое ошибок (телефоны, адреса, суммы)
-- никуда не уходит.
--
-- Запускать в Supabase → SQL Editor целиком. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.client_errors (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  user_id      uuid references auth.users(id),
  user_name    text,          -- имя на момент ошибки: профиль потом может смениться
  kind         text,          -- crash | promise | window | handled
  place        text,          -- раздел или действие, где произошло
  message      text not null,
  stack        text,
  url          text,
  user_agent   text           -- отличить телефон дезинфектора от рабочего компьютера
);

create index if not exists client_errors_occurred_idx on public.client_errors (occurred_at desc);

alter table public.client_errors enable row level security;

-- Писать может любой вошедший: ошибка случается у сотрудника, и её нужно
-- записать именно с его устройства.
drop policy if exists "client_errors insert" on public.client_errors;
create policy "client_errors insert" on public.client_errors
  for insert to authenticated with check (true);

-- Читать — только админ: в тексте ошибок попадаются данные клиентов и суммы.
drop policy if exists "client_errors select" on public.client_errors;
create policy "client_errors select" on public.client_errors
  for select to authenticated using (public.is_admin());

-- Чистить старое тоже может только админ.
drop policy if exists "client_errors delete" on public.client_errors;
create policy "client_errors delete" on public.client_errors
  for delete to authenticated using (public.is_admin());
