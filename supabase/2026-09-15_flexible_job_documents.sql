-- A warranty is agreed for the order, not inferred from "Первичная"/"Вторичная".
begin;
alter table public.jobs
  add column if not exists guarantee_after_visit integer not null default 2;
alter table public.jobs
  add column if not exists guarantee_terms text;

alter table public.jobs
  add constraint jobs_guarantee_after_visit_range
  check (guarantee_after_visit between 1 and 10);

-- Preserve the existing audited atomic creation workflow, then attach the
-- document plan to the newly created row in the same database transaction.
alter function public.create_job_atomic(uuid, jsonb) rename to create_job_atomic_base;
revoke all on function public.create_job_atomic_base(uuid, jsonb) from public, anon, authenticated;

create function public.create_job_atomic(p_request_id uuid, p_job jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_after integer;
begin
  v_after := coalesce((p_job->>'guarantee_after_visit')::integer, 2);
  if v_after not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Номер обработки для начала гарантии должен быть от 1 до 10';
  end if;
  v_id := public.create_job_atomic_base(p_request_id, p_job);
  update public.jobs
     set guarantee_after_visit = v_after,
         guarantee_terms = nullif(btrim(p_job->>'guarantee_terms'), '')
   where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.create_job_atomic(uuid, jsonb) from public, anon;
grant execute on function public.create_job_atomic(uuid, jsonb) to authenticated, service_role;

-- Reuse the policy on every visit of the same order. The base function still
-- owns idempotency, locking and the visit-number calculation.
alter function public.create_order_visit_atomic(uuid, text, uuid, date, text)
  rename to create_order_visit_atomic_base;
revoke all on function public.create_order_visit_atomic_base(uuid, text, uuid, date, text)
  from public, anon, authenticated;

create function public.create_order_visit_atomic(
  p_origin_job_id uuid, p_kind text, p_request_id uuid default null,
  p_scheduled_date date default null, p_note text default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  v_id := public.create_order_visit_atomic_base(
    p_origin_job_id, p_kind, p_request_id, p_scheduled_date, p_note
  );
  update public.jobs child
     set guarantee_after_visit = origin.guarantee_after_visit,
         guarantee_terms = origin.guarantee_terms
    from public.jobs origin
   where child.id = v_id and origin.id = p_origin_job_id;
  return v_id;
end;
$$;
revoke all on function public.create_order_visit_atomic(uuid, text, uuid, date, text) from public, anon;
grant execute on function public.create_order_visit_atomic(uuid, text, uuid, date, text) to authenticated, service_role;

-- Editing the agreed plan on any visit keeps the whole order consistent.
create function public.sync_order_document_plan()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.order_id is not null and (
    new.guarantee_after_visit is distinct from old.guarantee_after_visit
    or new.guarantee_months is distinct from old.guarantee_months
    or new.guarantee_terms is distinct from old.guarantee_terms
  ) then
    update public.jobs
       set guarantee_after_visit = new.guarantee_after_visit,
           guarantee_months = new.guarantee_months,
           guarantee_terms = new.guarantee_terms
     where order_id = new.order_id and id <> new.id
       and (guarantee_after_visit is distinct from new.guarantee_after_visit
         or guarantee_months is distinct from new.guarantee_months
         or guarantee_terms is distinct from new.guarantee_terms);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_order_document_plan() from public, anon, authenticated;
create trigger jobs_sync_order_document_plan
after update of guarantee_after_visit, guarantee_months, guarantee_terms on public.jobs
for each row execute function public.sync_order_document_plan();
notify pgrst, 'reload schema';
commit;
