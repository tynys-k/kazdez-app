-- История закупа препаратов.
--
-- Зачем: chemicals.price_per_liter — это ТЕКУЩАЯ цена, и каждый приход её
-- перезаписывает. Себестоимость заявок считалась по ней, поэтому подорожание
-- препарата сегодня меняло прибыль июня задним числом. Закрытие периода от
-- этого не спасало: там защищены операции, а не цены.
--
-- Теперь каждый приход — отдельная запись с датой и ценой. Себестоимость
-- заявки берётся по цене на её дату (см. chemPriceOn в src/calc.js), а прошлое
-- перестаёт переписываться.
--
-- Побочная польза: появляется, чем сравнивать поставщиков и на чём строить
-- прогноз закупа.

create table if not exists public.chemical_purchases (
  id uuid primary key default gen_random_uuid(),
  chemical_id uuid not null references public.chemicals(id) on delete cascade,
  purchase_date date not null default current_date,
  -- сколько пришло, в базовых единицах препарата (мл / г / шт)
  amount numeric not null default 0,
  -- цена за литр / кг / штуку на момент этого прихода
  price_per_liter numeric,
  supplier text,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists chemical_purchases_chem_date_idx
  on public.chemical_purchases (chemical_id, purchase_date desc);

alter table public.chemical_purchases enable row level security;

drop policy if exists chemical_purchases_read on public.chemical_purchases;
create policy chemical_purchases_read on public.chemical_purchases
  for select to authenticated using (true);

drop policy if exists chemical_purchases_write on public.chemical_purchases;
create policy chemical_purchases_write on public.chemical_purchases
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.stock_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.stock_edit'));

-- Перенос: у каждого препарата с ценой заводим один стартовый приход, датой
-- заведения препарата (или очень ранней датой, если её нет). Без этой строки
-- все старые заявки считались бы по нулевой цене.
insert into public.chemical_purchases (chemical_id, purchase_date, amount, price_per_liter, note)
-- Дата переноса намеренно очень ранняя: так все прошлые заявки продолжают
-- считаться по той же цене, что и раньше, и ни один старый отчёт не поедет.
select c.id,
       date '2020-01-01',
       coalesce(c.purchased_ml, 0),
       c.price_per_liter,
       'Перенос: цена из карточки препарата'
from public.chemicals c
where c.price_per_liter is not null
  and not exists (select 1 from public.chemical_purchases p where p.chemical_id = c.id);
