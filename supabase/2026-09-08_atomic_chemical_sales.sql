-- Атомарная продажа препарата партнёру.
-- Продажа и списание с остатка сотрудника теперь сохраняются одной транзакцией.
-- Повтор запроса после обрыва связи безопасен благодаря request_id.

begin;

alter table public.chemical_sales add column if not exists request_id uuid;
create unique index if not exists chemical_sales_request_id_key
  on public.chemical_sales (request_id) where request_id is not null;

alter table public.inventory_adjustments
  add column if not exists chemical_sale_id uuid references public.chemical_sales(id) on delete restrict;
create unique index if not exists inventory_adjustments_chemical_sale_id_key
  on public.inventory_adjustments (chemical_sale_id) where chemical_sale_id is not null;

do $migration$
begin
  if to_regprocedure('public.kd_account_active()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.kd_has_permission(text)') is null
     or to_regprocedure('public.kd_enforce_open_period()') is null then
    raise exception 'Required access-control functions were not found';
  end if;
end
$migration$;

create or replace function public.save_chemical_sale_atomic(
  p_request_id uuid,
  p_sale_id uuid,
  p_partner_id uuid,
  p_chemical_id uuid,
  p_from_tech_id uuid,
  p_amount numeric,
  p_unit_price numeric,
  p_sold_on date,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_sale public.chemical_sales%rowtype;
  v_adjustment public.inventory_adjustments%rowtype;
  v_unit_kind text;
  v_factor numeric;
  v_total numeric;
  v_note text := nullif(btrim(p_note), '');
  v_partner_name text;
  v_sale_id uuid;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin()
    or public.kd_has_permission('action.stock_edit')
    or public.kd_has_permission('action.finance_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для продажи препарата';
  end if;
  if p_partner_id is null or p_chemical_id is null or p_sold_on is null then
    raise exception using errcode = '22004', message = 'Для продажи нужны партнёр, препарат и дата';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception using errcode = '22023', message = 'Количество должно быть больше нуля';
  end if;
  if coalesce(p_unit_price, 0) < 0 then
    raise exception using errcode = '22023', message = 'Цена не может быть отрицательной';
  end if;
  if p_sale_id is null and p_request_id is null then
    raise exception using errcode = '22004', message = 'Не указан номер операции продажи';
  end if;

  select c.unit_kind into v_unit_kind
  from public.chemicals c where c.id = p_chemical_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Препарат не найден'; end if;

  select p.name into v_partner_name
  from public.partners p where p.id = p_partner_id for key share;
  if not found then raise exception using errcode = 'P0002', message = 'Партнёр не найден'; end if;

  if p_from_tech_id is not null then
    perform 1 from public.profiles p where p.id = p_from_tech_id for key share;
    if not found then raise exception using errcode = 'P0002', message = 'Сотрудник не найден'; end if;
  end if;

  v_factor := case when v_unit_kind in ('piece', 'pack') then 1 else 1000 end;
  v_total := round((p_amount / v_factor) * coalesce(p_unit_price, 0));

  if p_sale_id is null then
    perform pg_advisory_xact_lock(hashtextextended('chemical_sale_request:' || p_request_id::text, 0));
    select * into v_sale from public.chemical_sales where request_id = p_request_id for update;
    if found then
      if v_sale.partner_id is distinct from p_partner_id
         or v_sale.chemical_id is distinct from p_chemical_id
         or v_sale.from_tech_id is distinct from p_from_tech_id
         or v_sale.amount is distinct from p_amount
         or v_sale.unit_price is distinct from coalesce(p_unit_price, 0)
         or v_sale.total is distinct from v_total
         or v_sale.sold_on is distinct from p_sold_on
         or v_sale.note is distinct from v_note then
        raise exception using errcode = '23505', message = 'Этот запрос продажи уже использован с другими данными';
      end if;
      return v_sale.id;
    end if;

    insert into public.chemical_sales (
      partner_id, chemical_id, from_tech_id, amount, unit_price, total,
      sold_on, note, created_by, request_id
    ) values (
      p_partner_id, p_chemical_id, p_from_tech_id, p_amount, coalesce(p_unit_price, 0), v_total,
      p_sold_on, v_note, auth.uid(), p_request_id
    ) returning id into v_sale_id;

    if p_from_tech_id is not null then
      insert into public.inventory_adjustments (
        tech_id, chemical_id, amount_delta, kind, event_date, note, created_by, chemical_sale_id
      ) values (
        p_from_tech_id, p_chemical_id, -p_amount, 'sold_partner', p_sold_on,
        'Продан партнёру: ' || coalesce(v_partner_name, 'партнёр'), auth.uid(), v_sale_id
      );
    end if;
    return v_sale_id;
  end if;

  select * into v_sale from public.chemical_sales where id = p_sale_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Продажа не найдена'; end if;
  if v_sale.paid_on is not null then
    raise exception using errcode = '55000', message = 'Оплаченная продажа защищена от изменения';
  end if;

  select * into v_adjustment
  from public.inventory_adjustments where chemical_sale_id = p_sale_id for update;

  if v_sale.from_tech_id is not null and not found then
    raise exception using
      errcode = '55000',
      message = 'Старая продажа не связана со списанием сотрудника',
      hint = 'Сверьте остаток сотрудника и оформите исправление через ревизию.';
  end if;

  update public.chemical_sales set
    partner_id = p_partner_id,
    chemical_id = p_chemical_id,
    from_tech_id = p_from_tech_id,
    amount = p_amount,
    unit_price = coalesce(p_unit_price, 0),
    total = v_total,
    sold_on = p_sold_on,
    note = v_note
  where id = p_sale_id;

  if v_adjustment.id is not null and p_from_tech_id is null then
    delete from public.inventory_adjustments where id = v_adjustment.id;
  elsif v_adjustment.id is not null then
    update public.inventory_adjustments set
      tech_id = p_from_tech_id,
      chemical_id = p_chemical_id,
      amount_delta = -p_amount,
      kind = 'sold_partner',
      event_date = p_sold_on,
      note = 'Продан партнёру: ' || coalesce(v_partner_name, 'партнёр')
    where id = v_adjustment.id;
  elsif p_from_tech_id is not null then
    insert into public.inventory_adjustments (
      tech_id, chemical_id, amount_delta, kind, event_date, note, created_by, chemical_sale_id
    ) values (
      p_from_tech_id, p_chemical_id, -p_amount, 'sold_partner', p_sold_on,
      'Продан партнёру: ' || coalesce(v_partner_name, 'партнёр'), auth.uid(), p_sale_id
    );
  end if;

  return p_sale_id;
end
$function$;

revoke all on function public.save_chemical_sale_atomic(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text) from public, anon;
grant execute on function public.save_chemical_sale_atomic(uuid, uuid, uuid, uuid, uuid, numeric, numeric, date, text) to authenticated, service_role;

drop trigger if exists kd_closed_period_chemical_sales on public.chemical_sales;
create trigger kd_closed_period_chemical_sales
  before insert or update or delete on public.chemical_sales
  for each row execute function public.kd_enforce_open_period('sold_on', 'created_at');

-- Старые вкладки должны получить безопасную ошибку вместо частично записанной продажи.
revoke insert, update, delete on public.chemical_sales from authenticated;

notify pgrst, 'reload schema';
commit;

-- Проверка после применения:
-- select routine_name, security_type from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'save_chemical_sale_atomic';
