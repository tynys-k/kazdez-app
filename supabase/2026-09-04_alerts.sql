-- =====================================================================
-- Движок управленческих тревог.
--
-- Девятнадцать правил считались при отрисовке экрана в браузере. Проблему
-- видел только тот, кто открыл нужный раздел; ночью, в выходные и в отпуске
-- не видел никто. Управление по исключениям в таком виде невозможно.
--
-- Теперь правила живут в базе. Тревога заводится записью, у неё есть время
-- возникновения и адресат, её можно закрыть с именем — и она закрывается
-- сама, когда причина ушла: загрузили фото, и тревога о заявке без
-- доказательств исчезла.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.alerts (
  id          bigserial primary key,
  rule        text not null,
  entity      text,
  -- Текст, а не uuid: тревога ссылается на разные таблицы, и типы
  -- идентификаторов у них разные. Приложение это поле только сравнивает,
  -- соединений по нему нет.
  entity_id   text,
  severity    text not null default 'warning',
  title       text not null,
  detail      text,
  target      text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

-- Одна открытая тревога на правило и объект. Закрытые не мешают правилу
-- сработать снова: проблема может вернуться, и это отдельное событие.
create unique index if not exists alerts_open_uniq
  on public.alerts (rule, entity_id) where resolved_at is null;
create index if not exists alerts_open_idx
  on public.alerts (created_at desc) where resolved_at is null;

-- Если таблица создавалась ранней версией файла, поле было uuid.
alter table public.alerts alter column entity_id type text using entity_id::text;

alter table public.alerts enable row level security;

drop policy if exists "alerts select" on public.alerts;
create policy "alerts select" on public.alerts
  for select to authenticated using (true);

-- Закрыть тревогу может тот, кто способен с ней что-то сделать. Иначе
-- «разобрался» превращается в способ убрать проблему с глаз.
drop policy if exists "alerts resolve" on public.alerts;
create policy "alerts resolve" on public.alerts
  for update to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

-- ---------------------------------------------------------------------
-- Сканер: собирает текущие поводы одним запросом, заводит недостающие
-- тревоги и закрывает те, чья причина ушла.
-- ---------------------------------------------------------------------
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
  select 'lead_no_reply' as rule, 'leads' as entity, l.id::text as entity_id, 'critical' as severity,
         'Лид без ответа' as title,
         coalesce(l.name, l.phone, 'без имени') || ' · ' ||
           (extract(epoch from (now() - l.created_at))::int / 60)::text || ' мин' as detail,
         'Менеджер' as target
    from public.leads l
   where l.converted_job_id is null
     and l.created_at < now() - interval '30 minutes'
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
  -- Допуск просрочен у работающего сотрудника
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
  -- Плановое обслуживание по договору просрочено
  select 'contract_due', 'service_contracts', c.id::text, 'warning',
         'Плановое обслуживание не создано',
         coalesce(c.client_name, 'абонент') || ' · на ' ||
           to_char(c.next_service_date, 'DD.MM.YYYY'),
         'Координатор'
    from public.service_contracts c
   where c.next_service_date is not null
     and c.next_service_date <= current_date
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

  return opened;
end
$fn$;

-- ---------------------------------------------------------------------
-- Кто запускает сканер.
--
-- Расписание намеренно не включено. Уведомления наружу не отправляются,
-- значит единственный читатель тревог — само приложение, и заход человека
-- в него полностью заменяет фоновый запуск. Разница только в дате
-- обнаружения: «просрочено со вторника» против «замечено сегодня». Для
-- допусков, партий и скидок это ничего не меняет.
--
-- Поэтому сканер вызывается из приложения при открытии, а фоновая работа
-- базы не тратится впустую.
-- ---------------------------------------------------------------------
grant execute on function public.kd_scan_alerts() to authenticated;

-- Первый прогон прямо сейчас:
select public.kd_scan_alerts() as заведено_тревог;

-- Проверка:
-- select severity, rule, title, detail, created_at
--   from public.alerts where resolved_at is null
--  order by severity, created_at desc;

-- ---------------------------------------------------------------------
-- Если когда-нибудь понадобится, чтобы тревоги заводились и без входа в
-- приложение (например, появятся уведомления в мессенджер), включите
-- расписание — раскомментируйте блок ниже. Расширение pg_cron включается
-- в Dashboard -> Database -> Extensions.
-- ---------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- select cron.schedule('kd-alerts', '0 * * * *', $cron$select public.kd_scan_alerts()$cron$);
