-- =====================================================================
-- Снимок схемы для сверки кода с базой. ТОЛЬКО ЧТЕНИЕ, ничего не меняет.
-- Запускать в Supabase → SQL Editor и присылать результат, когда что-то
-- «слетело»: три инцидента 2026-08-27/29 (ревизия кассы, ревизия склада,
-- расход препаратов) были расхождением кода и базы, а не ошибкой в коде.
--
-- Вывод может обрезаться. Если нужен конкретный кусок — фильтруйте:
--   where tablename = 'report_chemicals'
-- =====================================================================

select 'TABLE  ' || table_name || ' :: ' || string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) as report
from information_schema.columns where table_schema = 'public' group by table_name
union all
select 'RLS    ' || c.relname || ' = ' || case when c.relrowsecurity then 'ON' else 'OFF' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
union all
-- permissive важен: RESTRICTIVE-политики складываются через И и могут
-- перекрыть все разрешающие, из-за чего таблица «молча пустая»
select 'POLICY ' || tablename || ' :: ' || policyname || ' [' || cmd || '/' || permissive || '] using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-')
from pg_policies where schemaname = 'public'
union all
select 'FUNC   ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all
select 'BUCKET ' || id || ' public=' || public::text from storage.buckets
order by 1;
