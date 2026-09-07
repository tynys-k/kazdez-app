-- =====================================================================
-- Атомарное завершение заявки.
--
-- Раньше браузер сначала вызывал submit_report, а затем отдельными запросами
-- сохранял оплату, обход точек, концентрацию, оборудование, долг и скидку.
-- Ошибка в середине оставляла частично завершённую заявку.
--
-- Эта функция оборачивает действующие submit_report/save_report_extras и все
-- дополнительные записи в одну транзакцию PostgreSQL. Любая ошибка откатывает
-- весь пакет. request_id делает безопасным повтор запроса после обрыва связи.
-- Запускать в Supabase -> SQL Editor целиком. Повторный запуск безопасен.
-- =====================================================================

create table if not exists public.report_submission_requests (
  request_id   uuid primary key,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  actor_id     uuid not null references auth.users(id),
  payload      jsonb not null,
  completed_at timestamptz not null default now()
);

create index if not exists report_submission_requests_job_idx
  on public.report_submission_requests (job_id, completed_at desc);

alter table public.report_submission_requests enable row level security;
revoke all on public.report_submission_requests from public, anon, authenticated;

create or replace function public.submit_report_atomic(
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job uuid := nullif(p_payload->>'job_id', '')::uuid;
  v_actor uuid := auth.uid();
  v_assigned_to uuid;
  v_quoted numeric;
  v_checked_on date;
  v_cash numeric := coalesce(nullif(p_payload#>>'{payment,cash}', '')::numeric, 0);
  v_qr numeric := coalesce(nullif(p_payload#>>'{payment,qr}', '')::numeric, 0);
  v_transfer numeric := coalesce(nullif(p_payload#>>'{payment,transfer}', '')::numeric, 0);
  v_fu_date text := nullif(p_payload#>>'{follow_up,date}', '');
  v_inserted boolean;
  v_existing public.report_submission_requests%rowtype;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Требуется вход в систему';
  end if;
  if p_request_id is null or v_job is null or p_payload is null then
    raise exception using errcode = '22023', message = 'Некорректный пакет отчёта';
  end if;
  if v_cash < 0 or v_qr < 0 or v_transfer < 0 then
    raise exception using errcode = '22023', message = 'Сумма оплаты не может быть отрицательной';
  end if;

  select j.assigned_to, coalesce(j.quoted_price, 0), coalesce(j.scheduled_date, current_date)
    into v_assigned_to, v_quoted, v_checked_on
    from public.jobs j
   where j.id = v_job
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Заявка не найдена';
  end if;
  if v_assigned_to is distinct from v_actor
     and not coalesce(public.is_admin(), false)
     and not coalesce(public.kd_has_permission('action.jobs_edit'), false) then
    raise exception using errcode = '42501', message = 'Нет права завершать эту заявку';
  end if;

  insert into public.report_submission_requests (request_id, job_id, actor_id, payload)
  values (p_request_id, v_job, v_actor, p_payload)
  on conflict (request_id) do nothing;
  v_inserted := found;

  if not v_inserted then
    select * into v_existing
      from public.report_submission_requests
     where request_id = p_request_id;
    if v_existing.job_id is distinct from v_job
       or v_existing.actor_id is distinct from v_actor
       or v_existing.payload is distinct from p_payload then
      raise exception using errcode = '22023', message = 'Ключ повтора уже использован для другого отчёта';
    end if;
    return jsonb_build_object('status', 'already_completed', 'job_id', v_job);
  end if;

  -- Действующая функция остаётся источником базовой логики отчёта и расхода.
  -- Динамический вызов позволяет установить миграцию поверх существующей базы,
  -- даже если старая функция была создана вне Git. Поддержаны date/text для
  -- исторического параметра даты повторного выезда.
  begin
    execute $call$
      select public.submit_report(
        p_job => $1::uuid, p_cash => $2::numeric, p_qr => $3::numeric,
        p_note => $4::text, p_chems => $5::jsonb,
        p_fu_wanted => $6::boolean, p_fu_date => $7::text, p_fu_note => $8::text,
        p_docs_needed => $9::boolean, p_docs_avr => $10::boolean,
        p_docs_dogovor => $11::boolean, p_docs_note => $12::text)
    $call$
    using v_job, v_cash, v_qr, coalesce(p_payload->>'note', ''),
      coalesce(p_payload->'chemicals', '[]'::jsonb),
      coalesce((p_payload#>>'{follow_up,wanted}')::boolean, false), v_fu_date,
      coalesce(p_payload#>>'{follow_up,note}', ''),
      coalesce((p_payload#>>'{documents,needed}')::boolean, false),
      coalesce((p_payload#>>'{documents,avr}')::boolean, false),
      coalesce((p_payload#>>'{documents,dogovor}')::boolean, false),
      coalesce(p_payload#>>'{documents,note}', '');
  exception when undefined_function then
    execute $call$
      select public.submit_report(
        p_job => $1::uuid, p_cash => $2::numeric, p_qr => $3::numeric,
        p_note => $4::text, p_chems => $5::jsonb,
        p_fu_wanted => $6::boolean, p_fu_date => $7::date, p_fu_note => $8::text,
        p_docs_needed => $9::boolean, p_docs_avr => $10::boolean,
        p_docs_dogovor => $11::boolean, p_docs_note => $12::text)
    $call$
    using v_job, v_cash, v_qr, coalesce(p_payload->>'note', ''),
      coalesce(p_payload->'chemicals', '[]'::jsonb),
      coalesce((p_payload#>>'{follow_up,wanted}')::boolean, false), v_fu_date,
      coalesce(p_payload#>>'{follow_up,note}', ''),
      coalesce((p_payload#>>'{documents,needed}')::boolean, false),
      coalesce((p_payload#>>'{documents,avr}')::boolean, false),
      coalesce((p_payload#>>'{documents,dogovor}')::boolean, false),
      coalesce(p_payload#>>'{documents,note}', '');
  end;

  execute $call$
    select public.save_report_extras(
      p_job => $1::uuid, p_cash => $2::numeric, p_qr => $3::numeric,
      p_transfer => $4::numeric, p_method => $5::text)
  $call$
  using v_job, v_cash, v_qr, v_transfer, coalesce(p_payload#>>'{payment,method}', '');

  insert into public.control_checks
    (point_id, job_id, checked_on, result, count, note, created_by)
  select row.point_id, v_job,
         v_checked_on,
         row.result, row.count, row.note, v_actor
    from jsonb_to_recordset(coalesce(p_payload->'checks', '[]'::jsonb))
      as row(point_id uuid, result text, count integer, note text)
  on conflict (point_id, job_id) do update set
    checked_on = excluded.checked_on, result = excluded.result,
    count = excluded.count, note = excluded.note, created_by = excluded.created_by;

  insert into public.job_chem_details
    (job_id, chemical_id, concentration, method, created_by)
  select v_job, row.chemical_id, row.concentration, row.method, v_actor
    from jsonb_to_recordset(coalesce(p_payload->'chemical_details', '[]'::jsonb))
      as row(chemical_id uuid, concentration numeric, method text)
  on conflict (job_id, chemical_id) do update set
    concentration = excluded.concentration, method = excluded.method,
    created_by = excluded.created_by;

  if jsonb_array_length(coalesce(p_payload->'equipment', '[]'::jsonb)) > 0 then
    insert into public.job_equipment (job_id, codes, created_by, updated_at)
    select v_job, array_agg(value), v_actor, now()
      from jsonb_array_elements_text(p_payload->'equipment') as value
    on conflict (job_id) do update set
      codes = excluded.codes, created_by = excluded.created_by, updated_at = excluded.updated_at;
  end if;

  if coalesce(nullif(p_payload#>>'{debt,amount}', '')::numeric, 0) > 0 then
    insert into public.job_debts (job_id, amount, due_on, note, created_by)
    values (
      v_job, (p_payload#>>'{debt,amount}')::numeric,
      nullif(p_payload#>>'{debt,due_on}', '')::date,
      nullif(p_payload#>>'{debt,note}', ''), v_actor)
    on conflict (job_id) do update set
      amount = excluded.amount, due_on = excluded.due_on,
      note = excluded.note, created_by = excluded.created_by;
  end if;

  if nullif(p_payload#>>'{discount,reason}', '') is not null then
    insert into public.job_discounts (job_id, quoted, charged, reason, note, created_by)
    values (
      v_job, coalesce(nullif(p_payload#>>'{discount,quoted}', '')::numeric, v_quoted),
      coalesce(nullif(p_payload#>>'{discount,charged}', '')::numeric, v_cash + v_qr + v_transfer),
      p_payload#>>'{discount,reason}', nullif(p_payload#>>'{discount,note}', ''), v_actor)
    on conflict (job_id) do update set
      quoted = excluded.quoted, charged = excluded.charged, reason = excluded.reason,
      note = excluded.note, created_by = excluded.created_by;
  end if;

  return jsonb_build_object('status', 'completed', 'job_id', v_job);
end;
$$;

revoke all on function public.submit_report_atomic(uuid, jsonb) from public, anon;
grant execute on function public.submit_report_atomic(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

-- Проверка после запуска:
-- select routine_name from information_schema.routines
--  where routine_schema = 'public' and routine_name = 'submit_report_atomic';
