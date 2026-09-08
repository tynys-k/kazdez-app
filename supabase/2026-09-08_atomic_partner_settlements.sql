-- Атомарные расчёты с партнёрами по заявкам.
-- Флаг «рассчитано» и реальное движение по счёту создаются вместе.

begin;

alter table public.jobs add column if not exists partner_paid_account_id uuid references public.accounts(id);
alter table public.jobs add column if not exists executor_paid_at timestamptz;
alter table public.jobs add column if not exists executor_paid_account_id uuid references public.accounts(id);
alter table public.jobs add column if not exists partner_comp_paid_at timestamptz;
alter table public.jobs add column if not exists partner_comp_account_id uuid references public.accounts(id);

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required access-control functions were not found';
  end if;
end
$migration$;

create or replace function public.kd_prevent_duplicate_derived_settlement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if NEW.source in (
    'paperwork', 'tender_pledge', 'tender_return', 'deposit', 'payroll', 'marketing',
    'job_transfer', 'executor_net', 'partner_payout', 'executor_payout', 'partner_compensation'
  ) and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0));
    if exists (select 1 from public.money_moves m where m.source = NEW.source and m.ref_id = NEW.ref_id) then
      raise exception using errcode = '23505', message = 'Движение по этой операции уже существует';
    end if;
  end if;
  return NEW;
end
$function$;

create or replace function public.post_job_partner_settlement_atomic(
  p_job_id uuid,
  p_kind text,
  p_account_id uuid,
  p_settled_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_job public.jobs%rowtype;
  v_move public.money_moves%rowtype;
  v_move_count integer;
  v_direction text;
  v_amount numeric;
  v_source text;
  v_note text;
  v_cost numeric := 0;
  v_move_id uuid;
  v_already_marked boolean;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.finance_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для расчётов с партнёрами';
  end if;
  if p_job_id is null or p_kind is null or p_account_id is null or p_settled_on is null then
    raise exception using errcode = '22004', message = 'Для расчёта нужны заявка, вид операции, счёт и дата';
  end if;
  if p_kind not in ('partner_payout', 'executor_payout', 'partner_compensation') then
    raise exception using errcode = '22023', message = 'Неизвестный вид расчёта с партнёром';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_job_id::text, 0));
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Заявка не найдена'; end if;
  if v_job.status <> 'done' then
    raise exception using errcode = '55000', message = 'Расчёт разрешён только по выполненной заявке';
  end if;

  if p_kind = 'partner_payout' then
    if v_job.partner_id is null then raise exception using errcode = '55000', message = 'В заявке не выбран партнёр'; end if;
    if coalesce(v_job.partner_share, 0) < 0 or coalesce(v_job.partner_share, 0) > 100 then
      raise exception using errcode = '22023', message = 'Доля партнёра должна быть от 0 до 100 процентов';
    end if;
    if coalesce(v_job.joint_work, false) then
      select coalesce(sum(
        coalesce(nullif(line.item->>'amount', '')::numeric, nullif(line.item->>'ml', '')::numeric, 0)
        * coalesce(price.price_per_liter, chem.price_per_liter, 0)
        / case when chem.unit_kind in ('piece', 'pack') then 1 else 1000 end
      ), 0) into v_cost
      from jsonb_array_elements(coalesce(v_job.chemicals, '[]'::jsonb)) as line(item)
      left join lateral (
        select c.* from public.chemicals c
        where (nullif(line.item->>'chemical_id', '') is not null and c.id = (line.item->>'chemical_id')::uuid)
           or (nullif(line.item->>'chemical_id', '') is null and lower(btrim(c.name)) = lower(btrim(line.item->>'name')))
        order by c.id limit 1
      ) chem on true
      left join lateral (
        select cp.price_per_liter from public.chemical_purchases cp
        where cp.chemical_id = chem.id
          and cp.price_per_liter is not null
          and (v_job.scheduled_date is null or cp.purchase_date <= v_job.scheduled_date)
        order by cp.purchase_date desc, cp.created_at desc, cp.id desc limit 1
      ) price on true;
    end if;
    v_amount := case when coalesce(v_job.joint_work, false)
      then round((coalesce(v_job.report_paid, 0) - v_cost) * coalesce(v_job.partner_share, 0) / 100
        - case when v_job.joint_supplier = 'us' then v_cost * coalesce(v_job.joint_cost_share, 0) / 100 else 0 end)
      else round(coalesce(v_job.report_paid, 0) * coalesce(v_job.partner_share, 0) / 100)
    end;
    v_direction := 'expense'; v_source := 'partner_payout';
    v_note := 'Выплата доли партнёру: ' || coalesce(v_job.pest, 'заявка') || ' · ' || coalesce(v_job.address, '');
    v_already_marked := coalesce(v_job.partner_paid, false);
  elsif p_kind = 'executor_payout' then
    if v_job.executor_partner_id is null or v_job.executor_settlement <> 'qr_full' then
      raise exception using errcode = '55000', message = 'По этой заявке нет доли исполнителю к выплате';
    end if;
    if coalesce(v_job.executor_share_pct, 0) < 0 or coalesce(v_job.executor_share_pct, 0) > 100 then
      raise exception using errcode = '22023', message = 'Доля исполнителя должна быть от 0 до 100 процентов';
    end if;
    v_amount := round(coalesce(v_job.report_paid, 0) * coalesce(v_job.executor_share_pct, 0) / 100);
    v_direction := 'expense'; v_source := 'executor_payout';
    v_note := 'Выплата партнёру-исполнителю: ' || coalesce(v_job.pest, 'заявка') || ' · ' || coalesce(v_job.address, '');
    v_already_marked := coalesce(v_job.executor_paid, false);
  else
    if v_job.partner_id is null then raise exception using errcode = '55000', message = 'В заявке не выбран партнёр'; end if;
    v_amount := coalesce(v_job.partner_comp, 0);
    v_direction := 'income'; v_source := 'partner_compensation';
    v_note := 'Компенсация препаратов от партнёра: ' || coalesce(v_job.pest, 'заявка') || ' · ' || coalesce(v_job.address, '');
    v_already_marked := coalesce(v_job.partner_comp_paid, false);
  end if;

  if v_amount <= 0 then raise exception using errcode = '22023', message = 'Сумма расчёта должна быть больше нуля'; end if;

  select count(*) into v_move_count from public.money_moves where source = v_source and ref_id = p_job_id;
  if v_move_count > 1 then
    raise exception using errcode = '55000', message = 'По расчёту найдено несколько движений', hint = 'Сначала выполните сверку финансов.';
  end if;
  if v_move_count = 1 then
    select * into v_move from public.money_moves where source = v_source and ref_id = p_job_id for update;
    if v_move.direction <> v_direction
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_amount
       or v_move.move_date is distinct from p_settled_on then
      raise exception using errcode = '55000', message = 'Расчёт не совпадает с движением по счёту', hint = 'Сначала выполните сверку финансов.';
    end if;
    if not v_already_marked then
      raise exception using errcode = '55000', message = 'Движение по счёту есть, но заявка не отмечена рассчитанной', hint = 'Сначала выполните сверку финансов.';
    end if;
    return v_move.id;
  end if;
  if v_already_marked then
    raise exception using errcode = '55000', message = 'Расчёт отмечен флагом, но движение по счёту отсутствует', hint = 'Сначала выполните сверку финансов.';
  end if;

  insert into public.money_moves (account_id, direction, amount, move_date, note, source, ref_id, created_by)
  values (p_account_id, v_direction, v_amount, p_settled_on, v_note, v_source, p_job_id, auth.uid())
  returning id into v_move_id;

  if p_kind = 'partner_payout' then
    update public.jobs set partner_paid = true, partner_paid_at = p_settled_on::timestamptz,
      partner_paid_account_id = p_account_id where id = p_job_id;
  elsif p_kind = 'executor_payout' then
    update public.jobs set executor_paid = true, executor_paid_at = p_settled_on::timestamptz,
      executor_paid_account_id = p_account_id where id = p_job_id;
  else
    update public.jobs set partner_comp_paid = true, partner_comp_paid_at = p_settled_on::timestamptz,
      partner_comp_account_id = p_account_id where id = p_job_id;
  end if;
  return v_move_id;
