-- Атомарный частичный возврат тендерного обеспечения:
-- одна операция создаёт и возврат, и приход на счёт, а повторный запрос не дублирует деньги.
begin;

alter table public.guarantee_returns
  add column if not exists request_id uuid;

create unique index if not exists guarantee_returns_request_id_key
  on public.guarantee_returns (request_id)
  where request_id is not null;

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
  if NEW.source in ('paperwork', 'tender_pledge', 'tender_return') and NEW.ref_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(NEW.source || ':' || NEW.ref_id::text, 0));
    if exists (
      select 1 from public.money_moves m
      where m.source = NEW.source and m.ref_id = NEW.ref_id
    ) then
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

create or replace function public.post_tender_guarantee_return_atomic(
  p_request_id uuid,
  p_guarantee_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_returned_on date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_guarantee public.tender_guarantees%rowtype;
  v_existing public.guarantee_returns%rowtype;
  v_move public.money_moves%rowtype;
  v_return_id uuid;
  v_returned numeric;
  v_note text := nullif(btrim(p_note), '');
begin
  if not (
    coalesce(public.kd_account_active(), false)
    and (
      public.is_admin()
      or public.kd_has_permission('action.tenders_edit')
      or public.kd_has_permission('action.finance_edit')
    )
  ) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для возврата обеспечения';
  end if;

  if p_request_id is null or p_guarantee_id is null or p_account_id is null or p_returned_on is null then
    raise exception using errcode = '22004', message = 'Для возврата нужны операция, обеспечение, счёт и дата';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Сумма возврата должна быть больше нуля';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('guarantee_return:' || p_request_id::text, 0));

  select * into v_existing
  from public.guarantee_returns
  where request_id = p_request_id
  for update;

  if found then
    select * into v_move
    from public.money_moves
    where source = 'tender_return' and ref_id = v_existing.id
    order by created_at, id
    limit 1
    for update;

    if v_existing.guarantee_id is distinct from p_guarantee_id
       or v_existing.amount is distinct from p_amount
       or v_existing.return_date is distinct from p_returned_on
       or v_existing.account_id is distinct from p_account_id
       or v_existing.note is distinct from v_note
       or v_move.id is null
       or v_move.direction <> 'income'
       or v_move.account_id is distinct from p_account_id
       or v_move.amount is distinct from p_amount
       or v_move.move_date is distinct from p_returned_on then
      raise exception using
        errcode = '23505',
        message = 'Этот запрос возврата уже использован с другими данными',
        hint = 'Обновите страницу и проверьте существующий возврат.';
    end if;
    return v_existing.id;
  end if;

  select * into v_guarantee
  from public.tender_guarantees
  where id = p_guarantee_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Тендерное обеспечение не найдено';
  end if;
  if not coalesce(v_guarantee.paid, false) then
    raise exception using errcode = '55000', message = 'Нельзя вернуть обеспечение, которое ещё не внесено';
  end if;

  select coalesce(sum(r.amount), 0) into v_returned
  from public.guarantee_returns r
  where r.guarantee_id = p_guarantee_id;

  if p_amount > v_guarantee.amount - v_returned then
    raise exception using
      errcode = '22023',
      message = 'Сумма возврата больше доступного остатка',
      detail = format('Осталось вернуть: %s', greatest(v_guarantee.amount - v_returned, 0));
  end if;

  insert into public.guarantee_returns (
    guarantee_id, amount, return_date, account_id, note, created_by, request_id
  ) values (
    p_guarantee_id, p_amount, p_returned_on, p_account_id, v_note, auth.uid(), p_request_id
  ) returning id into v_return_id;

  insert into public.money_moves (
    account_id, direction, amount, move_date, note, source, ref_id, created_by
  ) values (
    p_account_id, 'income', p_amount, p_returned_on,
    'Возврат обеспечения по тендеру', 'tender_return', v_return_id, auth.uid()
  );

  return v_return_id;
end
$function$;

revoke all on function public.post_tender_guarantee_return_atomic(uuid, uuid, numeric, uuid, date, text) from public, anon;
grant execute on function public.post_tender_guarantee_return_atomic(uuid, uuid, numeric, uuid, date, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- Проверка после применения:
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name = 'post_tender_guarantee_return_atomic';
