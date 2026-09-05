-- =====================================================================
-- Тревоги, которым верят.
--
-- Две беды у нынешнего списка.
--
-- Первая: при первом запуске он забивается историческим хвостом. Лид, до
-- которого не дошли руки в марте, попадает в «критично» наравне с
-- сегодняшним. Человек открывает экран, видит тридцать семь строк и
-- закрывает его — и больше не открывает. Тревога, которую не читают, хуже
-- её отсутствия: она создаёт ощущение, что за этим кто-то следит.
--
-- Вторая: у тревоги нет срока. Она может висеть месяц, и ничего не
-- произойдёт.
--
-- Здесь чиним обе. Правила про поток — лиды и плановые выезды — ограничены
-- свежим окном. Правила про состояние — просроченный допуск, непроверенное
-- обучение, просроченная партия на складе — окна не получают: они не
-- становятся историей от того, что о них долго не вспоминали.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- Требует, чтобы 2026-09-04_alerts.sql был выполнен раньше.
-- =====================================================================

-- Отметка о том, что тревогу уже поднимали: без неё эскалация срабатывала бы
-- при каждом скане и переписывала адресата снова и снова.
alter table public.alerts add column if not exists escalated_at timestamptz;

create or replace function public.kd_scan_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  opened integer := 0;
begin
  -- Сканер вызывается из приложения, поэтому он должен проверять, кто зовёт.
  -- Пустой auth.uid() — это вызов из планировщика или из SQL Editor.
  if auth.uid() is not null
     and not (public.is_admin() or public.kd_has_permission('action.jobs_edit')) then
    return 0;
  end if;

  -- На случай двух вызовов в одной сессии: временная таблица исчезает при
  -- фиксации, но в SQL Editor можно позвать функцию дважды подряд.
  drop table if exists kd_current;

  create temporary table kd_current on commit drop as

  -- Лида никто не тронул больше получаса.
  --
  -- «Не тронул» определяем по updated_at: он двигается и при касании, и при
  -- смене этапа воронки. Отдельного поля со статусом у лида нет, и выдумывать
  -- его не нужно — как только с лидом что-то сделали, тревога снимается сама.
  --
  -- ОКНО: только лиды за последние трое суток. Лид, до которого не дошли руки
  -- в марте, — это не тревога, а история: реагировать поздно, а место в списке
  -- он занимает наравне с сегодняшним.
  select 'lead_no_reply' as rule, 'leads' as entity, l.id::text as entity_id, 'critical' as severity,
         'Лид без ответа' as title,
         coalesce(l.name, l.phone, 'без имени') || ' · ' ||
           (extract(epoch from (now() - l.created_at))::int / 60)::text || ' мин' as detail,
         'Менеджер' as target
    from public.leads l
   where l.converted_job_id is null
     and l.created_at < now() - interval '30 minutes'
     and l.created_at >= now() - interval '3 days'
     and coalesce(l.updated_at, l.created_at) <= l.created_at + interval '1 minute'

  union all
  -- Завтра выезд, а исполнителя нет
  select 'job_unassigned', 'jobs', j.id::text, 'critical',
         'Завтра выезд без исполнителя',
         coalesce(j.pest, 'заявка') || ' · ' || coalesce(j.address, 'адрес не указан'),
         'Координатор'
    from public.jobs j
   where j.scheduled_date = current_date + 1
     and j.assigned_to is null
     and coalesce(j.status, '') not in ('canceled', 'done')

  union all
  -- Заявку закрыли, доказательств нет
  select 'job_no_proof', 'jobs', j.id::text, 'warning',
         'Заявка закрыта без фото',
         coalesce(j.pest, 'заявка') || ' · ' || coalesce(j.address, ''),
         'Контроль качества'
    from public.jobs j
    left join public.job_proofs p on p.job_id = j.id
   where j.status = 'done'
     and j.scheduled_date >= current_date - 3
     and (p.id is null or coalesce(array_length(p.after_paths, 1), 0) = 0)

  union all
  -- Скидка ниже прайса, причина не названа
  select 'discount_no_reason', 'jobs', j.id::text, 'critical',
         'Скидка без объяснения',
         'прайс ' || round(j.quoted_price)::text || ' тг, получено ' ||
           round(coalesce(j.report_paid, 0))::text || ' тг',
         'Руководитель продаж'
    from public.jobs j
    left join public.job_discounts d on d.job_id = j.id
   where j.status = 'done'
     and j.quoted_price > 0
     and coalesce(j.report_paid, 0) < j.quoted_price * 0.8
     and j.scheduled_date >= current_date - 14
     and d.id is null

  union all
  -- Допуск просрочен у работающего сотрудника.
  --
  -- ОКНА НЕТ намеренно: допуск, просроченный полгода назад, — не история, а
  -- человек, который сегодня работает без документа. Срок давности тут не
  -- наступает. То же у обучения и просроченных партий ниже.
  select 'doc_expired', 'tech_documents', td.id::text, 'critical',
         'Просрочен допуск',
         coalesce(p.full_name, 'сотрудник') || ' · ' || td.kind ||
           ' · до ' || to_char(td.expires_on, 'DD.MM.YYYY'),
         'Кадры'
    from public.tech_documents td
    join public.profiles p on p.id = td.tech_id
   where td.expires_on is not null
     and td.expires_on < current_date
     and coalesce(p.is_active, true)

  union all
  -- Допуск истекает в ближайший месяц
  select 'doc_soon', 'tech_documents', td.id::text, 'warning',
         'Допуск скоро истекает',
         coalesce(p.full_name, 'сотрудник') || ' · ' || td.kind ||
           ' · до ' || to_char(td.expires_on, 'DD.MM.YYYY'),
         'Кадры'
    from public.tech_documents td
    join public.profiles p on p.id = td.tech_id
   where td.expires_on between current_date and current_date + 30
     and coalesce(p.is_active, true)

  union all
  -- Обучение пора перепроверить
  select 'training_due', 'training_records', t.id::text, 'warning',
         'Пора перепроверить обучение',
         coalesce(p.full_name, 'сотрудник') || ' · ' || t.topic,
         'Руководитель продаж'
    from public.training_records t
    join public.profiles p on p.id = t.person_id
   where t.next_check_on is not null
     and t.next_check_on < current_date
     and coalesce(p.is_active, true)

  union all
  -- Низкая оценка, а звонка так и нет
  select 'low_rating_no_call', 'jobs', f.job_id::text, 'critical',
         'Низкая оценка без звонка',
         'оценка ' || f.rating::text || '/5' || coalesce(' · ' || f.comment, ''),
         'Контроль качества'
    from public.client_public_feedback f
    left join public.client_followups cf
      on cf.job_id = f.job_id and coalesce(cf.status, '') <> 'done'
   where coalesce(f.rating, 5) <= 3
     and f.created_at >= now() - interval '14 days'
     and cf.id is null

  union all
  -- Плановое обслуживание по договору просрочено.
  --
  -- ОКНО: срок в пределах последних трёх месяцев. Договор, по которому не
  -- выезжали полгода, — это не забытая заявка, а вопрос, жив ли договор
  -- вообще. Его решают разговором с клиентом, а не кнопкой в списке.
  select 'contract_due', 'service_contracts', c.id::text, 'warning',
         'Плановое обслуживание не создано',
         coalesce(c.client_name, 'абонент') || ' · на ' ||
           to_char(c.next_service_date, 'DD.MM.YYYY'),
         'Координатор'
    from public.service_contracts c
   where c.next_service_date is not null
     and c.next_service_date <= current_date
     and c.next_service_date >= current_date - 90
     and not exists (
       select 1 from public.jobs j
        where j.service_contract_id = c.id
          and j.scheduled_date >= c.next_service_date
          and coalesce(j.status, '') <> 'canceled')

  union all
  -- Просроченная партия, а препарат ещё числится на складе
  select 'batch_expired', 'chemical_purchases', cp.id::text, 'warning',
         'Просроченная партия на складе',
         ch.name || coalesce(' · партия ' || cp.batch_no, '') ||
           ' · до ' || to_char(cp.expires_on, 'DD.MM.YYYY'),
         'Склад'
    from public.chemical_purchases cp
    join public.chemicals ch on ch.id = cp.chemical_id
   where cp.expires_on is not null
     and cp.expires_on < current_date
     and coalesce(ch.purchased_ml, 0) > 0;

  -- Заводим то, чего ещё нет
  insert into public.alerts (rule, entity, entity_id, severity, title, detail, target)
  select c.rule, c.entity, c.entity_id, c.severity, c.title, c.detail, c.target
    from kd_current c
   where not exists (
     select 1 from public.alerts a
      where a.rule = c.rule and a.entity_id = c.entity_id and a.resolved_at is null);
  get diagnostics opened = row_count;

  -- Закрываем то, чья причина ушла: загрузили фото — тревога исчезла сама
  update public.alerts a
     set resolved_at = now()
   where a.resolved_at is null
     and not exists (
       select 1 from kd_current c
        where c.rule = a.rule and c.entity_id = a.entity_id);

  -- ------------------------------------------------------------------
  -- Эскалация.
  --
  -- У тревоги не было срока: она могла висеть месяц, и ничего не
  -- происходило. «Разобрался» никто не нажимал, потому что никто не спросит.
  --
  -- Теперь тревога, не закрытая за три дня, поднимается уровнем выше и
  -- меняет адресата на владельца. Если проблема три дня никого не
  -- заинтересовала, значит адресат либо не может её решить, либо не
  -- собирается — и то и другое разговор для владельца.
  --
  -- Поднимаем один раз: escalated_at не даёт правилу сработать снова.
  -- ------------------------------------------------------------------
  update public.alerts a
     set severity     = 'critical',
         escalated_at = now(),
         target       = 'Владелец · висит с ' || to_char(a.created_at, 'DD.MM')
   where a.resolved_at is null
     and a.escalated_at is null
     and a.created_at < now() - interval '3 days';

  return opened;
end
$fn$;

grant execute on function public.kd_scan_alerts() to authenticated;

-- ---------------------------------------------------------------------
-- Уборка исторического хвоста прямо сейчас.
--
-- Тревоги, заведённые прежними правилами, закроются сами: сканер закрывает
-- всё, чей повод больше не выполняется. Строка ниже делает это сразу, чтобы
-- список не пугал при первом заходе.
-- ---------------------------------------------------------------------
select public.kd_scan_alerts() as заведено_тревог;

-- Проверка:
-- select severity, count(*) from public.alerts where resolved_at is null group by 1;
-- select title, target, created_at from public.alerts
--  where resolved_at is null and escalated_at is not null order by created_at;
