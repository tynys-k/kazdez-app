-- Журнал обращений к клиенту после выезда.
--
-- Каждый звонок — отдельная строка: «не дозвонился» в понедельник и
-- «согласен на вторичную» в среду должны остаться в истории оба. Ошибочную
-- запись не стирают, а помечают удалённой — так видно, кто и когда ошибся,
-- а очередь обзвона и история клиента её больше не учитывают.
--
-- Результат «посадил на вторичную» в той же транзакции отправляет заявку в
-- «Повторные выезды». Удаление такой записи возвращает заявку обратно, если
-- повторная заявка ещё не создана.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_has_role(text[])') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regclass('public.jobs') is null then
    raise exception 'Не найдены функции доступа или jobs — журнал обращений не создан';
  end if;
end
$dependencies$;

alter table public.jobs add column if not exists repeat_note text;

create table if not exists public.client_calls (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  client_id uuid,
  client_phone text,
  stage text not null default 'other'
    check (stage in ('after_primary', 'after_secondary', 'other')),
  outcome text not null
    check (outcome in ('no_answer', 'callback', 'agreed', 'all_good', 'declined', 'complaint', 'unreachable', 'note')),
  rating integer check (rating between 1 and 5),
  note text check (length(note) <= 4000),
  callback_on date,
  applied_repeat boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create index if not exists client_calls_job_idx on public.client_calls(job_id, created_at desc);
create index if not exists client_calls_phone_idx on public.client_calls(client_phone);
create index if not exists client_calls_client_idx on public.client_calls(client_id);

alter table public.client_calls enable row level security;
drop policy if exists client_calls_read on public.client_calls;
create policy client_calls_read on public.client_calls for select to authenticated
  using (public.kd_account_active() and (
    public.kd_has_role(array['admin', 'manager'])
    or public.kd_has_permission('tab.retention')
    or public.kd_has_permission('tab.clients')
  ));
-- Писать только через функции ниже: побочные эффекты на заявке и мягкое
-- удаление не должны расходиться с самой записью.
revoke insert, update, delete on table public.client_calls from authenticated, anon;
grant select on table public.client_calls to authenticated;

create or replace function public.kd_can_call_clients()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.kd_account_active(), false) and (
    coalesce(public.kd_has_role(array['admin', 'manager']), false)
    or coalesce(public.kd_has_permission('tab.retention'), false)
  )
$$;

create or replace function public.log_client_call_atomic(
  p_job_id uuid,
  p_call jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.jobs%rowtype;
  v_outcome text;
  v_stage text;
  v_rating integer;
  v_note text;
  v_callback date;
  v_applied boolean := false;
  v_id uuid;
begin
  if not public.kd_can_call_clients() then
    raise exception using errcode = '42501', message = 'Недостаточно прав для обзвона клиентов';
  end if;
  if p_job_id is null then
    raise exception using errcode = '22004', message = 'Заявка обязательна';
  end if;
  if p_call is null or jsonb_typeof(p_call) <> 'object' then
    raise exception using errcode = '22023', message = 'Некорректные данные звонка';
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Заявка не найдена';
  end if;

  v_outcome := nullif(btrim(p_call ->> 'outcome'), '');
  if v_outcome is null or v_outcome not in ('no_answer', 'callback', 'agreed', 'all_good', 'declined', 'complaint', 'unreachable', 'note') then
    raise exception using errcode = '22023', message = 'Выберите результат звонка';
  end if;

  v_note := nullif(btrim(p_call ->> 'note'), '');
  if length(coalesce(v_note, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Комментарий слишком длинный';
  end if;
  if v_outcome in ('note', 'declined', 'complaint') and v_note is null then
    raise exception using errcode = '22023', message = 'Напишите комментарий — что ответил клиент';
  end if;

  begin
    v_rating := nullif(p_call ->> 'rating', '')::integer;
    v_callback := nullif(p_call ->> 'callback_on', '')::date;
  exception when others then
    raise exception using errcode = '22023', message = 'Некорректная оценка или дата';
  end;
  if v_rating is not null and (v_rating < 1 or v_rating > 5) then
    raise exception using errcode = '22023', message = 'Оценка должна быть от 1 до 5';
  end if;
  -- Без ответа клиент ничего не оценивал.
  if v_outcome in ('no_answer', 'unreachable', 'note') then v_rating := null; end if;
  if v_outcome = 'callback' and v_callback is null then
    raise exception using errcode = '22023', message = 'Укажите, когда перезвонить';
  end if;
  if v_outcome <> 'callback' then v_callback := null; end if;

  v_stage := case
    when v_job.type = 'Первичная' then 'after_primary'
    when v_job.type in ('Вторичная', 'Гарантийная') then 'after_secondary'
    else 'other' end;

  if v_outcome = 'agreed' then
    if v_job.status <> 'done' then
      raise exception using errcode = '22023', message = 'На повтор можно отправить только выполненную заявку';
    end if;
    if coalesce(v_job.repeat_state, '') = '' then
      update public.jobs
         set repeat_state = 'on_repeat',
             repeat_since = now(),
             repeat_note = coalesce(v_note, repeat_note)
       where id = p_job_id;
      v_applied := true;
    end if;
  end if;

  insert into public.client_calls (
    job_id, client_id, client_phone, stage, outcome, rating, note,
    callback_on, applied_repeat, created_by
  ) values (
    p_job_id, v_job.client_id, v_job.client_phone, v_stage, v_outcome, v_rating, v_note,
    v_callback, v_applied, auth.uid()
  ) returning id into v_id;

  return v_id;
end
$function$;

create or replace function public.delete_client_call_atomic(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_call public.client_calls%rowtype;
begin
  if not public.kd_can_call_clients() then
    raise exception using errcode = '42501', message = 'Недостаточно прав для обзвона клиентов';
  end if;

  select * into v_call from public.client_calls where id = p_call_id for update;
  if not found or v_call.deleted_at is not null then
    raise exception using errcode = 'P0002', message = 'Запись не найдена или уже удалена';
  end if;
  if v_call.created_by is distinct from auth.uid() and not coalesce(public.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Удалить можно только свою запись';
  end if;

  update public.client_calls
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_call_id;

  -- Ошибочное «посадил на вторичную» возвращает заявку из «Повторных
  -- выездов», пока по ней не создали повторную заявку.
  if v_call.applied_repeat and v_call.job_id is not null then
    update public.jobs
       set repeat_state = null, repeat_since = null
     where id = v_call.job_id
       and repeat_state = 'on_repeat';
  end if;
end
$function$;

revoke all on function public.kd_can_call_clients() from public, anon;
revoke all on function public.log_client_call_atomic(uuid, jsonb) from public, anon;
revoke all on function public.delete_client_call_atomic(uuid) from public, anon;
grant execute on function public.kd_can_call_clients() to authenticated, service_role;
grant execute on function public.log_client_call_atomic(uuid, jsonb) to authenticated, service_role;
grant execute on function public.delete_client_call_atomic(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name in ('log_client_call_atomic', 'delete_client_call_atomic');