end
$function$;

create or replace function public.kd_protect_job_partner_settlements()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if coalesce(OLD.partner_paid, false) and not coalesce(NEW.partner_paid, false) then
    raise exception using errcode = '55000', message = 'Проведённую выплату партнёру нельзя снять флагом';
  end if;
  if not coalesce(OLD.partner_paid, false) and coalesce(NEW.partner_paid, false)
     and not exists (select 1 from public.money_moves where source = 'partner_payout' and ref_id = NEW.id) then
    raise exception using errcode = '55000', message = 'Сначала проведите выплату партнёру через счёт';
  end if;
  if coalesce(OLD.partner_comp_paid, false) and not coalesce(NEW.partner_comp_paid, false) then
    raise exception using errcode = '55000', message = 'Проведённую компенсацию нельзя снять флагом';
  end if;
  if not coalesce(OLD.partner_comp_paid, false) and coalesce(NEW.partner_comp_paid, false)
     and not exists (select 1 from public.money_moves where source = 'partner_compensation' and ref_id = NEW.id) then
    raise exception using errcode = '55000', message = 'Сначала проведите компенсацию через счёт';
  end if;
  if coalesce(OLD.executor_paid, false) and not coalesce(NEW.executor_paid, false) then
    raise exception using errcode = '55000', message = 'Проведённую выплату исполнителю нельзя снять флагом';
  end if;
  if OLD.executor_settlement = 'qr_full'
     and not coalesce(OLD.executor_paid, false) and coalesce(NEW.executor_paid, false)
     and not exists (select 1 from public.money_moves where source = 'executor_payout' and ref_id = NEW.id) then
    raise exception using errcode = '55000', message = 'Сначала проведите выплату исполнителю через счёт';
  end if;
  return NEW;
end
$function$;

revoke all on function public.post_job_partner_settlement_atomic(uuid, text, uuid, date) from public, anon;
grant execute on function public.post_job_partner_settlement_atomic(uuid, text, uuid, date) to authenticated, service_role;
revoke all on function public.kd_protect_job_partner_settlements() from public, anon, authenticated;

drop trigger if exists kd_protect_job_partner_settlements on public.jobs;
create trigger kd_protect_job_partner_settlements
  before update of partner_paid, partner_comp_paid, executor_paid on public.jobs
  for each row execute function public.kd_protect_job_partner_settlements();

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'post_job_partner_settlement_atomic';
