-- Атомарные поступления по выполненным заявкам.
-- Статус оплаты и движение по счёту всегда изменяются одной транзакцией.

begin;

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
  if NEW.source in ('paperwork', 'tender_pledge', 'tender_return', 'deposit', 'payroll', 'marketing', 'job_transfer', 'executor_net')
     and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0));
    if exists (select 1 from public.money_moves m where m.source = NEW.source and m.ref_id = NEW.ref_id) then
      raise exception using errcode = '23505', message = 'Движение по этой операции уже существует';
    end if;
  end if;
  return NEW;
end
$function$;

revoke all on function public.kd_prevent_duplicate_derived_settlement() from public, anon, authenticated;
drop trigger if exists kd_no_duplicate_derived_settlement on public.money_moves;
create trigger kd_no_duplicate_derived_settlement
  before insert on public.money_moves
  for each row execute function public.kd_prevent_duplicate_derived_settlement();

create or replace function public.post_job_transfer_payment_atomic(
  p_job_id uuid,
  p_account_id uuid,
  p_paid_on date
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
  v_move_id uuid;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin()
    or public.kd_has_permission('action.finance_edit')
    or public.kd_has_permission('action.jobs_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для проведения оплаты заявки';
  end if;
  if p_job_id is null or p_account_id is null or p_paid_on is null then
    raise exception using errcode = '22004', message = 'Для оплаты нужны заявка, счёт и дата';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('job_transfer:' || p_job_id::text, 0));
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Заявка не найдена'; end if;
  if v_job.status <> 'done' then raise exception using errcode = '55000', message = 'Оплату можно зачесть только выполненной заявке'; end if;
  if coalesce(v_job.report_transfer, 0) <= 0 then raise exception using errcode = '22023', message = 'В заявке нет положительной суммы перечисления'; end if;
  if v_job.transfer_account_id is not null and v_job.transfer_account_id <> p_account_id then
    raise exception using errcode = '55000', message = 'Оплата уже привязана к другому счёту';
  end if;
  if v_job.transfer_paid_date is not null and v_job.transfer_paid_date <> p_paid_on then
    raise exception using errcode = '55000', message = 'Оплата уже отмечена другой датой';
  end if;

  select count(*) into v_move_count from public.money_moves where source = 'job_transfer' and ref_id = p_job_id;
  if v_move_count > 1 then
    raise exception using errcode = '55000', message = 'По оплате заявки найдено несколько движений', hint = 'Сначала выполните сверку финансов.';
  end if;
  if v_move_count = 1 then
    select * into v_move from public.money_moves where source = 'job_transfer' and ref_id = p_job_id for update;
    if v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_job.report_transfer
       or v_move.move_date is distinct from p_paid_on then
      raise exception using errcode = '55000', message = 'Оплата заявки не совпадает с движением по счёту', hint = 'Сначала выполните сверку финансов.';
    end if;
  end if;

  update public.jobs
  set transfer_paid = true, transfer_account_id = p_account_id, transfer_paid_date = p_paid_on
  where id = p_job_id;

  if v_move_count = 1 then return v_move.id; end if;
  insert into public.money_moves (account_id, direction, amount, move_date, note, source, ref_id, created_by)
  values (
    p_account_id, 'income', v_job.report_transfer, p_paid_on,
    'Оплата перечислением: ' || coalesce(v_job.pest, 'заявка') || ' · ' || coalesce(v_job.address, ''),
    'job_transfer', p_job_id, auth.uid()
  ) returning id into v_move_id;
  return v_move_id;
end
$function$;

create or replace function public.complete_executor_job_atomic(
  p_job_id uuid,
  p_full_amount numeric,
  p_settlement text,
  p_account_id uuid default null,
  p_paid_on date default null
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
  v_our_part numeric;
  v_move_id uuid;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin()
    or public.kd_has_permission('action.finance_edit')
    or public.kd_has_permission('action.jobs_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для закрытия заявки партнёра';
  end if;
  if p_job_id is null or p_full_amount is null or p_settlement is null then
    raise exception using errcode = '22004', message = 'Не заполнены данные закрытия заявки';
  end if;
  if p_full_amount <= 0 then raise exception using errcode = '22023', message = 'Сумма заявки должна быть больше нуля'; end if;
  if p_settlement not in ('qr_full', 'net_to_us') then raise exception using errcode = '22023', message = 'Неизвестный способ расчёта'; end if;
  if p_settlement = 'net_to_us' and (p_account_id is null or p_paid_on is null) then
    raise exception using errcode = '22004', message = 'Для нашей доли нужны счёт и дата поступления';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('executor_net:' || p_job_id::text, 0));
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Заявка не найдена'; end if;
  if v_job.executor_partner_id is null then raise exception using errcode = '55000', message = 'У заявки не выбран партнёр-исполнитель'; end if;
  if coalesce(v_job.executor_share_pct, 0) < 0 or coalesce(v_job.executor_share_pct, 0) > 100 then
    raise exception using errcode = '22023', message = 'Доля партнёра должна быть от 0 до 100 процентов';
  end if;
  v_our_part := round(p_full_amount * (100 - coalesce(v_job.executor_share_pct, 0)) / 100);

  select count(*) into v_move_count from public.money_moves where source = 'executor_net' and ref_id = p_job_id;
  if v_move_count > 1 then
    raise exception using errcode = '55000', message = 'По заявке партнёра найдено несколько движений', hint = 'Сначала выполните сверку финансов.';
  end if;
  if v_move_count = 1 then
    select * into v_move from public.money_moves where source = 'executor_net' and ref_id = p_job_id for update;
    if p_settlement <> 'net_to_us'
       or v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_our_part
       or v_move.move_date is distinct from p_paid_on then
      raise exception using errcode = '55000', message = 'Расчёт партнёра не совпадает с движением по счёту', hint = 'Сначала выполните сверку финансов.';
    end if;
  end if;

  if v_job.executor_settlement is not null and (
    v_job.executor_settlement is distinct from p_settlement
    or v_job.report_paid is distinct from case when p_settlement = 'qr_full' then p_full_amount else v_our_part end
    or v_job.report_qr is distinct from case when p_settlement = 'qr_full' then p_full_amount else 0 end
  ) then
    raise exception using errcode = '55000', message = 'Заявка уже закрыта с другими данными', hint = 'Не проводите её второй раз; сначала выполните сверку.';
  end if;

  update public.jobs set
    status = 'done', work_stage = 'done', reported_at = coalesce(reported_at, now()),
    executor_settlement = p_settlement,
    report_method = case when p_settlement = 'qr_full' then 'QR (за партнёра)' else 'Перевод нашей доли' end,
    report_paid = case when p_settlement = 'qr_full' then p_full_amount else v_our_part end,
    report_qr = case when p_settlement = 'qr_full' then p_full_amount else 0 end,
    report_cash = 0,
    executor_paid = (p_settlement = 'net_to_us')
  where id = p_job_id;

  if p_settlement = 'qr_full' then return null; end if;
  if v_move_count = 1 then return v_move.id; end if;
  insert into public.money_moves (account_id, direction, amount, move_date, note, source, ref_id, created_by)
  values (
    p_account_id, 'income', v_our_part, p_paid_on,
    'Наша доля от партнёра-исполнителя: ' || coalesce(v_job.pest, 'заявка') || ' · ' || coalesce(v_job.address, ''),
    'executor_net', p_job_id, auth.uid()
  ) returning id into v_move_id;
  return v_move_id;
end
$function$;

revoke all on function public.post_job_transfer_payment_atomic(uuid, uuid, date) from public, anon;
revoke all on function public.complete_executor_job_atomic(uuid, numeric, text, uuid, date) from public, anon;
grant execute on function public.post_job_transfer_payment_atomic(uuid, uuid, date) to authenticated, service_role;
grant execute on function public.complete_executor_job_atomic(uuid, numeric, text, uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('post_job_transfer_payment_atomic', 'complete_executor_job_atomic');
