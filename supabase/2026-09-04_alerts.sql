-- =====================================================================
-- Движок управленческих тревог.
--
-- Девятнадцать правил считались при отрисовке экрана в браузере. Проблему
-- видел только тот, кто открыл нужный раздел; ночью, в выходные и в отпуске
-- не видел никто. Управление по исключениям в таком виде невозможно.
--
-- Теперь правила живут в базе и считаются по расписанию. Тревога появляется
-- сама, у неё есть время возникновения, и она закрывается сама, когда причина
-- ушла: загрузили фото — тревога о заявке без доказательств исчезла.
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.alerts (
  id          bigserial primary key,
  rule        text not null,
  entity      text,
  entity_id   uuid,
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
  create temporary table kd_current on commit drop as

  -- Лида никто не тронул больше получаса
  select 'lead_no_reply' as rule, 'leads' as entity, l.id as entity_id, 'critical' as severity,
         'Лид без ответа' as title,
         coalesce(l.name, l.phone, 'без имени') || ' · ' ||
           (extract(epoch from (now() - l.created_at))::int / 60)::text || ' мин' as detail,
         'Менеджер' as target
    from public.leads l
   where l.converted_job_id is null
     and coalesce(l.status, '') not in ('lost', 'closed', 'done')
     and l.created_at < now() - interval '30 minutes'
     and coalesce(l.updated_at, l.created_at) <= l.created_at + interval '1 minute'

  union all
  -- Завтра выезд, а исполнителя нет
  select 'job_unassigned', 'jobs', j.id, 'critical',
         'Завтра выезд без исполнителя',
         coalesce(j.pest, 'заявка') || ' · ' || coalesce(j.address, 'адрес не указан'),
         'Координатор'
    from public.jobs j
   where j.scheduled_date = current_date + 1
     and j.assigned_to is null
     and coalesce(j.status, '') not in ('canceled', 'done')

  union all
  -- Заявку закрыли, доказательств нет
  select 'job_no_proof', 'jobs', j.id, 'warning',
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
  select 'discount_no_reason', 'jobs', j.id, 'critical',
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
  select 'doc_expired', 'tech_documents', td.id, 'critical',
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
  select 'doc_soon', 'tech_documents', td.id, 'warning',
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
  select 'training_due', 'training_records', t.id, 'warning',
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
  select 'low_rating_no_call', 'jobs', f.job_id, 'critical',
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
  select 'contract_due', 'service_contracts', c.id, 'warning',
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
  select 'batch_expired', 'chemical_purchases', cp.id, 'warning',
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
-- Расписание. Если pg_cron недоступен, включите его в
-- Dashboard -> Database -> Extensions и выполните этот блок ещё раз.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

do $sched$
begin
  perform cron.unschedule('kd-alerts');
exception when others then
  null;
end
$sched$;

select cron.schedule('kd-alerts', '*/15 * * * *', $cron$select public.kd_scan_alerts()$cron$);

-- Первый прогон сразу, чтобы не ждать четверть часа:
select public.kd_scan_alerts() as заведено_тревог;

-- Проверка:
-- select severity, rule, title, detail, created_at
--   from public.alerts where resolved_at is null
--  order by severity, created_at desc;
