begin;
create table public.payroll_carryovers (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 payment_id uuid not null references public.tech_expenses(id), tech_id uuid not null references auth.users(id),
 from_month text not null, to_month text not null, amount numeric(16,2) not null check(amount>0),
 reason text not null check(length(btrim(reason)) between 1 and 2000),
 created_at timestamptz not null default now(), created_by uuid not null default auth.uid(),
 check(from_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and to_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and to_month>from_month)
);
alter table public.payroll_carryovers enable row level security;
create policy carryover_read on public.payroll_carryovers for select to authenticated using(public.kd_has_permission('tab.payroll') or tech_id=auth.uid());
grant select on public.payroll_carryovers to authenticated;
create or replace function public.carry_payroll_overpayment(p_request_id uuid,p_payment_id uuid,p_to_month text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_payment public.tech_expenses%rowtype; v_previous public.payroll_carryovers%rowtype; v_id uuid; v_total numeric;
begin
 if not coalesce(public.kd_has_permission('action.finance_edit'),false) then raise exception 'Нет прав на зарплату' using errcode='42501'; end if;
 if p_request_id is null or p_payment_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or nullif(btrim(p_reason),'') is null then raise exception 'Проверьте сумму и основание'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payroll_carryover:'||p_request_id::text,0));
 select * into v_previous from public.payroll_carryovers where request_id=p_request_id;
 if found then
  if v_previous.payment_id is distinct from p_payment_id or v_previous.to_month is distinct from p_to_month or v_previous.amount is distinct from p_amount or v_previous.reason is distinct from btrim(p_reason) then raise exception 'Запрос уже проведён с другими данными'; end if;
  return v_previous.id;
 end if;
 if p_to_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or p_to_month is null then raise exception 'Укажите месяц переноса'; end if;
 if (p_to_month||'-01')::date <= public.kd_books_closed_until() then raise exception 'Месяц назначения закрыт'; end if;
 select * into v_payment from public.tech_expenses where id=p_payment_id for update;
 if not found or v_payment.status<>'paid' or v_payment.tech_id is null then raise exception 'Нужна проведённая выплата сотруднику'; end if;
 select coalesce(sum(amount),0) into v_total from public.payroll_carryovers where payment_id=p_payment_id;
 if v_total+p_amount>v_payment.amount then raise exception 'Перенос превышает сумму исходной выплаты с учётом прошлых переносов'; end if;
 insert into public.payroll_carryovers(request_id,payment_id,tech_id,from_month,to_month,amount,reason)
 values(p_request_id,p_payment_id,v_payment.tech_id,to_char(v_payment.expense_date,'YYYY-MM'),p_to_month,p_amount,btrim(p_reason)) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.carry_payroll_overpayment(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.carry_payroll_overpayment(uuid,uuid,text,numeric,text) to authenticated;
-- Keep the source payment immutable once its overpayment has been carried.
create or replace function public.kd_guard_carried_payment() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.payroll_carryovers where payment_id=old.id) then
  if tg_op='DELETE' then raise exception 'У выплаты есть перенос переплаты'; end if;
  if (new.amount,new.tech_id,new.expense_date,new.status) is distinct from (old.amount,old.tech_id,old.expense_date,old.status) then raise exception 'У выплаты есть перенос переплаты'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger payroll_carried_payment_guard before update or delete on public.tech_expenses for each row execute function public.kd_guard_carried_payment();
revoke all on function public.kd_guard_carried_payment() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
