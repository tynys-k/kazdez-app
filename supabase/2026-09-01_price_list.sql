-- =====================================================================
-- Прайс: вид вредителя + диапазон площади → цена.
--
-- Раньше цены жили в голове и вбивались в каждую заявку руками. Нельзя было
-- ни проверить занижение, ни поднять прайс разом.
--
-- area_to = null означает «и больше»: верхняя ступень всегда открыта, иначе
-- заявка на 300 м² не попала бы ни в одну строку.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.price_list (
  id         uuid primary key default gen_random_uuid(),
  pest       text not null,
  area_from  numeric not null default 0,
  area_to    numeric,
  price      numeric not null default 0,
  note       text,
  updated_at timestamptz not null default now()
);

create index if not exists price_list_pest_idx on public.price_list (pest);

alter table public.price_list enable row level security;

-- Читают все вошедшие: цена нужна тому, кто заводит заявку.
drop policy if exists "price_list select" on public.price_list;
create policy "price_list select" on public.price_list
  for select to authenticated using (true);

-- Меняет прайс только админ: это цена компании, а не поле заявки.
drop policy if exists "price_list write" on public.price_list;
create policy "price_list write" on public.price_list
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
