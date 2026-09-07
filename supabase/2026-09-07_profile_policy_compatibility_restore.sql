-- Аварийное восстановление совместимости после profile_policy_security_definer.
--
-- Часть действующих production-политик, отсутствующих в репозитории, напрямую
-- читает служебные поля profiles. Полный отзыв доступа ломает загрузку заявок,
-- тендеров, клиентов и других разделов. Повторный запуск безопасен.

begin;

revoke select on table public.profiles from anon, authenticated;

-- Только поля, необходимые старым проверкам доступа. Зарплата, телефон,
-- начальные остатки кассы и остальные персональные данные не выдаются.
grant select (id, role, is_active, access_overrides, branch_id)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';

commit;
