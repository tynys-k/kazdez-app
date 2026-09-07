-- Серверное закрытие периода для основных однодатных операций.
-- Интерфейс уже предупреждает пользователя; эти триггеры не дают обойти
-- ограничение прямым API, старой версией приложения или SECURITY DEFINER RPC.
-- Повторный запуск безопасен.

begin;

create or replace function public.kd_books_closed_until()
returns date
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case
    when s.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
      then (s.value #>> '{}')::date
    else null
  end
  from public.app_settings s
  where s.key = 'books_closed_until'
  limit 1
$function$;

create or replace function public.kd_enforce_open_period()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_closed_until date := public.kd_books_closed_until();
  v_old_text text;
  v_new_text text;
  v_old_date date;
  v_new_date date;
begin
  if v_closed_until is null then
    if TG_OP = 'DELETE' then return OLD; end if;
    return NEW;
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old_text := nullif(to_jsonb(OLD)->>TG_ARGV[0], '');
    if v_old_text is null and TG_NARGS > 1 then
      v_old_text := left(nullif(to_jsonb(OLD)->>TG_ARGV[1], ''), 10);
    end if;
    if v_old_text is not null then v_old_date := v_old_text::date; end if;
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new_text := nullif(to_jsonb(NEW)->>TG_ARGV[0], '');
    if v_new_text is null and TG_NARGS > 1 then
      v_new_text := left(nullif(to_jsonb(NEW)->>TG_ARGV[1], ''), 10);
    end if;
    if v_new_text is not null then v_new_date := v_new_text::date; end if;
  end if;

  if (v_old_date is not null and v_old_date <= v_closed_until)
     or (v_new_date is not null and v_new_date <= v_closed_until) then
    raise exception using
      errcode = '55000',
      message = format(
        'Период закрыт до %s: операция %s в таблице %s запрещена',
        to_char(v_closed_until, 'YYYY-MM-DD'), TG_OP, TG_TABLE_NAME
      ),
      hint = 'Сначала явно откройте период в Настройках, выполните исправление и закройте его снова.';
  end if;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end
$function$;

revoke all on function public.kd_books_closed_until() from public, anon, authenticated;
revoke all on function public.kd_enforce_open_period() from public, anon, authenticated;

drop trigger if exists kd_closed_period_jobs on public.jobs;
create trigger kd_closed_period_jobs
  before insert or update or delete on public.jobs
  for each row execute function public.kd_enforce_open_period('scheduled_date', 'created_at');

drop trigger if exists kd_closed_period_opex on public.opex;
create trigger kd_closed_period_opex
  before insert or update or delete on public.opex
  for each row execute function public.kd_enforce_open_period('spent_date', 'created_at');

drop trigger if exists kd_closed_period_money_moves on public.money_moves;
create trigger kd_closed_period_money_moves
  before insert or update or delete on public.money_moves
  for each row execute function public.kd_enforce_open_period('move_date', 'created_at');

drop trigger if exists kd_closed_period_tech_expenses on public.tech_expenses;
create trigger kd_closed_period_tech_expenses
  before insert or update or delete on public.tech_expenses
  for each row execute function public.kd_enforce_open_period('expense_date', 'created_at');

drop trigger if exists kd_closed_period_cash_adjustments on public.cash_adjustments;
create trigger kd_closed_period_cash_adjustments
  before insert or update or delete on public.cash_adjustments
  for each row execute function public.kd_enforce_open_period('event_date', 'created_at');

drop trigger if exists kd_closed_period_inventory_adjustments on public.inventory_adjustments;
create trigger kd_closed_period_inventory_adjustments
  before insert or update or delete on public.inventory_adjustments
  for each row execute function public.kd_enforce_open_period('event_date', 'created_at');

drop trigger if exists kd_closed_period_chemical_purchases on public.chemical_purchases;
create trigger kd_closed_period_chemical_purchases
  before insert or update or delete on public.chemical_purchases
  for each row execute function public.kd_enforce_open_period('purchase_date', 'created_at');

drop trigger if exists kd_closed_period_mkt_topups on public.mkt_topups;
create trigger kd_closed_period_mkt_topups
  before insert or update or delete on public.mkt_topups
  for each row execute function public.kd_enforce_open_period('topup_date', 'created_at');

notify pgrst, 'reload schema';

commit;

-- Контроль после применения:
-- select public.kd_books_closed_until();
-- select event_object_table, trigger_name
-- from information_schema.triggers
-- where trigger_name like 'kd_closed_period_%'
-- order by event_object_table, trigger_name;
