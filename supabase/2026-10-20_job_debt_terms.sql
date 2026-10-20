-- Оплата в долг, о которой договорились до выполнения работ: клиент заранее
-- попросил отсрочку или попросил её на месте. Это отметка на заявке, чтобы
-- админ видел её в списке и во вкладке «Долги». Сам долг (сумма и погашение)
-- по-прежнему возникает в job_debts при сдаче отчёта.

begin;

alter table public.jobs add column if not exists debt_mode text;
alter table public.jobs add column if not exists debt_due_on date;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_debt_mode_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_debt_mode_check
      check (debt_mode is null or debt_mode in ('advance', 'on_site'));
  end if;
end
$constraints$;

create index if not exists jobs_debt_mode_idx on public.jobs (scheduled_date) where debt_mode is not null;

-- Атомарное создание остаётся прежним: обёртка лишь дописывает условия долга
-- в ту же транзакцию, как это сделано для гарантийных условий.
do $wrap$
begin
  if to_regprocedure('public.create_job_atomic_docs(uuid, jsonb)') is null then
    alter function public.create_job_atomic(uuid, jsonb) rename to create_job_atomic_docs;
  end if;
end
$wrap$;
revoke all on function public.create_job_atomic_docs(uuid, jsonb) from public, anon, authenticated;

create or replace function public.create_job_atomic(p_request_id uuid, p_job jsonb)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_mode text;
begin
  v_mode := nullif(btrim(coalesce(p_job->>'debt_mode', '')), '');
  if v_mode is not null and v_mode not in ('advance', 'on_site') then
    raise exception using errcode = '22023', message = 'Некорректный вид оплаты в долг';
  end if;
  v_id := public.create_job_atomic_docs(p_request_id, p_job);
  update public.jobs
     set debt_mode = v_mode,
         debt_due_on = case when v_mode is null then null else nullif(p_job->>'debt_due_on', '')::date end
   where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.create_job_atomic(uuid, jsonb) from public, anon;
grant execute on function public.create_job_atomic(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'jobs'
--   and column_name in ('debt_mode', 'debt_due_on');
