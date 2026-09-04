-- =====================================================================
-- Контроль цены: прайсовая цена фиксируется в заявке, скидка требует причины.
--
-- Прайс в системе есть, но итоговая сумма — это то, что исполнитель ввёл в
-- отчёте. Отклонение вниз ничем не ограничено и нигде не видно. Отсюда самая
-- простая схема увода денег: работа за 25 000 проводится как 15 000, разница
-- делится с клиентом. При наличном расчёте следов не остаётся.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- Цена по прайсу на момент оформления заявки. Считается один раз и потом не
-- пересчитывается: прайс могут поменять, а сравнивать надо с той ценой, по
-- которой договаривались.
alter table public.jobs
  add column if not exists quoted_price numeric;

create table if not exists public.job_discounts (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null unique references public.jobs(id) on delete cascade,
  quoted     numeric not null,
  charged    numeric not null,
  -- код причины из списка в src/shared.jsx, свободный ввод намеренно закрыт
  reason     text not null,
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_discounts_created_idx on public.job_discounts (created_at desc);

alter table public.job_discounts enable row level security;

-- Видят все вошедшие: скидка — это то, что должно быть на виду.
drop policy if exists "job_discounts select" on public.job_discounts;
create policy "job_discounts select" on public.job_discounts
  for select to authenticated using (true);

-- Пишет исполнитель по своей заявке (он же сдаёт отчёт) или тот, кто правит
-- заявки. Причину указывает тот, кто скидку дал.
drop policy if exists "job_discounts write" on public.job_discounts;
create policy "job_discounts write" on public.job_discounts
  for all to authenticated
  using (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  )
  with check (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  );

-- Перенос: проставляем прайсовую цену уже выполненным заявкам, чтобы отчёт по
-- скидкам заработал не с чистого листа. Берём ступень прайса по виду
-- вредителя и площади — ту же, что считает priceFor в приложении.
update public.jobs j
   set quoted_price = p.price
  from public.price_list p
 where j.quoted_price is null
   and j.area is not null
   and lower(btrim(j.pest)) = lower(btrim(p.pest))
   and j.area >= coalesce(p.area_from, 0)
   and j.area <= coalesce(p.area_to, 1e9);

-- Проверка после запуска:
-- select count(*) filter (where quoted_price is not null) as с_ценой,
--        count(*) as всего from public.jobs;
