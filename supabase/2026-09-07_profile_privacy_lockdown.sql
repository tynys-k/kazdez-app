-- =====================================================================
-- Закрытие прямого чтения profiles.
--
-- ЭТАП 2 ИЗ 2. Выполнять только после публикации версии приложения, которая
-- использует get_my_profile() и list_profiles_safe(). Повторный запуск безопасен.
-- =====================================================================

revoke select on table public.profiles from anon, authenticated;

-- Эти служебные поля нужны старым RLS-функциям is_admin/kd_has_permission:
-- они проверяют роль и персональные флажки перед чтением других таблиц.
-- Зарплата, телефон и кассовые поля в этот список намеренно не входят.
grant select (id, role, is_active, access_overrides, branch_id)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';

-- После применения прямой select salary_monthly через REST должен получить
-- permission denied, а обе безопасные RPC — продолжить работать.
