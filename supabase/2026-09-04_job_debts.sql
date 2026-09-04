-- =====================================================================
-- Долги клиентов по выполненным заявкам.
--
-- Работа сделана, а клиент заплатил не всё или не заплатил вовсе. Раньше
-- это просто уменьшало выручку: недоплата выглядела как скидка, и через
-- месяц никто не помнил, кто кому должен.
--
-- Долг — это не скидка. Скидку дали осознанно, долг обещали вернуть.
-- Поэтому у долга есть срок и он висит, пока не закрыт.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.job_debts (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null unique references public.jobs(id) on delete cascade,
  amount     numeric not null default 0,
  due_on     date,
  paid_on    date,
  paid_account_id uuid references public.accounts(id),
  note       text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists job_debts_open_idx on public.job_debts (due_on) where paid_on is null;

alter table public.job_debts enable row level security;

-- Видят все вошедшие: исполнителю полезно знать, что по его заявке долг
-- ещё висит, — он с этим клиентом ещё встретится.
drop policy if exists "job_debts select" on public.job_debts;
create policy "job_debts select" on public.job_debts
  for select to authenticated using (true);

-- Заводит долг тот, кто сдаёт отчёт по заявке, закрывает — тот, кто ведёт
-- деньги.
drop policy if exists "job_debts write" on public.job_debts;
create policy "job_debts write" on public.job_debts
  for all to authenticated
  using (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or public.kd_has_permission('action.finance_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  )
  with check (
    public.is_admin()
    or public.kd_has_permission('action.jobs_edit')
    or public.kd_has_permission('action.finance_edit')
    or exists (select 1 from public.jobs j where j.id = job_id and j.assigned_to = auth.uid())
  );

-- Суммы и закрытие долга попадают в журнал «было → стало».
drop trigger if exists kd_changes_job_debts on public.job_debts;
create trigger kd_changes_job_debts
  after insert or update or delete on public.job_debts
  for each row execute function public.kd_log_changes('amount', 'due_on', 'paid_on', 'paid_account_id');

-- Проверка после запуска:
-- select j.pest, j.address, d.amount, d.due_on, d.paid_on
--   from public.job_debts d join public.jobs j on j.id = d.job_id
--  where d.paid_on is null order by d.due_on;
