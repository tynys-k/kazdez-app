-- =====================================================================
-- Филиалы, города и юридические лица.
--
-- Сейчас компания одна и город один, поэтому филиала как понятия нет.
-- Проблема в том, что вводить его задним числом втрое дороже: придётся
-- разносить по филиалам уже накопленные заявки, кассы и расходы, а часть
-- истории окажется неразделимой.
--
-- Поэтому филиал заводится ДО открытия второго города. Сегодня он один,
-- всё уезжает в него, и в интерфейсе ничего не меняется — но когда город
-- появится, вопрос «сколько заработал Астана» будет иметь ответ.
--
-- Здесь же живёт юрлицо: от какого ТОО выставляются документы. Раньше это
-- была строка jobs.brand со значениями «KazDez» и «Sanitex».
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.branches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  -- юрлицо, от которого идут документы этого филиала
  legal_name    text,
  bin           text,
  legal_address text,
  is_default    boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Филиал по умолчанию ровно один: он подставляется везде, где не выбрали.
create unique index if not exists branches_default_uniq
  on public.branches (is_default) where is_default;

alter table public.branches enable row level security;

drop policy if exists "branches select" on public.branches;
create policy "branches select" on public.branches
  for select to authenticated using (true);

drop policy if exists "branches write" on public.branches;
create policy "branches write" on public.branches
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.settings'))
  with check (public.is_admin() or public.kd_has_permission('action.settings'));

-- ---------------------------------------------------------------------
-- Принадлежность к филиалу. Начинаем с четырёх мест, где деньги и люди:
-- заявки, счета, операционные расходы, сотрудники. Склад пока общий —
-- разделять остатки по филиалам имеет смысл только когда складов
-- действительно несколько.
-- ---------------------------------------------------------------------
alter table public.jobs     add column if not exists branch_id uuid references public.branches(id);
alter table public.accounts add column if not exists branch_id uuid references public.branches(id);
alter table public.opex     add column if not exists branch_id uuid references public.branches(id);
alter table public.profiles add column if not exists branch_id uuid references public.branches(id);

create index if not exists jobs_branch_idx     on public.jobs (branch_id);
create index if not exists accounts_branch_idx on public.accounts (branch_id);
create index if not exists opex_branch_idx     on public.opex (branch_id);

-- ---------------------------------------------------------------------
-- Перенос: один филиал, всё существующее — в него.
-- ---------------------------------------------------------------------
insert into public.branches (name, city, legal_name, is_default)
select 'Алматы', 'Алматы', 'KazDez', true
where not exists (select 1 from public.branches);

update public.jobs     set branch_id = (select id from public.branches where is_default) where branch_id is null;
update public.accounts set branch_id = (select id from public.branches where is_default) where branch_id is null;
update public.opex     set branch_id = (select id from public.branches where is_default) where branch_id is null;
update public.profiles set branch_id = (select id from public.branches where is_default) where branch_id is null;

-- Смена филиала у заявки — событие для журнала: вместе с ней уезжает выручка.
drop trigger if exists kd_changes_branches on public.branches;
create trigger kd_changes_branches
  after insert or update or delete on public.branches
  for each row execute function public.kd_log_changes('name', 'city', 'legal_name', 'bin', 'active');

-- Проверка после запуска:
-- select b.name, count(j.*) as заявок, sum(j.report_paid) as выручка
--   from public.branches b left join public.jobs j on j.branch_id = b.id
--  group by b.name;
