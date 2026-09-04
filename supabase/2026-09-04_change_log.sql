-- =====================================================================
-- Журнал изменений: кто, что, было и стало.
--
-- Существующий audit_log пишет четыре поля: кто, роль, действие и текстовое
-- описание. Восстановить, кто и когда изменил сумму заявки с 40 000 на
-- 15 000, по нему невозможно — там нет ни значения «до», ни значения «после».
--
-- Пишем триггерами, а не вызовом из приложения. Вызов можно забыть, обойти
-- или потерять при слиянии — триггер срабатывает на любую запись, включая
-- правку прямо в SQL Editor.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.change_log (
  id         bigserial primary key,
  entity     text not null,
  entity_id  uuid,
  action     text not null,          -- insert | update | delete
  field      text,                   -- для update: какое поле изменилось
  before     text,
  after      text,
  actor      uuid,
  actor_name text,
  at         timestamptz not null default now()
);

create index if not exists change_log_at_idx     on public.change_log (at desc);
create index if not exists change_log_entity_idx on public.change_log (entity, entity_id);

alter table public.change_log enable row level security;

-- Читают те, кто и так видит журнал. Писать не может никто: единственный
-- источник записей — триггер, работающий с правами владельца функции.
drop policy if exists "change_log select" on public.change_log;
create policy "change_log select" on public.change_log
  for select to authenticated
  using (public.is_admin() or public.kd_has_permission('action.settings'));

-- ---------------------------------------------------------------------
-- Одна функция на все таблицы. Отслеживаемые поля передаются аргументами
-- триггера: писать все семьдесят колонок заявки — значит утопить журнал в
-- шуме и приучить в него не смотреть.
-- ---------------------------------------------------------------------
create or replace function public.kd_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col   text;
  b     text;
  a     text;
  eid   uuid;
  who   uuid;
  wname text;
  snap  jsonb := '{}'::jsonb;
begin
  who := auth.uid();
  if who is not null then
    select full_name into wname from public.profiles where id = who;
  end if;

  if TG_OP = 'DELETE' then
    eid := nullif(to_jsonb(OLD)->>'id', '')::uuid;
    insert into public.change_log(entity, entity_id, action, before, actor, actor_name)
      values (TG_TABLE_NAME, eid, 'delete', left(to_jsonb(OLD)::text, 2000), who, wname);
    return OLD;
  end if;

  eid := nullif(to_jsonb(NEW)->>'id', '')::uuid;

  if TG_OP = 'INSERT' then
    -- При создании пишем одну строку со снимком только отслеживаемых полей.
    foreach col in array TG_ARGV loop
      snap := snap || jsonb_build_object(col, to_jsonb(NEW)->>col);
    end loop;
    insert into public.change_log(entity, entity_id, action, after, actor, actor_name)
      values (TG_TABLE_NAME, eid, 'insert', left(snap::text, 2000), who, wname);
    return NEW;
  end if;

  -- update: по строке на каждое реально изменившееся поле
  foreach col in array TG_ARGV loop
    b := to_jsonb(OLD)->>col;
    a := to_jsonb(NEW)->>col;
    if b is distinct from a then
      insert into public.change_log(entity, entity_id, action, field, before, after, actor, actor_name)
        values (TG_TABLE_NAME, eid, 'update', col, left(b, 500), left(a, 500), who, wname);
    end if;
  end loop;
  return NEW;
end
$$;

-- ---------------------------------------------------------------------
-- Триггеры. Список полей — то, изменение чего может стоить денег или
-- скрыть чужую ошибку.
-- ---------------------------------------------------------------------

drop trigger if exists kd_changes_jobs on public.jobs;
create trigger kd_changes_jobs
  after insert or update or delete on public.jobs
  for each row execute function public.kd_log_changes(
    'report_paid','report_cash','report_qr','report_transfer','quoted_price',
    'status','assigned_to','scheduled_date','tech_bonus','tech_travel',
    'partner_id','partner_share','transport_cost','other_cost');

drop trigger if exists kd_changes_tech_expenses on public.tech_expenses;
create trigger kd_changes_tech_expenses
  after insert or update or delete on public.tech_expenses
  for each row execute function public.kd_log_changes(
    'amount','type','status','expense_date','account_id');

drop trigger if exists kd_changes_money_moves on public.money_moves;
create trigger kd_changes_money_moves
  after insert or update or delete on public.money_moves
  for each row execute function public.kd_log_changes(
    'amount','direction','account_id','move_date','source');

drop trigger if exists kd_changes_profiles on public.profiles;
create trigger kd_changes_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.kd_log_changes(
    'role','is_active','salary_monthly','work_schedule',
    'access_overrides','cash_opening_balance','cash_opening_date');

drop trigger if exists kd_changes_price_list on public.price_list;
create trigger kd_changes_price_list
  after insert or update or delete on public.price_list
  for each row execute function public.kd_log_changes(
    'pest','area_from','area_to','price');

drop trigger if exists kd_changes_chemicals on public.chemicals;
create trigger kd_changes_chemicals
  after insert or update or delete on public.chemicals
  for each row execute function public.kd_log_changes(
    'name','price_per_liter','purchased_ml','min_ml');

-- Настройки: сюда попадает и дата закрытия периода. Значения обрезаются
-- функцией, поэтому картинки печати не утопят журнал.
drop trigger if exists kd_changes_app_settings on public.app_settings;
create trigger kd_changes_app_settings
  after insert or update or delete on public.app_settings
  for each row execute function public.kd_log_changes('key','value');

-- Проверка после запуска: измени что-нибудь и посмотри
-- select at, actor_name, entity, field, before, after
--   from public.change_log order by at desc limit 20;
