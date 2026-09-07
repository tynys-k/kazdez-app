-- Этап 5: серверные проверки роли без прямого чтения служебных полей profiles.
--
-- Миграция намеренно НЕ переписывает тела is_admin/kd_has_permission:
-- сохраняется уже работающая в production логика ролей и персональных исключений.
-- Повторный запуск безопасен.

begin;

do $migration$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Required function public.is_admin() was not found'
      using hint = 'Stop and restore the production function before applying this migration.';
  end if;

  if to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required function public.kd_has_permission(text) was not found'
      using hint = 'Stop and inspect the production function signature before applying this migration.';
  end if;

  -- SECURITY DEFINER заставляет функции читать profiles с правами их владельца,
  -- а не с правами браузера. Фиксированный search_path защищает их разрешение имён.
  alter function public.is_admin() security definer;
  alter function public.is_admin() set search_path = public, pg_temp;

  alter function public.kd_has_permission(text) security definer;
  alter function public.kd_has_permission(text) set search_path = public, pg_temp;
end
$migration$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.kd_has_permission(text) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.kd_has_permission(text) to authenticated, service_role;

-- После перевода проверок на сервер браузеру достаточно id для адресного UPDATE.
-- Роль, активность, филиал и access_overrides доступны только через безопасные RPC.
revoke select on table public.profiles from anon, authenticated;
grant select (id) on table public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения (запускать отдельно):
-- select p.proname, p.prosecdef, p.proconfig
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('is_admin', 'kd_has_permission');
-- Ожидается: prosecdef = true, proconfig содержит search_path=public, pg_temp.
