-- =====================================================================
-- Чёрный список клиентов.
--
-- Есть клиенты, которые заказывают и не платят, требуют возврат после
-- выполненной работы или торгуются до нуля. Сейчас об этом знает только тот,
-- кто с ними уже сталкивался, — новый менеджер оформит заявку и повторит
-- чужую ошибку.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table public.clients add column if not exists blocked boolean not null default false;
alter table public.clients add column if not exists blocked_reason text;
alter table public.clients add column if not exists blocked_at timestamptz;
alter table public.clients add column if not exists blocked_by uuid references auth.users(id);

create index if not exists clients_blocked_idx on public.clients (blocked) where blocked;

-- Проверка после запуска:
-- select name, phone, blocked_reason, blocked_at from public.clients where blocked;
