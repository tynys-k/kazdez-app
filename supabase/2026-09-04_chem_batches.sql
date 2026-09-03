-- =====================================================================
-- Партии и сроки годности препаратов.
--
-- Препарат был одной строкой с общим количеством: просроченная партия
-- неотличима от свежей, а при проверке это вопрос к вам.
--
-- Отдельная таблица не нужна: приход препарата и есть партия — у него уже
-- есть дата, количество, цена и поставщик. Не хватало номера партии и
-- срока годности.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

alter table public.chemical_purchases
  add column if not exists batch_no text;

alter table public.chemical_purchases
  add column if not exists expires_on date;

create index if not exists chemical_purchases_expires_idx
  on public.chemical_purchases (expires_on);

-- Проверка после запуска:
-- select c.name, p.purchase_date, p.batch_no, p.expires_on, p.amount
-- from public.chemical_purchases p join public.chemicals c on c.id = p.chemical_id
-- order by p.expires_on nulls last;
