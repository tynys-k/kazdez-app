-- =====================================================================
-- Проведение документов через фирму и расчёты с партнёрами.
--
-- Три схемы одной и той же работы:
--
--   own          — наш клиент, документы делаем сами;
--   for_partner  — клиент партнёра, проводим через нас: деньги приходят нам,
--                  партнёру отдаём за вычетом нашего процента;
--   via_partner  — наш клиент, но нужен ОУР с НДС: проводим через партнёра,
--                  он удерживает свой процент и возвращает остаток.
--
-- Зачем это в системе, а не в переписке: бывает, что через месяц партнёр
-- говорит «ты мне не переводил», а перевод был. Здесь остаётся след — сумма,
-- дата, способ, на кого именно отправляли и с какого счёта.
--
-- Отдельно ведётся путь бумаги. Клиенты требовали возврат, ссылаясь на то,
-- что АВР не подписан, — теперь видно, где именно документ застрял: у
-- бухгалтера, у клиента, в машине или уже подшит в папку.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.paperwork (
  id             uuid primary key default gen_random_uuid(),
  scheme         text not null default 'own',      -- own | for_partner | via_partner
  partner_id     uuid references public.partners(id),
  client_id      uuid references public.clients(id),
  -- Клиента партнёра в нашей базе может не быть вовсе, поэтому имя и
  -- реквизиты хранятся строкой рядом со ссылкой.
  client_name    text,
  client_bin     text,
  requisites     text,

  amount         numeric not null default 0,       -- сумма по документам
  percent        numeric not null default 0,       -- процент удержания
  payment_method text not null default 'transfer', -- transfer | cash

  -- Путь бумаги. Каждый шаг — дата: пусто значит «ещё не сделано».
  requisites_at    date,
  contract_at      date,
  invoice_at       date,
  paid_at          date,
  receipt_at       date,   -- чек за наличные
  avr_ready_at     date,
  avr_sent_at      date,   -- отвезли или отправили клиенту
  avr_signed_at    date,
  avr_returned_at  date,   -- забрали подписанный
  avr_office_at    date,   -- привезли в офис
  filed_at         date,   -- подшит в папку

  -- Расчёт со второй стороной.
  settled_at        date,
  settle_method     text,   -- каспи | наличные | перевод
  settle_to         text,   -- на кого именно отправили, если просили на другое лицо
  settle_account_id uuid references public.accounts(id),
  settle_note       text,

  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paperwork_scheme_idx  on public.paperwork (scheme, created_at desc);
create index if not exists paperwork_partner_idx on public.paperwork (partner_id);
create index if not exists paperwork_open_idx    on public.paperwork (settled_at) where settled_at is null;

-- Один комплект документов может закрывать несколько выездов: месячный АВР
-- по нескольким обработкам одной фирмы — обычное дело.
create table if not exists public.paperwork_jobs (
  paperwork_id uuid not null references public.paperwork(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  primary key (paperwork_id, job_id)
);

create index if not exists paperwork_jobs_job_idx on public.paperwork_jobs (job_id);

alter table public.paperwork enable row level security;
alter table public.paperwork_jobs enable row level security;

-- Читают все вошедшие: исполнителю полезно видеть, что по его заявке
-- документы ещё не закрыты.
drop policy if exists "paperwork select" on public.paperwork;
create policy "paperwork select" on public.paperwork
  for select to authenticated using (true);

drop policy if exists "paperwork_jobs select" on public.paperwork_jobs;
create policy "paperwork_jobs select" on public.paperwork_jobs
  for select to authenticated using (true);

-- Ведут документы те же, кто работает с документами и деньгами.
drop policy if exists "paperwork write" on public.paperwork;
create policy "paperwork write" on public.paperwork
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.finance_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.finance_edit'));

drop policy if exists "paperwork_jobs write" on public.paperwork_jobs;
create policy "paperwork_jobs write" on public.paperwork_jobs
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.finance_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.docs_edit') or public.kd_has_permission('action.finance_edit'));

-- Изменения сумм и расчётов попадают в журнал «было → стало».
drop trigger if exists kd_changes_paperwork on public.paperwork;
create trigger kd_changes_paperwork
  after insert or update or delete on public.paperwork
  for each row execute function public.kd_log_changes(
    'scheme', 'partner_id', 'amount', 'percent', 'payment_method',
    'paid_at', 'settled_at', 'settle_method', 'settle_to', 'settle_account_id');

-- Проверка после запуска:
-- select scheme, count(*) from public.paperwork group by 1;
-- select p.scheme, pt.name, p.amount, p.percent, p.settled_at
--   from public.paperwork p left join public.partners pt on pt.id = p.partner_id
--  order by p.created_at desc limit 20;
