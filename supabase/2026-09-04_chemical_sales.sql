-- =====================================================================
-- Продажа препаратов партнёрам.
--
-- Партнёр забирает препарат — иногда со склада, иногда прямо у дезинфектора
-- на объекте. Если не снять это с остатка того, у кого забрали, у него
-- навсегда останется недостача, которую он не делал, а склад покажет
-- препарат, которого нет.
--
-- Плюс вторая половина: партнёр за препарат должен заплатить, и это надо
-- держать на виду до оплаты.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.chemical_sales (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id),
  chemical_id  uuid not null references public.chemicals(id),
  -- количество в базовых единицах препарата (мл / г / шт)
  amount       numeric not null default 0,
  -- у кого забрали: пусто значит со склада
  from_tech_id uuid references public.profiles(id),
  -- цена за большую единицу (литр / кг / штуку), как её называют в разговоре
  unit_price   numeric not null default 0,
  total        numeric not null default 0,
  sold_on      date not null default current_date,

  paid_on      date,
  account_id   uuid references public.accounts(id),

  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists chemical_sales_partner_idx on public.chemical_sales (partner_id);
create index if not exists chemical_sales_unpaid_idx  on public.chemical_sales (sold_on desc) where paid_on is null;

alter table public.chemical_sales enable row level security;

drop policy if exists "chemical_sales select" on public.chemical_sales;
create policy "chemical_sales select" on public.chemical_sales
  for select to authenticated using (true);

-- Оформляют те, кто ведёт склад или деньги: это одновременно и движение
-- препарата, и долг партнёра.
drop policy if exists "chemical_sales write" on public.chemical_sales;
create policy "chemical_sales write" on public.chemical_sales
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.stock_edit') or public.kd_has_permission('action.finance_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.stock_edit') or public.kd_has_permission('action.finance_edit'));

-- Суммы и оплата попадают в журнал «было → стало».
drop trigger if exists kd_changes_chemical_sales on public.chemical_sales;
create trigger kd_changes_chemical_sales
  after insert or update or delete on public.chemical_sales
  for each row execute function public.kd_log_changes(
    'partner_id', 'chemical_id', 'amount', 'unit_price', 'total', 'paid_on', 'account_id');

-- Проверка после запуска:
-- select p.name, c.name, s.amount, s.total, s.sold_on, s.paid_on
--   from public.chemical_sales s
--   join public.partners p on p.id = s.partner_id
--   join public.chemicals c on c.id = s.chemical_id
--  order by s.sold_on desc;
