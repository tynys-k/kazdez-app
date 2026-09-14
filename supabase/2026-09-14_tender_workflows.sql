begin;
alter table public.tenders add column if not exists responsible_ids uuid[] not null default '{}';
alter table public.tenders add column if not exists customer_contacts jsonb not null default '[]' check(jsonb_typeof(customer_contacts)='array');
-- Do not invent a creation date for historical records.
alter table public.tenders add column if not exists created_at timestamptz;
alter table public.tenders alter column created_at set default now();
alter table public.tenders add column if not exists created_by uuid;
alter table public.tenders alter column created_by set default auth.uid();
create table public.tender_payments(
 id uuid primary key default gen_random_uuid(),tender_id uuid not null references public.tenders(id),move_id uuid not null unique references public.money_moves(id),
 partner_id uuid references public.partners(id),guarantee_id uuid references public.tender_guarantees(id),kind text not null check(kind in ('customer_payment','supplier_payment','partner_dumping_in','partner_dumping_out','partner_bank_in','partner_bank_out')),
 amount numeric not null check(amount>0),paid_on date not null,note text not null,created_at timestamptz not null default now(),created_by uuid not null default auth.uid()
);
alter table public.tender_payments enable row level security;
create policy tender_payments_read on public.tender_payments for select to authenticated using(public.kd_has_permission('tab.tenders') or public.kd_has_permission('tab.partners'));
grant select on public.tender_payments to authenticated;
create or replace function public.link_tender_payment(p_tender_id uuid,p_move_id uuid,p_kind text,p_guarantee_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.tenders%rowtype; m public.money_moves%rowtype; e public.tender_payments%rowtype; v_id uuid; v_balance numeric; v_prefix text;
begin
 if not coalesce(public.kd_has_permission('action.finance_edit'),false) then raise exception 'Нет доступа к платежам' using errcode='42501'; end if;
 if nullif(btrim(p_note),'') is null then raise exception 'Укажите основание'; end if;
 select * into t from public.tenders where id=p_tender_id for update;
 if not found then raise exception 'Тендер не найден'; end if;
 select * into m from public.money_moves where id=p_move_id for update;
 if not found or m.amount<=0 then raise exception 'Нужно проведённое движение по счёту'; end if;
 select * into e from public.tender_payments where move_id=p_move_id;
 if found then
  if e.tender_id is distinct from p_tender_id or e.kind is distinct from p_kind or e.guarantee_id is distinct from p_guarantee_id or e.note is distinct from btrim(p_note) then raise exception 'Движение уже привязано'; end if;
  return e.id;
 end if;
 if m.direction is distinct from (case when p_kind in ('customer_payment','partner_dumping_in','partner_bank_in') then 'income' else 'expense' end) then raise exception 'Направление платежа не соответствует назначению'; end if;
 if p_kind like 'partner_%' then
  if t.partner_id is null or not exists(select 1 from public.tender_guarantees where id=p_guarantee_id and tender_id=p_tender_id) then raise exception 'Нужен партнёр и обеспечение этого тендера'; end if;
  if p_kind like '%_out' then
   v_prefix:=replace(p_kind,'_out','');
   select coalesce(sum(case when kind=v_prefix||'_in' then amount else -amount end),0) into v_balance from public.tender_payments where tender_id=p_tender_id and guarantee_id=p_guarantee_id and kind in (v_prefix||'_in',v_prefix||'_out');
   if m.amount>v_balance then raise exception 'Возврат превышает полученное обеспечение партнёра'; end if;
  end if;
 end if;
 insert into public.tender_payments(tender_id,move_id,partner_id,guarantee_id,kind,amount,paid_on,note) values(p_tender_id,p_move_id,t.partner_id,p_guarantee_id,p_kind,m.amount,m.move_date,btrim(p_note)) returning id into v_id;
 insert into public.entity_activity(entity_kind,entity_id,event_type,body) values('tender',p_tender_id::text,'change','Привязан платёж: '||p_kind||' · '||m.amount::text||' ₸ · '||btrim(p_note));
 return v_id;
end $$;
revoke all on function public.link_tender_payment(uuid,uuid,text,uuid,text) from public,anon;
grant execute on function public.link_tender_payment(uuid,uuid,text,uuid,text) to authenticated;
create or replace function public.kd_guard_tender_payment_move() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.tender_payments where move_id=old.id) then
  if tg_op='DELETE' then raise exception 'Движение связано с тендером'; end if;
  if (new.amount,new.direction,new.move_date) is distinct from (old.amount,old.direction,old.move_date) then raise exception 'Движение связано с тендером'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger tender_payment_move_guard before update or delete on public.money_moves for each row execute function public.kd_guard_tender_payment_move();
revoke all on function public.kd_guard_tender_payment_move() from public,anon,authenticated;
create or replace function public.kd_guard_tender_identity() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then new.created_at:=now(); new.created_by:=auth.uid();
 else
  new.created_at:=old.created_at; new.created_by:=old.created_by;
  if new.partner_id is distinct from old.partner_id and exists(select 1 from public.tender_payments where tender_id=old.id and kind like 'partner_%') then raise exception 'У тендера есть расчёты с партнёром. Нельзя заменить партнёра задним числом'; end if;
 end if;
 return new;
end $$;
create trigger tender_identity_guard before insert or update on public.tenders for each row execute function public.kd_guard_tender_identity();
revoke all on function public.kd_guard_tender_identity() from public,anon,authenticated;
create or replace function public.kd_tender_child_history() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row jsonb; v_before jsonb; v_body text;
begin
 v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_before:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
 v_body:=case when tg_table_name='tender_guarantees' then 'Обеспечение' else 'Работа по тендеру' end||case when tg_op='INSERT' then ': добавлено' when tg_op='DELETE' then ': удалено' else ': изменено' end;
 insert into public.entity_activity(entity_kind,entity_id,event_type,body,details) values('tender',v_row->>'tender_id','change',v_body,jsonb_build_object('before',v_before,'after',case when tg_op='DELETE' then '{}'::jsonb else v_row end));
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger tender_guarantee_history after insert or update or delete on public.tender_guarantees for each row execute function public.kd_tender_child_history();
create trigger tender_service_history after insert or update or delete on public.tender_services for each row execute function public.kd_tender_child_history();
revoke all on function public.kd_tender_child_history() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
