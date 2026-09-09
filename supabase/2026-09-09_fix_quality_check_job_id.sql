-- Совместимость контроля качества со старой схемой, где quality_checks.job_id
-- хранится как text, и с новой схемой, где это uuid.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_has_role(text[])') is null
     or to_regclass('public.jobs') is null
     or to_regclass('public.quality_checks') is null then
    raise exception 'Не найдены функция доступа, jobs или quality_checks — контроль качества не изменён';
  end if;
end
$dependencies$;

do $install$
declare
  v_job_type regtype;
  v_compare_expr text;
  v_insert_expr text;
begin
  select a.atttypid::regtype
    into v_job_type
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.quality_checks'::regclass
     and a.attname = 'job_id'
     and a.attnum > 0
     and not a.attisdropped;

  if v_job_type = 'uuid'::regtype then
    v_compare_expr := 'job_id = p_job_id';
    v_insert_expr := 'p_job_id';
  elsif v_job_type in ('text'::regtype, 'character varying'::regtype) then
    v_compare_expr := 'job_id::text = p_job_id::text';
    v_insert_expr := 'p_job_id::text';
  else
    raise exception 'Неподдерживаемый тип quality_checks.job_id: %', coalesce(v_job_type::text, 'колонка отсутствует');
  end if;

  execute format($definition$
create or replace function public.save_quality_check_atomic(
  p_job_id uuid,
  p_quality jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.jobs%%rowtype;
  v_quality_id uuid;
  v_result text;
  v_rating integer;
  v_note text;
  v_review_requested boolean;
  v_review_url text;
begin
  if not coalesce(public.kd_has_role(array['admin', 'manager']), false) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для контроля качества';
  end if;
  if p_job_id is null then
    raise exception using errcode = '22004', message = 'Заявка обязательна';
  end if;
  if p_quality is null or jsonb_typeof(p_quality) <> 'object' then
    raise exception using errcode = '22023', message = 'Некорректные данные контроля качества';
  end if;

  select * into v_job
    from public.jobs
   where id = p_job_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Заявка не найдена';
  end if;

  v_result := nullif(btrim(p_quality ->> 'result'), '');
  if v_result is null or v_result not in ('positive', 'repeat', 'complaint', 'no_answer') then
    raise exception using errcode = '22023', message = 'Выберите корректный результат звонка';
  end if;

  begin
    v_rating := nullif(p_quality ->> 'rating', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Оценка должна быть числом от 1 до 5';
  end;
  if v_rating is not null and (v_rating < 1 or v_rating > 5) then
    raise exception using errcode = '22023', message = 'Оценка должна быть от 1 до 5';
  end if;

  v_note := nullif(btrim(p_quality ->> 'note'), '');
  if length(coalesce(v_note, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Комментарий слишком длинный';
  end if;
  v_review_requested := v_result = 'positive'
    and coalesce((p_quality ->> 'review_requested')::boolean, false);
  v_review_url := case when v_review_requested
    then nullif(btrim(p_quality ->> 'review_url'), '') else null end;
  if length(coalesce(v_review_url, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Ссылка на отзыв слишком длинная';
  end if;

  update public.quality_checks
     set result = v_result,
         rating = v_rating,
         note = v_note,
         review_requested = v_review_requested,
         review_url = v_review_url,
         contacted_at = now(),
         status = case when v_result = 'complaint' then 'problem' else 'done' end,
         checked_by = auth.uid(),
         updated_at = now()
   where %s
   returning id into v_quality_id;

  if v_quality_id is null then
    insert into public.quality_checks (
      job_id, result, rating, note, review_requested, review_url,
      contacted_at, status, checked_by, updated_at
    ) values (
      %s, v_result, v_rating, v_note, v_review_requested, v_review_url,
      now(), case when v_result = 'complaint' then 'problem' else 'done' end,
      auth.uid(), now()
    ) returning id into v_quality_id;
  end if;

  if v_result = 'repeat' and coalesce(v_job.repeat_state, '') = '' then
    update public.jobs
       set repeat_state = 'on_repeat',
           repeat_since = now()
     where id = p_job_id;
  end if;

  return v_quality_id;
end
$function$;
$definition$, v_compare_expr, v_insert_expr);
end
$install$;

revoke all on function public.save_quality_check_atomic(uuid, jsonb) from public, anon;
grant execute on function public.save_quality_check_atomic(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Быстрая проверка после применения:
-- select routine_name from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'save_quality_check_atomic';
