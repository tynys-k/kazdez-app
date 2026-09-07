-- =====================================================================
-- Срочное исправление после profile_privacy_lockdown.
--
-- Старые RLS-функции is_admin/kd_has_permission выполняются с правами
-- вошедшего пользователя и читают служебные поля profiles. Полный REVOKE
-- изолировал зарплаты, но заодно сломал проверку доступа к связанным таблицам.
--
-- Возвращаем только минимальные служебные колонки. salary_monthly, phone,
-- cash_opening_balance и cash_opening_date остаются недоступными напрямую.
-- Повторный запуск безопасен.
-- =====================================================================

grant select (id, role, is_active, access_overrides, branch_id)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';

-- Проверка после запуска: этот запрос должен завершиться permission denied.
-- select salary_monthly from public.profiles limit 1;
