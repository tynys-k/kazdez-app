-- After multiwarehouse. New employee counts are checkpoints at an instant,
-- not the end of a day. Historical checkpoints retain their old semantics.
begin;
alter table public.inventory_adjustments add column if not exists cutoff_at timestamptz;
alter table public.inventory_adjustments add column if not exists request_id uuid;
alter table public.inventory_adjustments add column if not exists request_payload jsonb;
create unique index inventory_request_kind on public.inventory_adjustments(request_id,kind) where request_id is not null;
create or replace function public.kd_employee_chemical_balance(p_tech uuid,p_chem uuid) returns numeric language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.inventory_adjustments%rowtype; v_in numeric; v_used numeric; v_adj numeric;
begin
 select * into r from public.inventory_adjustments where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and kind='revision' order by created_at desc,id desc limit 1;
 select coalesce(sum(amount),0) into v_in from public.handouts where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and
  (r.id is null or case when r.cutoff_at is not null then created_at>r.cutoff_at else created_at::date>r.event_date end);
 select coalesce(sum(coalesce(nullif(to_jsonb(c)->>'amount','')::numeric,nullif(to_jsonb(c)->>'ml','')::numeric,0)),0) into v_used
 from public.report_chemicals c join public.jobs j on j.id::text=c.job_id::text where j.assigned_to=p_tech and c.chemical_id::text=p_chem::text and
  (r.id is null or case when r.cutoff_at is not null then coalesce(j.reported_at,j.scheduled_date::timestamptz)>r.cutoff_at else j.scheduled_date>r.event_date end);
 select coalesce(sum(amount_delta),0) into v_adj from public.inventory_adjustments where tech_id::text=p_tech::text and chemical_id::text=p_chem::text and (r.id is null or created_at>r.created_at);
 return coalesce(r.balance_after,0)+v_in-v_used+v_adj;
end $$;
create or replace function public.post_employee_stock_operation(p_request_id uuid,p_tech uuid,p_chemical uuid,p_kind text,p_amount numeric,p_target uuid,p_event_date date,p_reason text,p_note text,p_expected numeric)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old public.inventory_adjustments%rowtype; v_payload jsonb; v_before numeric; v_target_before numeric; v_delta numeric; v_id uuid; v_now timestamptz;
begin
 if not coalesce(public.kd_has_permission('action.stock_edit'),false) then raise exception 'Нет доступа к остаткам сотрудников' using errcode='42501'; end if;
 if p_request_id is null or p_kind is null or p_kind not in ('revision','transfer','correction_in','correction_out') or p_amount is null or p_amount<0 or (p_kind<>'revision' and p_amount=0) or nullif(btrim(p_reason),'') is null then raise exception 'Проверьте операцию, количество и причину'; end if;
 v_payload:=jsonb_build_object('tech',p_tech,'chemical',p_chemical,'kind',p_kind,'amount',p_amount,'target',p_target,'date',p_event_date,'reason',btrim(p_reason),'note',p_note,'expected',p_expected);
 perform pg_advisory_xact_lock(hashtextextended('employee_stock:'||p_request_id::text,0));
 select * into v_old from public.inventory_adjustments where request_id=p_request_id and kind<>'transfer_in';
 if found then
  if v_old.request_payload is distinct from v_payload then raise exception 'Запрос уже проведён с другими данными'; end if;
  return v_old.id;
 end if;
 if p_event_date is null or p_event_date>(now() at time zone 'Asia/Almaty')::date or p_event_date<=public.kd_books_closed_until() then raise exception 'Выберите дату в открытом периоде, не в будущем'; end if;
 if p_kind='revision' and p_event_date<>(now() at time zone 'Asia/Almaty')::date then raise exception 'Ревизия фиксирует фактический остаток сейчас. Для старого документа используйте корректировку'; end if;
 perform 1 from public.chemicals where id=p_chemical for update;
 if not found then raise exception 'Препарат не найден'; end if;
 if not exists(select 1 from public.profiles where id=p_tech) then raise exception 'Сотрудник не найден'; end if;
 v_before:=public.kd_employee_chemical_balance(p_tech,p_chemical);
 if p_expected is null or abs(v_before-p_expected)>0.000001 then raise exception 'Остаток изменился. Обновите карточку и повторите операцию'; end if;
 if p_kind in ('transfer','correction_out') and p_amount>v_before then raise exception 'Недостаточно препарата у сотрудника'; end if;
 v_now:=clock_timestamp();
 v_delta:=case when p_kind='revision' then p_amount-v_before when p_kind='correction_in' then p_amount else -p_amount end;
 if p_kind='transfer' then
  if p_target is null or p_target=p_tech or not exists(select 1 from public.profiles where id=p_target and coalesce(is_active,true)) then raise exception 'Выберите другого действующего сотрудника'; end if;
  v_target_before:=public.kd_employee_chemical_balance(p_target,p_chemical);
 end if;
 insert into public.inventory_adjustments(tech_id,chemical_id,kind,amount_delta,balance_before,balance_after,event_date,reason,note,created_by,created_at,cutoff_at,request_id,request_payload,counterparty_tech_id,transfer_group)
 values(p_tech,p_chemical,case when p_kind='transfer' then 'transfer_out' else p_kind end,v_delta,v_before,v_before+v_delta,p_event_date,btrim(p_reason),p_note,auth.uid(),v_now,case when p_kind='revision' then v_now else null end,p_request_id,v_payload,case when p_kind='transfer' then p_target else null end,case when p_kind='transfer' then p_request_id else null end) returning id into v_id;
 if p_kind='transfer' then
  insert into public.inventory_adjustments(tech_id,chemical_id,kind,amount_delta,balance_before,balance_after,event_date,reason,note,created_by,created_at,request_id,request_payload,counterparty_tech_id,transfer_group)
  values(p_target,p_chemical,'transfer_in',p_amount,v_target_before,v_target_before+p_amount,p_event_date,btrim(p_reason),p_note,auth.uid(),v_now,p_request_id,v_payload,p_tech,p_request_id);
 else
  -- A recount changes total stock, not an unrelated physical warehouse.
  insert into public.warehouse_moves(request_id,item_kind,item_id,kind,amount,inventory_delta,tech_id,note)
  values(p_request_id,'chemical',p_chemical,'revision',0,v_delta,p_tech,'Ревизия / корректировка у сотрудника: '||btrim(p_reason));
 end if;
 return v_id;
end $$;
revoke insert,update,delete on public.inventory_adjustments from authenticated;
revoke all on function public.post_employee_stock_operation(uuid,uuid,uuid,text,numeric,uuid,date,text,text,numeric) from public,anon;
grant execute on function public.post_employee_stock_operation(uuid,uuid,uuid,text,numeric,uuid,date,text,text,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
