-- =====================================================================
-- Инвентаризация production-схемы перед дальнейшим усилением безопасности.
-- ТОЛЬКО ЧТЕНИЕ: запрос не создаёт, не меняет и не удаляет данные/объекты.
--
-- Результат содержит только структуру БД: колонки, RLS-политики, функции и
-- триггеры. Клиенты, телефоны, суммы операций и персональные строки
-- таблиц не читаются.
-- =====================================================================

with target_tables(table_name) as (
  values
    ('app_settings'),
    ('profiles'),
    ('jobs'),
    ('opex'),
    ('money_moves'),
    ('tech_expenses'),
    ('cash_deposits'),
    ('cash_adjustments'),
    ('inventory_adjustments'),
    ('chemicals'),
    ('chemical_purchases'),
    ('chemical_sales'),
    ('job_helpers'),
    ('mkt_topups'),
    ('job_debts'),
    ('paperwork'),
    ('tender_guarantees'),
    ('guarantee_returns')
),
table_structure as (
  select
    'TABLE'::text as object_type,
    format('public.%I', c.table_name) as object_name,
    ''::text as owner,
    ''::text as security,
    string_agg(
      format('%I %s%s', c.column_name, c.data_type, case when c.is_nullable = 'NO' then ' NOT NULL' else '' end),
      E'\n' order by c.ordinal_position
    ) as definition
  from information_schema.columns c
  join target_tables t using (table_name)
  where c.table_schema = 'public'
  group by c.table_name
),
relevant_functions as (
  select
    'FUNCTION'::text as object_type,
    format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_name,
    pg_get_userbyid(p.proowner) as owner,
    concat(
      case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
      case when p.proconfig is not null then ' · ' || array_to_string(p.proconfig, ', ') else '' end
    ) as security,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
),
filtered_functions as (
  select *
  from relevant_functions
  where object_name ~* '(is_admin|kd_has_permission|submit_report|save_report|close|period)'
     or definition ~* '(profiles|app_settings|books_closed_until|money_moves|tech_expenses|cash_adjustments|inventory_adjustments)'
),
relevant_policies as (
  select
    'POLICY'::text as object_type,
    format('public.%I :: %I', pol.tablename, pol.policyname) as object_name,
    array_to_string(pol.roles, ', ') as owner,
    concat(pol.cmd, ' · ', pol.permissive) as security,
    concat('USING: ', coalesce(pol.qual, '—'), E'\nWITH CHECK: ', coalesce(pol.with_check, '—')) as definition
  from pg_policies pol
  where pol.schemaname = 'public'
),
relevant_triggers as (
  select
    'TRIGGER'::text as object_type,
    format('public.%I :: %I', c.relname, tr.tgname) as object_name,
    pg_get_userbyid(c.relowner) as owner,
    case when tr.tgenabled = 'D' then 'DISABLED' else 'ENABLED' end as security,
    pg_get_triggerdef(tr.oid, true) as definition
  from pg_trigger tr
  join pg_class c on c.oid = tr.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join target_tables t on t.table_name = c.relname
  where n.nspname = 'public'
    and not tr.tgisinternal
)
select * from table_structure
union all
select * from filtered_functions
union all
select * from relevant_policies
union all
select * from relevant_triggers
order by object_type, object_name;
