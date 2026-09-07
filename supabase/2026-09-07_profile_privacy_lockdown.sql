-- =====================================================================
-- Закрытие прямого чтения profiles.
--
-- ЭТАП 2 ИЗ 2. Выполнять только после публикации версии приложения, которая
-- использует get_my_profile() и list_profiles_safe(). Повторный запуск безопасен.
-- =====================================================================

revoke select on table public.profiles from anon, authenticated;

-- id нужен PostgreSQL для WHERE при разрешённом политиками обновлении профиля.
-- Остальные поля читаются только через безопасные функции выше.
grant select (id) on table public.profiles to authenticated;

notify pgrst, 'reload schema';

-- После применения прямой select salary_monthly через REST должен получить
-- permission denied, а обе безопасные RPC — продолжить работать.
