-- Отдельный сценарий для заявок, точная цена которых определяется на объекте.
-- Ноль больше не играет роль фиктивной исходной цены: результат оценки
-- фиксируется при сдаче обычного отчёта и становится ценой заказа.

begin;

alter table public.jobs add column if not exists pricing_mode text not null default 'quoted';
alter table public.jobs add column if not exists assessed_amount numeric;
alter table public.jobs add column if not exists assessment_completed_at timestamptz;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_pricing_mode_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_pricing_mode_check
      check (pricing_mode in ('quoted', 'on_site_estimate'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_assessed_amount_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_assessed_amount_check
      check (assessed_amount is null or assessed_amount >= 0);
  end if;
end
$constraints$;

create index if not exists jobs_pending_on_site_estimate_idx
  on public.jobs (scheduled_date, assigned_to)
  where pricing_mode = 'on_site_estimate' and assessment_completed_at is null;

create or replace function public.kd_capture_on_site_estimate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.pricing_mode = 'on_site_estimate' then
    -- Для оценки нет исходной договорённой цены. Ориентир остаётся в заметке.
    new.quoted_price := null;
    new.price_options := '[]'::jsonb;
    if new.status = 'done' then
      if coalesce(new.report_paid, 0) < 0 then
        raise exception using errcode = '22023', message = 'Итоговая сумма оценки не может быть отрицательной';
      end if;
      new.assessed_amount := coalesce(new.report_paid, 0);
      new.assessment_completed_at := coalesce(new.reported_at, new.assessment_completed_at, now());
    end if;
  else
    new.assessed_amount := null;
    new.assessment_completed_at := null;
  end if;
  return new;
end
$function$;

drop trigger if exists kd_capture_on_site_estimate on public.jobs;
create trigger kd_capture_on_site_estimate
before insert or update of pricing_mode, price_options, quoted_price, status, report_paid, reported_at
on public.jobs for each row execute function public.kd_capture_on_site_estimate();

create or replace function public.kd_sync_assessed_order_price()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.pricing_mode = 'on_site_estimate'
     and new.status = 'done'
     and new.order_id is not null then
    update public.orders
       set agreed_price = new.assessed_amount,
           status = 'done',
           closed_on = coalesce(new.scheduled_date, current_date)
     where id = new.order_id;
  end if;
  return null;
end
$function$;

drop trigger if exists kd_sync_assessed_order_price on public.jobs;
create trigger kd_sync_assessed_order_price
after insert or update of pricing_mode, status, report_paid, assessed_amount
on public.jobs for each row execute function public.kd_sync_assessed_order_price();

revoke all on function public.kd_capture_on_site_estimate() from public, anon;
revoke all on function public.kd_sync_assessed_order_price() from public, anon;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'jobs'
--   and column_name in ('pricing_mode', 'assessed_amount', 'assessment_completed_at');
