begin;
create table public.suppliers(id uuid primary key default gen_random_uuid(),name text not null check(length(btrim(name))>0),contact_name text,phone text,address text,note text,created_at timestamptz not null default now());
create table public.supplier_offers(id uuid primary key default gen_random_uuid(),supplier_id uuid not null references public.suppliers(id),item_kind text not null check(item_kind in ('chemical','equipment')),item_id uuid not null,price numeric(16,2) not null check(price>0),quoted_on date not null,valid_until date,delivery_days integer check(delivery_days>=0),available boolean not null default true,note text,created_at timestamptz not null default now(),check(valid_until is null or valid_until>=quoted_on));
create table public.stock_warehouses(id uuid primary key default gen_random_uuid(),name text not null unique check(length(btrim(name))>0),address text,unallocated boolean not null default false,created_at timestamptz not null default now());
create unique index stock_one_unallocated on public.stock_warehouses(unallocated) where unallocated;
insert into public.stock_warehouses(id,name,unallocated) values('00000000-0000-4000-8000-000000000001','Не распределено (старый учёт)',true);
insert into public.stock_warehouses(name) values('Байзакова'),('Мамыр-4');
create table public.warehouse_moves(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,item_kind text not null check(item_kind in ('chemical','equipment')),item_id uuid not null,
 kind text not null check(kind in ('transfer','revision','issue','receipt','return','delivery')),from_warehouse_id uuid references public.stock_warehouses(id),to_warehouse_id uuid references public.stock_warehouses(id),
 amount numeric not null,inventory_delta numeric not null default 0,tech_id uuid references auth.users(id),note text not null,
 created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),payload jsonb not null default '{}'
);
alter table public.equipment_handouts add column if not exists warehouse_id uuid references public.stock_warehouses(id);
alter table public.chemical_purchases add column if not exists warehouse_id uuid references public.stock_warehouses(id);
alter table public.handouts add column if not exists warehouse_id uuid references public.stock_warehouses(id);
do $$ declare t text; begin
 foreach t in array array['suppliers','supplier_offers','stock_warehouses','warehouse_moves'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy stock_read on public.%I for select to authenticated using(public.kd_has_permission(''tab.stock'') or public.kd_has_permission(''action.stock_edit''))',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy suppliers_insert on public.suppliers for insert to authenticated with check(public.kd_has_permission('action.stock_edit'));
create policy suppliers_update on public.suppliers for update to authenticated using(public.kd_has_permission('action.stock_edit')) with check(public.kd_has_permission('action.stock_edit'));
grant insert(name,contact_name,phone,address,note),update(name,contact_name,phone,address,note) on public.suppliers to authenticated;
create policy offers_insert on public.supplier_offers for insert to authenticated with check(public.kd_has_permission('action.stock_edit'));
grant insert(supplier_id,item_kind,item_id,price,quoted_on,valid_until,delivery_days,available,note) on public.supplier_offers to authenticated;
create policy warehouses_insert on public.stock_warehouses for insert to authenticated with check(public.kd_has_permission('action.stock_edit') and not unallocated);
grant insert(name,address) on public.stock_warehouses to authenticated;

create or replace function public.kd_employee_chemical_balance(p_tech uuid,p_chem uuid) returns numeric language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.inventory_adjustments%rowtype; v_in numeric; v_used numeric; v_adj numeric;
begin
 select * into r from public.inventory_adjustments where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and kind='revision' order by created_at desc limit 1;
 select coalesce(sum(amount),0) into v_in from public.handouts where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and (r.id is null or created_at::date>r.event_date);
 select coalesce(sum(coalesce(nullif(to_jsonb(c)->>'amount','')::numeric,nullif(to_jsonb(c)->>'ml','')::numeric,0)),0) into v_used
 from public.report_chemicals c join public.jobs j on j.id::text=c.job_id::text where j.assigned_to=p_tech and c.chemical_id::text=p_chem::text and (r.id is null or j.scheduled_date>r.event_date);
 select coalesce(sum(amount_delta),0) into v_adj from public.inventory_adjustments where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and (r.id is null or created_at>r.created_at);
 return coalesce(r.balance_after,0)+v_in-v_used+v_adj;
end $$;

create or replace function public.kd_warehouse_balance(p_kind text,p_item uuid,p_warehouse uuid) returns numeric language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v_unallocated boolean; v_total numeric; v_used numeric; v_staff numeric; v_physical numeric; v_delta numeric; v_name text;
begin
 select unallocated into v_unallocated from public.stock_warehouses where id=p_warehouse;
 if not found then raise exception 'Склад не найден'; end if;
 if not v_unallocated or p_kind='equipment' then
  return (select coalesce(sum(case when to_warehouse_id=p_warehouse then amount else 0 end-case when from_warehouse_id=p_warehouse then amount else 0 end),0) from public.warehouse_moves where item_kind=p_kind and item_id=p_item);
 end if;
 select coalesce(purchased_ml,0),name into v_total,v_name from public.chemicals where id=p_item;
 select coalesce(sum(coalesce(nullif(to_jsonb(c)->>'amount','')::numeric,nullif(to_jsonb(c)->>'ml','')::numeric,0)),0) into v_used from public.report_chemicals c
 where c.chemical_id::text=p_item::text or (c.chemical_id is null and lower(btrim(c.name))=lower(btrim(v_name)));
 v_total:=v_total-v_used-(select coalesce(sum(amount),0) from public.chemical_sales where chemical_id::text=p_item::text);
 select coalesce(sum(public.kd_employee_chemical_balance(p.id,p_item)),0) into v_staff from public.profiles p;
 select coalesce(sum(inventory_delta),0) into v_delta from public.warehouse_moves where item_kind='chemical' and item_id=p_item;
 select coalesce(sum(case when w.to_warehouse_id in(select id from public.stock_warehouses where not unallocated) then w.amount else 0 end-case when w.from_warehouse_id in(select id from public.stock_warehouses where not unallocated) then w.amount else 0 end),0) into v_physical from public.warehouse_moves w where item_kind='chemical' and item_id=p_item;
 return coalesce(v_total,0)+v_delta-v_staff-v_physical;
end $$;
revoke all on function public.kd_employee_chemical_balance(uuid,uuid),public.kd_warehouse_balance(text,uuid,uuid) from public,anon,authenticated;

create or replace function public.post_warehouse_operation(p_request_id uuid,p_kind text,p_item_kind text,p_item_id uuid,p_from uuid,p_to uuid,p_tech uuid,p_amount numeric,p_note text,p_expected numeric default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_old public.warehouse_moves%rowtype; v_payload jsonb; v_before numeric; v_amount numeric:=p_amount; v_delta numeric:=0; v_unallocated uuid; v_actual_to uuid:=p_to; v_actual_from uuid:=p_from;
begin
 if not coalesce(public.kd_has_permission('action.stock_edit'),false) then raise exception 'Нет доступа к складским операциям' using errcode='42501'; end if;
 if p_request_id is null or p_amount is null or p_amount<0 or p_kind not in ('transfer','revision','issue','receipt','delivery') or p_item_kind not in ('chemical','equipment') or nullif(btrim(p_note),'') is null then raise exception 'Проверьте операцию, количество и основание'; end if;
 if current_date<=public.kd_books_closed_until() then raise exception 'Сегодняшний период закрыт'; end if;
 v_payload:=jsonb_build_object('kind',p_kind,'item_kind',p_item_kind,'item_id',p_item_id,'from',p_from,'to',p_to,'tech',p_tech,'amount',p_amount,'note',btrim(p_note),'expected',p_expected);
 perform pg_advisory_xact_lock(hashtextextended('warehouse_request:'||p_request_id::text,0));
 select * into v_old from public.warehouse_moves where request_id=p_request_id;
 if found then if v_old.payload<>v_payload then raise exception 'Операция уже проведена с другими данными'; end if; return v_old.id; end if;
 if p_item_kind='chemical' then perform 1 from public.chemicals where id=p_item_id for update; else perform 1 from public.equipment where id=p_item_id for update; end if;
 if not found then raise exception 'Позиция не найдена'; end if;
 select id into v_unallocated from public.stock_warehouses where unallocated;
 if p_kind='receipt' then
  if p_item_kind<>'equipment' then raise exception 'Приход препарата оформляется через закупку'; end if;
  if p_to is null or p_amount<=0 then raise exception 'Укажите склад и количество прихода'; end if;
  v_actual_from:=null;
 elsif p_kind='revision' then
  v_before:=public.kd_warehouse_balance(p_item_kind,p_item_id,p_to);
  if p_expected is null or v_before<>p_expected then raise exception 'Остаток изменился. Обновите склад и повторите ревизию'; end if;
  v_amount:=p_amount-v_before; v_delta:=v_amount; v_actual_from:=null;
 else
  if p_from is null or p_amount<=0 then raise exception 'Укажите склад списания и количество'; end if;
  v_before:=public.kd_warehouse_balance(p_item_kind,p_item_id,p_from);
  if v_before<p_amount then raise exception 'Недостаточно остатка на выбранном складе. Сначала проверьте учёт или проведите ревизию'; end if;
  if p_kind='transfer' and (p_to is null or p_from=p_to) then raise exception 'Выберите другой склад'; end if;
  if p_kind='delivery' then v_actual_to:=null; if p_item_kind='chemical' then v_delta:=-p_amount; end if; end if;
  if p_kind='issue' then
   if not exists(select 1 from public.profiles where id=p_tech) then raise exception 'Выберите сотрудника'; end if;
   if p_item_kind='chemical' then
    insert into public.handouts(tech_id,chemical_id,amount,kind,note,created_by,warehouse_id) values(p_tech,p_item_id,p_amount,'issue',btrim(p_note),auth.uid(),p_from);
    v_actual_to:=v_unallocated;
   else
    insert into public.equipment_handouts(tech_id,equipment_id,qty,handout_date,status,note,created_by,warehouse_id) values(p_tech,p_item_id,p_amount,current_date,'with_tech',btrim(p_note),auth.uid(),p_from);
    v_actual_to:=null;
   end if;
  end if;
 end if;
 insert into public.warehouse_moves(request_id,item_kind,item_id,kind,from_warehouse_id,to_warehouse_id,amount,inventory_delta,tech_id,note,payload)
 values(p_request_id,p_item_kind,p_item_id,p_kind,v_actual_from,v_actual_to,v_amount,v_delta,p_tech,btrim(p_note),v_payload) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.post_warehouse_operation(uuid,text,text,uuid,uuid,uuid,uuid,numeric,text,numeric) from public,anon;
grant execute on function public.post_warehouse_operation(uuid,text,text,uuid,uuid,uuid,uuid,numeric,text,numeric) to authenticated;

create or replace function public.post_located_purchase(p_request_id uuid,p_chemical_id uuid,p_amount numeric,p_price_per_liter numeric,p_purchase_date date,p_supplier text,p_batch_no text,p_expires_on date,p_warehouse_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid; v_existing uuid; v_unallocated boolean;
begin
 if not coalesce(public.kd_has_permission('action.stock_edit'),false) then raise exception 'Нет доступа к приходу' using errcode='42501'; end if;
 select unallocated into v_unallocated from public.stock_warehouses where id=p_warehouse_id;
 if not found then raise exception 'Выберите склад'; end if;
 perform pg_advisory_xact_lock(hashtextextended('chemical_purchase_request:'||p_request_id::text,0));
 select warehouse_id into v_existing from public.chemical_purchases where request_id=p_request_id;
 if found and v_existing is distinct from p_warehouse_id then raise exception 'Запрос прихода уже относится к другому складу'; end if;
 v_id:=public.post_chemical_purchase_atomic(p_request_id,p_chemical_id,p_amount,p_price_per_liter,p_purchase_date,p_supplier,p_batch_no,p_expires_on);
 update public.chemical_purchases set warehouse_id=p_warehouse_id where id=v_id;
 if not v_unallocated then
  insert into public.warehouse_moves(request_id,item_kind,item_id,kind,to_warehouse_id,amount,note) values(p_request_id,'chemical',p_chemical_id,'receipt',p_warehouse_id,p_amount,'Приход: '||coalesce(p_supplier,'поставщик не указан')) on conflict(request_id) do nothing;
 end if;
 return v_id;
end $$;
revoke all on function public.post_located_purchase(uuid,uuid,numeric,numeric,date,text,text,date,uuid) from public,anon;
grant execute on function public.post_located_purchase(uuid,uuid,numeric,numeric,date,text,text,date,uuid) to authenticated;

create or replace function public.kd_equipment_warehouse_return() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_target uuid;
begin
 if old.status='returned' and new.status is distinct from old.status then raise exception 'Возврат уже проведён. Оформите новую выдачу со склада'; end if;
 if (new.equipment_id,new.qty,new.warehouse_id) is distinct from (old.equipment_id,old.qty,old.warehouse_id) then raise exception 'Выданное имущество нельзя заменить или изменить задним числом'; end if;
 if new.status='returned' and old.status='with_tech' then
  select coalesce(new.warehouse_id,(select id from public.stock_warehouses where unallocated)) into v_target;
  insert into public.warehouse_moves(request_id,item_kind,item_id,kind,to_warehouse_id,amount,tech_id,note) values(gen_random_uuid(),'equipment',new.equipment_id,'return',v_target,new.qty,new.tech_id,'Возврат от сотрудника');
 end if;
 return new;
end $$;
create trigger equipment_warehouse_return after update on public.equipment_handouts for each row execute function public.kd_equipment_warehouse_return();
revoke all on function public.kd_equipment_warehouse_return() from public,anon,authenticated;
create or replace function public.kd_supplier_offer_item() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.item_kind='chemical' then perform 1 from public.chemicals where id=new.item_id; else perform 1 from public.equipment where id=new.item_id; end if;
 if not found then raise exception 'Позиция предложения не найдена'; end if;
 return new;
end $$;
create trigger supplier_offer_item before insert on public.supplier_offers for each row execute function public.kd_supplier_offer_item();
revoke all on function public.kd_supplier_offer_item() from public,anon,authenticated;
create or replace function public.transfer_equipment_atomic(
  p_handout_id uuid,
  p_new_tech_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_source public.equipment_handouts%rowtype;
  v_existing public.equipment_handouts%rowtype;
  v_new_id uuid;
  v_source_name text;
  v_note text;
begin
  if not (coalesce(public.kd_account_active(), false) and (
    public.is_admin() or public.kd_has_permission('action.stock_edit')
  )) then
    raise exception using errcode = '42501', message = 'Недостаточно прав для передачи оборудования';
  end if;
  if p_handout_id is null or p_new_tech_id is null then
    raise exception using errcode = '22004', message = 'Оборудование и новый сотрудник обязательны';
  end if;
  v_note := nullif(btrim(p_note), '');
  if length(coalesce(v_note, '')) > 2000 then
    raise exception using errcode = '22023', message = 'Комментарий слишком длинный';
  end if;

  select * into v_source
    from public.equipment_handouts
   where id = p_handout_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Выдача оборудования не найдена';
  end if;

  select * into v_existing
    from public.equipment_handouts
   where transfer_source_id = p_handout_id
   limit 1;
  if found then
    if v_existing.tech_id = p_new_tech_id then
      return v_existing.id;
    end if;
    raise exception using errcode = '23505', message = 'Оборудование уже передано другому сотруднику';
  end if;

  if v_source.status <> 'with_tech' then
    raise exception using errcode = '22023', message = 'Передать можно только оборудование, которое сейчас у сотрудника';
  end if;
  if v_source.tech_id = p_new_tech_id then
    raise exception using errcode = '22023', message = 'Выберите другого сотрудника';
  end if;
  if coalesce(v_source.qty, 0) <= 0 then
    raise exception using errcode = '22023', message = 'Количество оборудования должно быть больше нуля';
  end if;
  if not exists (
    select 1 from public.profiles
     where id = p_new_tech_id and coalesce(is_active, true)
  ) then
    raise exception using errcode = '22023', message = 'Новый сотрудник не найден или отключён';
  end if;

  select full_name into v_source_name
    from public.profiles
   where id = v_source.tech_id;

  insert into public.equipment_handouts (
    tech_id, equipment_id, qty, handout_date, status, note,
    created_by, transfer_source_id, warehouse_id
  ) values (
    p_new_tech_id, v_source.equipment_id, v_source.qty, current_date, 'with_tech',
    concat('Передано от ', coalesce(nullif(btrim(v_source_name), ''), '?'),
      case when v_note is not null then ' — ' || v_note else '' end),
    auth.uid(), p_handout_id, v_source.warehouse_id
  ) returning id into v_new_id;

  update public.equipment_handouts
     set status = 'transferred',
         note = coalesce(v_note, note)
   where id = p_handout_id;

  return v_new_id;
end
$function$;
notify pgrst,'reload schema';
commit;
