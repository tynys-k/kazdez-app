-- Атомарный приход препаратов: карточка остатка и строка закупки сохраняются вместе.
-- Повтор запроса после обрыва связи безопасен благодаря request_id.

begin;

alter table public.chemical_purchases add column if not exists request_id uuid;
create unique index if not exists chemical_purchases_request_id_key
  on public.chemical_purchases (request_id) where request_id is not null;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Required access-control functions were not found';
  end if;
end
$migration$;

create or replace function public.create_chemical_with_stock_atomic(
  p_request_id uuid,
  p_name text,
  p_active_substance text,
  p_default_concentration numeric,
  p_unit_kind text,
  p_amount numeric,
  p_price_per_liter numeric,
  p_min_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_purchase public.chemical_purchases%rowtype;
  v_chemical public.chemicals%rowtype;
  v_name text := nullif(btrim(p_name), '');
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.stock_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для добавления препарата';
  end if;
  if p_request_id is null or v_name is null or p_unit_kind is null then
    raise exception using errcode = '22004', message = 'Для препарата нужны операция, название и единица измерения';
  end if;
  if p_unit_kind not in ('volume', 'weight', 'piece', 'pack') then
    raise exception using errcode = '22023', message = 'Неизвестная единица измерения препарата';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception using errcode = '22023', message = 'Количество должно быть больше нуля'; end if;
  if coalesce(p_price_per_liter, 0) < 0 or coalesce(p_min_amount, 0) < 0 then
    raise exception using errcode = '22023', message = 'Цена и минимальный остаток не могут быть отрицательными';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chemical_purchase_request:' || p_request_id::text, 0));
  select * into v_purchase from public.chemical_purchases where request_id = p_request_id for update;
  if found then
    select * into v_chemical from public.chemicals where id = v_purchase.chemical_id for update;
    if not found
       or v_chemical.name is distinct from v_name
       or v_chemical.unit_kind is distinct from p_unit_kind
       or v_purchase.amount is distinct from p_amount
       or v_purchase.price_per_liter is distinct from p_price_per_liter then
      raise exception using errcode = '23505', message = 'Этот запрос прихода уже использован с другими данными';
    end if;
    return v_chemical.id;
  end if;

  insert into public.chemicals (
    name, active_substance, default_concentration, unit_kind,
    purchased_ml, price_per_liter, min_ml
  ) values (
    v_name, nullif(btrim(p_active_substance), ''), p_default_concentration, p_unit_kind,
    p_amount, p_price_per_liter, coalesce(p_min_amount, 0)
  ) returning * into v_chemical;

  insert into public.chemical_purchases (
    chemical_id, purchase_date, amount, price_per_liter, note, created_by, request_id
  ) values (
    v_chemical.id, current_date, p_amount, p_price_per_liter,
    'Первоначальный приход при создании препарата', auth.uid(), p_request_id
  );
  return v_chemical.id;
end
$function$;

create or replace function public.post_chemical_purchase_atomic(
  p_request_id uuid,
  p_chemical_id uuid,
  p_amount numeric,
  p_price_per_liter numeric,
  p_purchase_date date,
  p_supplier text,
  p_batch_no text,
  p_expires_on date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_purchase public.chemical_purchases%rowtype;
  v_chemical public.chemicals%rowtype;
  v_purchase_id uuid;
  v_supplier text := nullif(btrim(p_supplier), '');
  v_batch_no text := nullif(btrim(p_batch_no), '');
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.stock_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для оформления прихода';
  end if;
  if p_request_id is null or p_chemical_id is null or p_purchase_date is null then
    raise exception using errcode = '22004', message = 'Для прихода нужны операция, препарат и дата';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception using errcode = '22023', message = 'Количество должно быть больше нуля'; end if;
  if p_price_per_liter is not null and p_price_per_liter < 0 then raise exception using errcode = '22023', message = 'Цена не может быть отрицательной'; end if;
  if p_expires_on is not null and p_expires_on < p_purchase_date then
    raise exception using errcode = '22023', message = 'Срок годности не может быть раньше даты прихода';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('chemical_purchase_request:' || p_request_id::text, 0));
  select * into v_purchase from public.chemical_purchases where request_id = p_request_id for update;
  if found then
    if v_purchase.chemical_id is distinct from p_chemical_id
       or v_purchase.amount is distinct from p_amount
       or v_purchase.price_per_liter is distinct from p_price_per_liter
       or v_purchase.purchase_date is distinct from p_purchase_date
       or v_purchase.supplier is distinct from v_supplier
       or v_purchase.batch_no is distinct from v_batch_no
       or v_purchase.expires_on is distinct from p_expires_on then
      raise exception using errcode = '23505', message = 'Этот запрос прихода уже использован с другими данными';
    end if;
    return v_purchase.id;
  end if;

  select * into v_chemical from public.chemicals where id = p_chemical_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Препарат не найден'; end if;

  insert into public.chemical_purchases (
    chemical_id, purchase_date, amount, price_per_liter, supplier,
    batch_no, expires_on, created_by, request_id
  ) values (
    p_chemical_id, p_purchase_date, p_amount, p_price_per_liter, v_supplier,
    v_batch_no, p_expires_on, auth.uid(), p_request_id
  ) returning id into v_purchase_id;

  update public.chemicals
  set purchased_ml = coalesce(v_chemical.purchased_ml, 0) + p_amount,
      price_per_liter = coalesce(p_price_per_liter, v_chemical.price_per_liter)
  where id = p_chemical_id;

  return v_purchase_id;
end
$function$;

revoke all on function public.create_chemical_with_stock_atomic(uuid, text, text, numeric, text, numeric, numeric, numeric) from public, anon;
revoke all on function public.post_chemical_purchase_atomic(uuid, uuid, numeric, numeric, date, text, text, date) from public, anon;
grant execute on function public.create_chemical_with_stock_atomic(uuid, text, text, numeric, text, numeric, numeric, numeric) to authenticated, service_role;
grant execute on function public.post_chemical_purchase_atomic(uuid, uuid, numeric, numeric, date, text, text, date) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in ('create_chemical_with_stock_atomic', 'post_chemical_purchase_atomic');
