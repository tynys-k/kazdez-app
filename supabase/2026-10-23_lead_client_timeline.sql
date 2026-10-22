-- Лента карточки лида: прошлые заявки и звонки обзвона по телефонам лида.
-- Хантер не видит заявки и журнал обзвона напрямую, поэтому строки собирает
-- база — и только по его собственным сделкам. Сопоставление то же, что в
-- lead_client_history: основной телефон и телефон ЛПР, плюс карточки клиентов.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_phone_key(text)') is null
     or to_regprocedure('public.kd_is_hunter()') is null
     or to_regclass('public.client_calls') is null then
    raise exception 'Сначала примените 2026-10-22_hunter_role.sql и 2026-10-17_client_calls.sql: лента не была добавлена';
  end if;
end
$dependencies$;

create or replace function public.lead_client_timeline(p_lead_id uuid)
returns table (
  kind text,
  ref_id uuid,
  happened_at timestamptz,
  status text,
  title text,
  details text,
  amount numeric,
  rating integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_lead public.leads%rowtype;
  v_keys text[];
  v_clients uuid[];
begin
  if not (coalesce(public.kd_account_active(), false)
          and (coalesce(public.is_admin(), false) or coalesce(public.kd_has_permission('tab.leads'), false))) then
    raise exception using errcode = '42501', message = 'Нет доступа к лидам';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Лид не найден';
  end if;
  if public.kd_is_hunter() and v_lead.owner_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Это сделка другого сотрудника';
  end if;

  select array_agg(distinct k) into v_keys
    from unnest(array[
      public.kd_phone_key(coalesce(v_lead.phone, '')),
      public.kd_phone_key(coalesce(v_lead.lpr_phone, ''))
    ]) k
   where length(k) = 10;
  if v_keys is null then
    return;
  end if;

  select array_agg(c.id) into v_clients from public.clients c where c.phone_key = any(v_keys);

  return query
    with matched_jobs as (
      select j.*
        from public.jobs j
       where public.kd_phone_key(coalesce(j.client_phone, '')) = any(v_keys)
          or (v_clients is not null and j.client_id = any(v_clients))
    )
    select 'job'::text,
           j.id,
           coalesce(j.scheduled_date::timestamptz, j.reported_at, j.created_at),
           coalesce(j.status, 'new'),
           coalesce(nullif(btrim(j.pest), ''), nullif(btrim(j.type), ''), 'Заявка'),
           nullif(btrim(coalesce(j.address, '')), ''),
           case when j.status = 'done' then j.report_paid end,
           null::integer
      from matched_jobs j
    union all
    select 'call'::text,
           c.id,
           c.created_at,
           c.outcome,
           c.stage,
           nullif(btrim(coalesce(c.note, '')), ''),
           null::numeric,
           c.rating
      from public.client_calls c
     where c.deleted_at is null
       and (public.kd_phone_key(coalesce(c.client_phone, '')) = any(v_keys)
            or (v_clients is not null and c.client_id = any(v_clients))
            or c.job_id in (select mj.id from matched_jobs mj))
     order by 3 desc nulls last;
end
$function$;

revoke all on function public.lead_client_timeline(uuid) from public, anon;
grant execute on function public.lead_client_timeline(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
