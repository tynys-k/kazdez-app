-- История клиента в карточке лида. Лид не связан с прошлыми заявками, а
-- хантер не видит ни справочник клиентов, ни заявки — поэтому «мы уже
-- обслуживали этот номер как физлицо» оставалось незамеченным.
-- Функция сопоставляет телефоны лида (основной и ЛПР) с карточками клиентов
-- и заявками и отдаёт только сводку. Хантеру — лишь по своим сделкам.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_phone_key(text)') is null
     or to_regprocedure('public.kd_is_hunter()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Сначала примените 2026-10-22_hunter_role.sql: история клиента не была добавлена';
  end if;
end
$dependencies$;

create or replace function public.lead_client_history()
returns table (
  lead_id uuid,
  client_name text,
  client_type text,
  jobs_count integer,
  done_count integer,
  first_date date,
  last_date date,
  last_pest text,
  last_address text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with me as (
    select coalesce(public.kd_account_active(), false)
             and (coalesce(public.is_admin(), false) or coalesce(public.kd_has_permission('tab.leads'), false)) as allowed,
           coalesce(public.kd_is_hunter(), false) as hunter
  ),
  lead_keys as (
    select distinct l.id as lead_id, k.key
      from public.leads l
      cross join me
      cross join lateral unnest(array[
        public.kd_phone_key(coalesce(l.phone, '')),
        public.kd_phone_key(coalesce(l.lpr_phone, ''))
      ]) as k(key)
     where me.allowed
       and (not me.hunter or l.owner_id = auth.uid())
       and length(k.key) = 10
  ),
  matched_clients as (
    select lk.lead_id, c.id as client_id, c.name, c.legal_name, c.client_type
      from lead_keys lk
      join public.clients c on c.phone_key = lk.key
  ),
  matched_jobs as (
    select distinct on (lk.lead_id, j.id)
           lk.lead_id, j.id, j.status, j.pest, j.address,
           coalesce(j.scheduled_date, j.reported_at::date, j.created_at::date) as job_date
      from lead_keys lk
      join public.jobs j
        on public.kd_phone_key(coalesce(j.client_phone, '')) = lk.key
        or j.client_id in (select mc.client_id from matched_clients mc where mc.lead_id = lk.lead_id)
     where coalesce(j.status, '') <> 'canceled'
  ),
  job_summary as (
    select mj.lead_id,
           count(*)::integer as jobs_count,
           count(*) filter (where mj.status = 'done')::integer as done_count,
           min(mj.job_date) as first_date,
           max(mj.job_date) as last_date,
           (array_agg(nullif(btrim(mj.pest), '') order by mj.job_date desc nulls last))[1] as last_pest,
           (array_agg(nullif(btrim(mj.address), '') order by mj.job_date desc nulls last))[1] as last_address
      from matched_jobs mj
     group by mj.lead_id
  ),
  client_pick as (
    select distinct on (mc.lead_id) mc.lead_id,
           coalesce(nullif(btrim(mc.legal_name), ''), nullif(btrim(mc.name), '')) as client_name,
           mc.client_type
      from matched_clients mc
     order by mc.lead_id, (mc.client_type = 'company') desc
  )
  select coalesce(js.lead_id, cp.lead_id),
         cp.client_name, cp.client_type,
         coalesce(js.jobs_count, 0), coalesce(js.done_count, 0),
         js.first_date, js.last_date, js.last_pest, js.last_address
    from job_summary js
    full join client_pick cp on cp.lead_id = js.lead_id;
$function$;

revoke all on function public.lead_client_history() from public, anon;
grant execute on function public.lead_client_history() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
