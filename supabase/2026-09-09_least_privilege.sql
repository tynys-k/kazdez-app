-- =====================================================================
-- Область видимости бизнес-таблиц: каждый видит свою работу.
--
-- Восемнадцать миграций объявляли чтение как `using (true)`. Это значит,
-- что любой вошедший в систему сотрудник мог получить через REST-запрос
-- всю базу клиентов с телефонами, все объекты, закупочные цены препаратов,
-- долги клиентов, расчёты с партнёрами и отметки об инструктажах — вне
-- зависимости от того, что показывает интерфейс.
--
-- Скрытая кнопка не является защитой. Проверка должна стоять в базе.
--
-- Правило простое: исполнитель видит то, что связано с его выездами;
-- деньги, закупки и кадровые записи видит тот, кому это разрешено ролью.
--
-- ВАЖНО о том, чего эта миграция НЕ может.
-- Разрешающие политики в Postgres складываются через ИЛИ. Если на таблице
-- останется ещё одна разрешающая политика чтения (созданная раньше и не
-- попавшая в Git), новая ничего не закроет. Проверочный запрос в конце
-- файла показывает ВСЕ политики каждой таблицы — прогоните его и убедитесь,
-- что на таблице ровно одна политика select.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

begin;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null then
    raise exception 'Не найдена функция public.kd_account_active()';
  end if;
  if to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Не найдена функция public.kd_has_permission(text)';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Не найдена функция public.is_admin()';
  end if;
  if to_regprocedure('public.kd_phone_key(text)') is null then
    raise exception 'Не найдена функция public.kd_phone_key(text)';
  end if;
end
$migration$;

-- ---------------------------------------------------------------------
-- Две проверки, на которых стоит всё остальное.
--
-- Помощник на заявке приравнен к исполнителю: он там был и делал ту же
-- работу. Иначе половина бригады не увидит собственный выезд.
-- ---------------------------------------------------------------------
create or replace function public.kd_can_see_job(p_job uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or exists (
        select 1 from public.jobs j
         where j.id = p_job and j.assigned_to = auth.uid())
      or exists (
        select 1 from public.job_helpers h
         where h.job_id = p_job and h.tech_id = auth.uid())
    )
$function$;

revoke all on function public.kd_can_see_job(uuid) from public, anon;
grant execute on function public.kd_can_see_job(uuid) to authenticated, service_role;

-- Объект виден тому, кто на него хотя бы раз выезжал. История точки — часть
-- работы исполнителя: «здесь уже были, чем травили и почему не помогло».
create or replace function public.kd_can_see_object(p_object uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or exists (
        select 1 from public.jobs j
         where j.object_id = p_object and j.assigned_to = auth.uid())
    )
$function$;

revoke all on function public.kd_can_see_object(uuid) from public, anon;
grant execute on function public.kd_can_see_object(uuid) to authenticated, service_role;

-- Проверка прав выполняется теперь на каждой строке, поэтому индексы под неё
-- обязательны. Без них ограничение доступа превратится в тормоз на списках.
create index if not exists jobs_assigned_idx        on public.jobs (assigned_to);
create index if not exists jobs_object_assigned_idx on public.jobs (object_id, assigned_to);
create index if not exists jobs_order_assigned_idx  on public.jobs (order_id, assigned_to);
create index if not exists job_helpers_tech_idx     on public.job_helpers (tech_id);

-- ---------------------------------------------------------------------
-- Заявка и всё, что к ней прицеплено.
--
-- Права на запись не трогаем: они уже разделены правильно. Меняем только
-- чтение, где стояло «видно всем».
-- ---------------------------------------------------------------------

-- Кто ещё работал на выезде и сколько ему начислено. Свою строку помощник
-- видит всегда: это его деньги, и узнавать о них из чужих слов неправильно.
drop policy if exists "job_helpers select" on public.job_helpers;
create policy "job_helpers select" on public.job_helpers
  for select to authenticated
  using (public.kd_can_see_job(job_id) or tech_id = auth.uid());

-- Долг клиента по заявке. Исполнитель был на объекте и знает, что деньги
-- не отдали целиком, — скрывать от него нечего. Чужие долги не показываем.
drop policy if exists "job_debts select" on public.job_debts;
create policy "job_debts select" on public.job_debts
  for select to authenticated
  using (public.kd_can_see_job(job_id));

drop policy if exists "job_equipment select" on public.job_equipment;
create policy "job_equipment select" on public.job_equipment
  for select to authenticated
  using (public.kd_can_see_job(job_id));

drop policy if exists "job_chem_details select" on public.job_chem_details;
create policy "job_chem_details select" on public.job_chem_details
  for select to authenticated
  using (public.kd_can_see_job(job_id));

-- Разбор повторного выезда. Исполнитель должен видеть оценку своей работы
-- здесь, а не узнавать о претензии в разговоре о премии. Но только свою.
drop policy if exists "repeat_causes select" on public.repeat_causes;
create policy "repeat_causes select" on public.repeat_causes
  for select to authenticated
  using (public.kd_can_see_job(job_id));

-- Скидка по заявке: сколько было по прайсу и сколько взяли. Чужие скидки —
-- материал для разговора о полномочиях, и посторонним он не нужен.
drop policy if exists "job_discounts select" on public.job_discounts;
create policy "job_discounts select" on public.job_discounts
  for select to authenticated
  using (public.kd_can_see_job(job_id));

