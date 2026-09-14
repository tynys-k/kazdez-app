begin;
create table public.tender_deliveries(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,tender_id uuid not null references public.tenders(id),
 chemical_id uuid not null references public.chemicals(id),warehouse_id uuid not null references public.stock_warehouses(id),move_id uuid not null unique references public.warehouse_moves(id),
 chemical_name text not null,unit_kind text not null,amount numeric not null check(amount>0),note text not null,created_at timestamptz not null default now(),created_by uuid not null default auth.uid()
);
alter table public.tender_deliveries enable row level security;
create policy tender_deliveries_read on public.tender_deliveries for select to authenticated using(public.kd_has_permission('tab.tenders') or public.kd_has_permission('tab.stock'));
grant select on public.tender_deliveries to authenticated;
create or replace function public.deliver_tender_chemical(p_request_id uuid,p_tender_id uuid,p_chemical_id uuid,p_warehouse_id uuid,p_amount numeric,p_note text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_existing public.tender_deliveries%rowtype; v_chemical public.chemicals%rowtype; v_move uuid; v_id uuid;
begin
 if not coalesce(public.kd_has_permission('action.stock_edit'),false) or not coalesce(public.kd_has_permission('tab.tenders'),false) then raise exception 'Нет доступа к передаче препаратов в тендере' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Нужен идентификатор операции'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tender_delivery:'||p_request_id::text,0));
 select * into v_existing from public.tender_deliveries where request_id=p_request_id;
 if found then
  if (v_existing.tender_id,v_existing.chemical_id,v_existing.warehouse_id,v_existing.amount,v_existing.note) is distinct from (p_tender_id,p_chemical_id,p_warehouse_id,p_amount,btrim(p_note)) then raise exception 'Передача уже проведена с другими данными'; end if;
  return v_existing.id;
 end if;
 perform 1 from public.tenders where id=p_tender_id;
 if not found then raise exception 'Тендер не найден'; end if;
 select * into v_chemical from public.chemicals where id=p_chemical_id;
 if not found then raise exception 'Препарат не найден'; end if;
 v_move:=public.post_warehouse_operation(p_request_id,'delivery','chemical',p_chemical_id,p_warehouse_id,null,null,p_amount,'Тендер '||p_tender_id::text||': '||p_note,null);
 insert into public.tender_deliveries(request_id,tender_id,chemical_id,warehouse_id,move_id,chemical_name,unit_kind,amount,note) values(p_request_id,p_tender_id,p_chemical_id,p_warehouse_id,v_move,v_chemical.name,v_chemical.unit_kind,p_amount,btrim(p_note)) returning id into v_id;
 insert into public.entity_activity(entity_kind,entity_id,event_type,body) values('tender',p_tender_id::text,'change','Передан препарат: '||v_chemical.name||' · '||p_amount::text||' базовых единиц · '||btrim(p_note));
 return v_id;
end $$;
revoke all on function public.deliver_tender_chemical(uuid,uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.deliver_tender_chemical(uuid,uuid,uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
commit;
