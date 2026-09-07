-- Закрытие периода для операций, у которых хозяйственное событие и оплата
-- происходят в разные даты. Старую неоплаченную операцию можно оплатить в
-- открытом периоде, но её исходные сумма и дата уже не переписываются.
-- Требует предварительного применения 2026-09-07_server_period_lock.sql.
-- Повторный запуск безопасен.

begin;

-- Долг относится к дате заявки, а не к сроку оплаты. Отдельная функция
-- находит эту дату на сервере, чтобы клиент не мог подменить её в запросе.
create or replace function public.kd_enforce_job_debt_open_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_closed_until date := public.kd_books_closed_until();
  v_job_id uuid;
  v_event_date date;
begin
  if v_closed_until is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_job_id := nullif(to_jsonb(OLD)->>'job_id', '')::uuid;
    select coalesce(j.scheduled_date, j.created_at::date)
      into v_event_date
      from public.jobs j
     where j.id = v_job_id;

    if v_event_date is not null and v_event_date <= v_closed_until then
      raise exception using
        errcode = '55000',
        message = format(
          'Период закрыт до %s: долг по заявке от %s изменять нельзя',
          to_char(v_closed_until, 'YYYY-MM-DD'), to_char(v_event_date, 'YYYY-MM-DD')
        ),
        hint = 'Погашение старого долга проводите текущей датой. Для исправления самого долга сначала явно откройте период.';
    end if;
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_job_id := nullif(to_jsonb(NEW)->>'job_id', '')::uuid;
    select coalesce(j.scheduled_date, j.created_at::date)
      into v_event_date
      from public.jobs j
     where j.id = v_job_id;

    if v_event_date is not null and v_event_date <= v_closed_until then
      raise exception using
        errcode = '55000',
        message = format(
          'Период закрыт до %s: долг по заявке от %s изменять нельзя',
          to_char(v_closed_until, 'YYYY-MM-DD'), to_char(v_event_date, 'YYYY-MM-DD')
        ),
        hint = 'Погашение старого долга проводите текущей датой. Для исправления самого долга сначала явно откройте период.';
    end if;
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end
$function$;

revoke all on function public.kd_enforce_job_debt_open_period() from public, anon, authenticated;

-- Продажа препарата и её последующая оплата — два независимых события.
drop trigger if exists kd_closed_period_chemical_sale_lifecycle on public.chemical_sales;
create trigger kd_closed_period_chemical_sale_lifecycle
  before insert or delete on public.chemical_sales
  for each row execute function public.kd_enforce_open_period('sold_on', 'created_at');

drop trigger if exists kd_closed_period_chemical_sale_update on public.chemical_sales;
create trigger kd_closed_period_chemical_sale_update
  before update of partner_id, chemical_id, amount, from_tech_id, unit_price, total, sold_on, note, created_by
  on public.chemical_sales
  for each row execute function public.kd_enforce_open_period('sold_on', 'created_at');

drop trigger if exists kd_closed_period_chemical_payment_lifecycle on public.chemical_sales;
create trigger kd_closed_period_chemical_payment_lifecycle
  before insert or delete on public.chemical_sales
  for each row execute function public.kd_enforce_open_period('paid_on');

drop trigger if exists kd_closed_period_chemical_payment_update on public.chemical_sales;
create trigger kd_closed_period_chemical_payment_update
  before update of paid_on, account_id on public.chemical_sales
  for each row execute function public.kd_enforce_open_period('paid_on');

-- Сумма долга закреплена за датой заявки; погашение — за paid_on.
drop trigger if exists kd_closed_period_job_debt_lifecycle on public.job_debts;
create trigger kd_closed_period_job_debt_lifecycle
  before insert or delete on public.job_debts
  for each row execute function public.kd_enforce_job_debt_open_period();

drop trigger if exists kd_closed_period_job_debt_update on public.job_debts;
create trigger kd_closed_period_job_debt_update
  before update of job_id, amount, due_on, note, created_by on public.job_debts
  for each row execute function public.kd_enforce_job_debt_open_period();

drop trigger if exists kd_closed_period_job_debt_payment_lifecycle on public.job_debts;
create trigger kd_closed_period_job_debt_payment_lifecycle
  before insert or delete on public.job_debts
  for each row execute function public.kd_enforce_open_period('paid_on');

drop trigger if exists kd_closed_period_job_debt_payment_update on public.job_debts;
create trigger kd_closed_period_job_debt_payment_update
  before update of paid_on, paid_account_id on public.job_debts
  for each row execute function public.kd_enforce_open_period('paid_on');

-- В документах приход денег и расчёт с партнёром могут быть в разные дни.
drop trigger if exists kd_closed_period_paperwork_payment_lifecycle on public.paperwork;
create trigger kd_closed_period_paperwork_payment_lifecycle
  before insert or delete on public.paperwork
  for each row execute function public.kd_enforce_open_period('paid_at');

drop trigger if exists kd_closed_period_paperwork_payment_update on public.paperwork;
create trigger kd_closed_period_paperwork_payment_update
  before update of scheme, partner_id, client_id, client_name, client_bin, requisites,
    amount, percent, payment_method, paid_at
  on public.paperwork
  for each row execute function public.kd_enforce_open_period('paid_at');

drop trigger if exists kd_closed_period_paperwork_settlement_lifecycle on public.paperwork;
create trigger kd_closed_period_paperwork_settlement_lifecycle
  before insert or delete on public.paperwork
  for each row execute function public.kd_enforce_open_period('settled_at');

drop trigger if exists kd_closed_period_paperwork_settlement_update on public.paperwork;
create trigger kd_closed_period_paperwork_settlement_update
  before update of scheme, partner_id, amount, percent, settled_at, settle_method,
    settle_to, settle_account_id, settle_note
  on public.paperwork
  for each row execute function public.kd_enforce_open_period('settled_at');

-- Внесение тендерного обеспечения и его итоговая отметка возврата также
-- считаются разными событиями.
drop trigger if exists kd_closed_period_guarantee_payment_lifecycle on public.tender_guarantees;
create trigger kd_closed_period_guarantee_payment_lifecycle
  before insert or delete on public.tender_guarantees
  for each row execute function public.kd_enforce_open_period('paid_date', 'created_at');

drop trigger if exists kd_closed_period_guarantee_payment_update on public.tender_guarantees;
create trigger kd_closed_period_guarantee_payment_update
  before update of tender_id, kind, amount, paid, paid_date, account_id, note
  on public.tender_guarantees
  for each row execute function public.kd_enforce_open_period('paid_date');

drop trigger if exists kd_closed_period_guarantee_return_lifecycle on public.tender_guarantees;
create trigger kd_closed_period_guarantee_return_lifecycle
  before insert or delete on public.tender_guarantees
  for each row execute function public.kd_enforce_open_period('return_date');

drop trigger if exists kd_closed_period_guarantee_return_update on public.tender_guarantees;
create trigger kd_closed_period_guarantee_return_update
  before update of returned, return_date on public.tender_guarantees
  for each row execute function public.kd_enforce_open_period('return_date');

-- Каждый частичный возврат — самостоятельное денежное событие.
drop trigger if exists kd_closed_period_guarantee_returns on public.guarantee_returns;
create trigger kd_closed_period_guarantee_returns
  before insert or update or delete on public.guarantee_returns
  for each row execute function public.kd_enforce_open_period('return_date', 'created_at');

notify pgrst, 'reload schema';

commit;

-- Контроль после применения:
-- select event_object_table, trigger_name
-- from information_schema.triggers
-- where trigger_name like 'kd_closed_period_%'
-- order by event_object_table, trigger_name;