-- Заказ виден тому, у кого в нём есть хотя бы один визит.
--
-- Здесь и в двух следующих политиках намеренно используется `in (подзапрос)`,
-- а не `exists`: подзапрос не зависит от строки, планировщик выполняет его
-- один раз и складывает в хеш. С `exists` проверка выполнялась бы заново для
-- каждой строки списка, и на нескольких тысячах записей это заметно.
drop policy if exists "orders select" on public.orders;
create policy "orders select" on public.orders
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or orders.id in (
        select j.order_id from public.jobs j
         where j.assigned_to = auth.uid() and j.order_id is not null)
    )
  );

-- ---------------------------------------------------------------------
-- Объект и то, что на нём стоит.
-- ---------------------------------------------------------------------

drop policy if exists "objects select" on public.objects;
create policy "objects select" on public.objects
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or objects.id in (
        select j.object_id from public.jobs j
         where j.assigned_to = auth.uid() and j.object_id is not null)
    )
  );

drop policy if exists "control_points select" on public.control_points;
create policy "control_points select" on public.control_points
  for select to authenticated
  using (public.kd_can_see_object(object_id));

drop policy if exists "control_checks select" on public.control_checks;
create policy "control_checks select" on public.control_checks
  for select to authenticated
  using (
    exists (
      select 1 from public.control_points p
       where p.id = control_checks.point_id
         and public.kd_can_see_object(p.object_id))
  );

-- ---------------------------------------------------------------------
-- Клиенты.
--
-- Самая дорогая таблица в базе: имя и телефон каждого, кто когда-либо
-- обращался. Готовая клиентская база в одном REST-запросе.
--
-- Исполнитель видит клиента, к которому его отправляли. Связь идёт по
-- тому же ключу телефона, по которому клиент и собирается.
-- ---------------------------------------------------------------------
drop policy if exists "clients select" on public.clients;
create policy "clients select" on public.clients
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or clients.phone_key in (
        select public.kd_phone_key(j.client_phone) from public.jobs j
         where j.assigned_to = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Деньги, закупки и партнёры — по роли, а не по факту входа в систему.
--
-- Ни один экран исполнителя эти таблицы не читает: они используются только
-- в расчётах себестоимости, на складе и в разделах партнёров и документов.
-- ---------------------------------------------------------------------

-- Закупочные цены и поставщики. По ним считается вся себестоимость.
drop policy if exists chemical_purchases_read on public.chemical_purchases;
create policy chemical_purchases_read on public.chemical_purchases
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.stock_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  );

drop policy if exists "chemical_sales select" on public.chemical_sales;
create policy "chemical_sales select" on public.chemical_sales
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.stock_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  );

-- Путь документов и расчёты с партнёрами: реквизиты, БИН, суммы, проценты.
drop policy if exists "paperwork select" on public.paperwork;
create policy "paperwork select" on public.paperwork
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.finance_edit')
      or public.kd_has_permission('action.docs_edit')
    )
  );

drop policy if exists "paperwork_jobs select" on public.paperwork_jobs;
create policy "paperwork_jobs select" on public.paperwork_jobs
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.finance_edit')
      or public.kd_has_permission('action.docs_edit')
    )
  );

-- Прайс. Нужен там, где оформляют заявку и считают отклонения от цены;
-- кнопки «Новая заявка» у исполнителя нет.
drop policy if exists "price_list select" on public.price_list;
create policy "price_list select" on public.price_list
  for select to authenticated
  using (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.jobs_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  );

-- Отметки об ознакомлении с инструктажами. Свои — всегда; чужие — кадрам.
drop policy if exists "safety_ack select" on public.safety_acknowledgements;
create policy "safety_ack select" on public.safety_acknowledgements
  for select to authenticated
  using (
    person_id = auth.uid()
    or public.is_admin()
    or public.kd_has_permission('action.team_manage')
  );

-- ---------------------------------------------------------------------
-- Что намеренно осталось открытым.
--
-- branches — название филиала, город и реквизиты НАШЕГО юрлица. Они стоят
-- в каждом акте и договоре, который сотрудник и так держит в руках.
-- Закрывать их значило бы усложнить систему без выигрыша.
-- ---------------------------------------------------------------------

notify pgrst, 'reload schema';

commit;

-- =====================================================================
-- ПРОВЕРКА ПОСЛЕ ЗАПУСКА — выполнить обязательно.
--
-- 1. На каждой таблице должна остаться РОВНО ОДНА политика select.
--    Если их две, разрешающие складываются через ИЛИ, и ограничение не
--    работает. Лишнюю нужно удалить вручную.
-- =====================================================================
-- select tablename, policyname, cmd, qual
--   from pg_policies
--  where schemaname = 'public'
--    and cmd in ('SELECT', 'ALL')
--    and tablename in ('clients','objects','orders','job_helpers','job_debts',
--                      'job_equipment','job_chem_details','repeat_causes',
--                      'job_discounts','control_points','control_checks',
--                      'chemical_purchases','chemical_sales','paperwork',
--                      'paperwork_jobs','price_list','safety_acknowledgements')
--  order by tablename, policyname;

-- 2. Не осталось ли где-то ещё открытого чтения по всей базе:
-- select tablename, policyname
--   from pg_policies
--  where schemaname = 'public' and cmd in ('SELECT','ALL')
--    and coalesce(qual, 'true') = 'true'
--  order by tablename;

-- 3. Живая проверка глазами исполнителя: зайти в приложение техником и
--    открыть свою заявку, отчёт, точки контроля на объекте. Должно
--    работать всё, кроме чужих заявок и денежных разделов.
