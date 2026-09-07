-- Атомарные расчёты с партнёрами и внесение тендерных обеспечений.
-- Изменение источника и движение по счёту записываются одной транзакцией;
-- сумма и направление рассчитываются сервером. Повторный запуск безопасен.

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
  if NEW.source in ('paperwork', 'tender_pledge') and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0)
    );
    if exists (
      select 1 from public.money_moves m
      where m.source = NEW.source and m.ref_id = NEW.ref_id
    ) then
      raise exception using errcode = '23505', message = 'Движение по этому расчёту уже существует';
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

create or replace function public.post_paperwork_settlement_atomic(
  p_paperwork_id uuid,
  p_account_id uuid,
  p_settled_on date,
  p_method text,
  p_settle_to text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_row public.paperwork%rowtype;
  v_move public.money_moves%rowtype;
  v_move_id uuid;
  v_direction text;
  v_payout numeric;
  v_partner_name text;
  v_to text := nullif(btrim(p_settle_to), '');
  v_note text := nullif(btrim(p_note), '');
  v_method text := nullif(btrim(p_method), '');
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.docs_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для проведения расчёта';
  end if;

  if p_paperwork_id is null or p_account_id is null or p_settled_on is null or v_method is null then
    raise exception using errcode = '22004', message = 'Для расчёта нужны комплект, счёт, дата и способ';
  end if;

  select * into v_row
  from public.paperwork
  where id = p_paperwork_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Комплект документов не найден';
  end if;
  if v_row.scheme not in ('for_partner', 'via_partner') then
    raise exception using errcode = '22023', message = 'Для этой схемы расчёт со второй стороной не предусмотрен';
  end if;
  if v_row.amount <= 0 or v_row.percent < 0 or v_row.percent > 100 then
    raise exception using errcode = '22023', message = 'Некорректная сумма или процент комплекта документов';
  end if;

  v_payout := v_row.amount - round(v_row.amount * v_row.percent / 100);
  v_direction := case when v_row.scheme = 'for_partner' then 'expense' else 'income' end;
  if v_payout <= 0 then
    raise exception using errcode = '22023', message = 'Сумма расчёта должна быть больше нуля';
  end if;

  if v_row.settled_at is not null and (
    v_row.settled_at <> p_settled_on
    or v_row.settle_account_id is distinct from p_account_id
    or v_row.settle_method is distinct from v_method
    or v_row.settle_to is distinct from v_to
    or v_row.settle_note is distinct from v_note
  ) then
    raise exception using errcode = '55000', message = 'Комплект уже рассчитан с другими реквизитами';
  end if;

  select * into v_move
  from public.money_moves
  where source = 'paperwork' and ref_id = p_paperwork_id
  order by created_at, id
  limit 1
  for update;

  if found then
    if v_move.direction <> v_direction
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_payout
       or v_move.move_date is distinct from p_settled_on then
      raise exception using
        errcode = '23505',
        message = 'По этому комплекту уже есть другое движение по счёту',
        hint = 'Сначала выполните сверку существующего движения.';
    end if;

    if v_row.settled_at = p_settled_on
       and v_row.settle_account_id = p_account_id
       and v_row.settle_method = v_method
       and v_row.settle_to is not distinct from v_to
       and v_row.settle_note is not distinct from v_note then
      return v_move.id;
    end if;
  end if;

  update public.paperwork
  set settled_at = p_settled_on,
      settle_method = v_method,
      settle_to = v_to,
      settle_account_id = p_account_id,
      settle_note = v_note,
      updated_at = now()
  where id = p_paperwork_id;

  if v_move.id is not null then
    return v_move.id;
  end if;

  select coalesce(p.name, 'партнёр') into v_partner_name
  from public.partners p
  where p.id = v_row.partner_id;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, v_direction, v_payout, p_settled_on,
    'Расчёт по документам: ' || coalesce(v_partner_name, 'партнёр')
      || case when v_to is not null then ' → ' || v_to else '' end,
    'paperwork', p_paperwork_id, auth.uid()
  )
  returning id into v_move_id;

  return v_move_id;
end
$function$;

create or replace function public.post_tender_guarantee_payment_atomic(
  p_guarantee_id uuid,
  p_account_id uuid,
  p_paid_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_guarantee public.tender_guarantees%rowtype;
  v_move public.money_moves%rowtype;
  v_move_id uuid;
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.tenders_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для внесения обеспечения';
  end if;

  if p_guarantee_id is null or p_account_id is null or p_paid_on is null then
    raise exception using errcode = '22004', message = 'Для внесения нужны обеспечение, счёт и дата';
  end if;

  select * into v_guarantee
  from public.tender_guarantees
  where id = p_guarantee_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Тендерное обеспечение не найдено';
  end if;
  if v_guarantee.amount <= 0 then
    raise exception using errcode = '22023', message = 'Сумма обеспечения должна быть больше нуля';
  end if;
  if v_guarantee.paid_date is not null and v_guarantee.paid_date <> p_paid_on then
    raise exception using errcode = '55000', message = 'Обеспечение уже внесено другой датой';
  end if;
  if v_guarantee.account_id is not null and v_guarantee.account_id <> p_account_id then
    raise exception using errcode = '55000', message = 'Обеспечение уже привязано к другому счёту';
  end if;

  select * into v_move
  from public.money_moves
  where source = 'tender_pledge' and ref_id = p_guarantee_id
  order by created_at, id
  limit 1
  for update;

  if found then
    if v_move.direction <> 'expense'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from v_guarantee.amount
       or v_move.move_date is distinct from p_paid_on then
      raise exception using
        errcode = '23505',
        message = 'По этому обеспечению уже есть другое движение по счёту',
        hint = 'Сначала выполните сверку существующего движения.';
    end if;

    if v_guarantee.paid = true
       and v_guarantee.paid_date = p_paid_on
       and v_guarantee.account_id = p_account_id then
      return v_move.id;
    end if;
  end if;

  update public.tender_guarantees
  set paid = true, account_id = p_account_id, paid_date = p_paid_on
  where id = p_guarantee_id;

  if v_move.id is not null then
    return v_move.id;
  end if;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'expense', v_guarantee.amount, p_paid_on,
    'Обеспечение (залог) по тендеру', 'tender_pledge', p_guarantee_id, auth.uid()
  )
  returning id into v_move_id;

  return v_move_id;
end
$function$;

revoke all on function public.post_paperwork_settlement_atomic(uuid, uuid, date, text, text, text) from public, anon;
revoke all on function public.post_tender_guarantee_payment_atomic(uuid, uuid, date) from public, anon;
grant execute on function public.post_paperwork_settlement_atomic(uuid, uuid, date, text, text, text) to authenticated, service_role;
grant execute on function public.post_tender_guarantee_payment_atomic(uuid, uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения:
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('post_paperwork_settlement_atomic', 'post_tender_guarantee_payment_atomic');
