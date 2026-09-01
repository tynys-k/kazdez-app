-- =====================================================================
-- Колонки для вкладки «Зарплата» и кнопки «Выплатить».
--
-- Без них выплата не проходит: приложение шлёт account_id и paid_at,
-- база отвечает ошибкой «column does not exist», и окно просто остаётся
-- открытым.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- Оклад сотрудника в месяц. Из него считается начисление за период.
alter table public.profiles
  add column if not exists salary_monthly numeric default 0;

-- С какого счёта ушла выплата — иначе деньги не списываются с кассы.
alter table public.tech_expenses
  add column if not exists account_id uuid references public.accounts(id);

-- Когда выплату реально провели.
alter table public.tech_expenses
  add column if not exists paid_at date;

-- Проверка после запуска: обе строки должны вернуть данные.
-- select full_name, salary_monthly, work_schedule from public.profiles where role = 'tech';
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'tech_expenses'
--   and column_name in ('account_id', 'paid_at');
