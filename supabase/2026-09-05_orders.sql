-- =====================================================================
-- Заказ и визит — разные вещи.
--
-- Сейчас это одна сущность: «заявка». Из-за этого:
--   • гарантийный выезд — отдельная заявка с нулевой выручкой, и она тянет
--     вниз средний чек: продали одну обработку за 25 000, выехали дважды,
--     в отчёте «две заявки, средний чек 12 500». Такого чека не было;
--   • курс из нескольких обработок (обработка + контрольная через две
--     недели) продаётся как одна услуга, а в базе лежит как две несвязанные
--     заявки: сколько стоил заказ целиком, не спросить;
--   • обслуживание по договору — цепочка заявок, которая нигде не сходится.
--
-- Заказ — это то, о чём договорились с клиентом и за что он платит.
-- Визит — выезд. Один заказ может стоить один визит, а может три.
-- Выручка принадлежит заказу, работа — визиту.
--
-- Связи для переноса уже есть в базе: jobs.repeat_of (гарантийная цепочка)
-- и jobs.service_contract_id (абонентка). Ничего угадывать не нужно.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  -- корневая заявка, из которой заказ вырос. Нужна для повторного запуска
  -- переноса: по ней видно, что заказ уже заведён.
  root_job_id   uuid unique references public.jobs(id) on delete set null,
  address       text,
  object_id     uuid,
  client_phone  text,
  contact_name  text,
  branch_id     uuid,
  -- о чём договорились за ВЕСЬ заказ. Может отличаться от суммы визитов:
  -- если отличается — это и есть разговор о том, куда делись деньги.
  agreed_price  numeric,
  status        text not null default 'open',   -- open | done | canceled
  opened_on     date,
  closed_on     date,
  note          text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index if not exists orders_phone_idx  on public.orders (client_phone);
create index if not exists orders_object_idx on public.orders (object_id);
create index if not exists orders_status_idx on public.orders (status);

-- ---------------------------------------------------------------------
-- Заявка становится визитом заказа.
-- ---------------------------------------------------------------------
alter table public.jobs add column if not exists order_id   uuid references public.orders(id);
alter table public.jobs add column if not exists visit_no   integer;
-- primary   — первый выезд по заказу
-- control   — контрольный выезд, входит в цену (курс из нескольких обработок)
-- guarantee — выезд по гарантии, выручки не приносит
-- contract  — плановый выезд по абонентскому договору
alter table public.jobs add column if not exists visit_kind text;

create index if not exists jobs_order_idx on public.jobs (order_id);

alter table public.orders enable row level security;

-- Читают все вошедшие: исполнителю нужно видеть, что это второй визит по
-- заказу, а не новая работа с нуля.
drop policy if exists "orders select" on public.orders;
create policy "orders select" on public.orders
  for select to authenticated using (true);

drop policy if exists "orders write" on public.orders;
create policy "orders write" on public.orders
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

-- ---------------------------------------------------------------------
-- Перенос истории.
--
-- Корень цепочки — заявка без repeat_of. Она даёт заказ. Всё, что выросло
-- из неё по гарантии, уезжает в тот же заказ.
-- ---------------------------------------------------------------------

-- 1. Заказ на каждую корневую заявку, у которой его ещё нет.
insert into public.orders (root_job_id, address, object_id, client_phone, contact_name, branch_id, agreed_price, status, opened_on, created_by)
select j.id, j.address, j.object_id, j.client_phone, j.contact_name, j.branch_id,
       coalesce(j.report_paid, j.quoted_price),
       case when j.status = 'canceled' then 'canceled'
            when j.status = 'done'     then 'done'
            else 'open' end,
       j.scheduled_date,
       j.created_by
  from public.jobs j
 where j.repeat_of is null
   and not exists (select 1 from public.orders o where o.root_job_id = j.id);

-- 2. Цепочки гарантийных выездов: каждый визит уезжает в заказ своего корня.
--    Ограничение глубины на случай, если данные когда-то зациклятся —
--    молча повесить миграцию хуже, чем не разобрать один заказ.
with recursive chain as (
  select j.id, j.id as root, 1 as depth
    from public.jobs j
   where j.repeat_of is null
  union all
  select j.id, c.root, c.depth + 1
    from public.jobs j
    join chain c on j.repeat_of = c.id
   where c.depth < 20
)
update public.jobs j
   set order_id = o.id
  from chain c
  join public.orders o on o.root_job_id = c.root
 where j.id = c.id
   and j.order_id is distinct from o.id;

-- 3. Номер и тип визита внутри заказа.
with numbered as (
  select j.id,
         row_number() over (
           partition by j.order_id
           order by coalesce(j.scheduled_date, j.created_at::date), j.created_at
         ) as n,
         j.repeat_of, j.service_contract_id
    from public.jobs j
   where j.order_id is not null
)
update public.jobs j
   set visit_no   = n.n,
       visit_kind = case
                      when n.repeat_of is not null          then 'guarantee'
                      when n.service_contract_id is not null then 'contract'
                      else 'primary'
                    end
  from numbered n
 where j.id = n.id
   and (j.visit_no is distinct from n.n or j.visit_kind is null);

-- Изменения заказа попадают в журнал: цена заказа — то, о чём договорились
-- с клиентом, и правка задним числом должна оставлять след.
drop trigger if exists kd_changes_orders on public.orders;
create trigger kd_changes_orders
  after insert or update or delete on public.orders
  for each row execute function public.kd_log_changes('agreed_price', 'status', 'address', 'note');

-- Проверка после запуска:
-- select count(*) as заказов from public.orders;
-- select count(*) as заявок_без_заказа from public.jobs where order_id is null;
-- select visit_kind, count(*) from public.jobs group by 1;
-- -- заказы, где визитов больше одного:
-- select o.address, count(j.*) as визитов, sum(j.report_paid) as выручка
--   from public.orders o join public.jobs j on j.order_id = o.id
--  group by o.id, o.address having count(j.*) > 1 order by 2 desc limit 20;
