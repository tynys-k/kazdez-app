begin;

create table public.personal_debts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  direction text not null check (direction in ('receivable', 'payable')),
  counterparty_name text not null check (length(btrim(counterparty_name)) > 0),
  counterparty_phone text,
  due_on date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

create table public.personal_debt_events (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references public.personal_debts(id),
  request_id uuid not null unique,
  kind text not null check (kind in ('principal', 'repayment')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  account_id uuid not null references public.accounts(id),
  move_id uuid not null unique references public.money_moves(id),
  actual_counterparty_name text not null check (length(btrim(actual_counterparty_name)) > 0),
  actual_counterparty_details text,
  bank_reference text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

create index personal_debt_events_thread_idx on public.personal_debt_events(debt_id, occurred_on, created_at);
alter table public.personal_debts enable row level security;
alter table public.personal_debt_events enable row level security;
create policy personal_debts_read on public.personal_debts for select to authenticated
  using (public.kd_has_permission('action.finance_edit'));
create policy personal_debt_events_read on public.personal_debt_events for select to authenticated
  using (public.kd_has_permission('action.finance_edit'));
grant select on public.personal_debts, public.personal_debt_events to authenticated;

create function public.create_personal_debt(p_request_id uuid, p_direction text, p_name text, p_phone text default null, p_due_on date default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_id uuid; v_existing public.personal_debts%rowtype;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'), false) then
    raise exception 'Нет доступа к финансам' using errcode = '42501';
  end if;
  if p_request_id is null or p_direction not in ('receivable', 'payable') or nullif(btrim(p_name), '') is null then
    raise exception 'Укажите направление и имя контрагента';
  end if;
  select * into v_existing from public.personal_debts where request_id = p_request_id;
  if found then
    if (v_existing.direction, v_existing.counterparty_name, v_existing.counterparty_phone, v_existing.due_on, v_existing.note)
       is distinct from (p_direction, btrim(p_name), nullif(btrim(p_phone), ''), p_due_on, nullif(btrim(p_note), '')) then
      raise exception 'Номер операции уже использован для другого контрагента';
    end if;
    return v_existing.id;
  end if;
  insert into public.personal_debts(request_id, direction, counterparty_name, counterparty_phone, due_on, note, created_by)
  values(p_request_id, p_direction, btrim(p_name), nullif(btrim(p_phone), ''), p_due_on, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.post_personal_debt_event(
  p_request_id uuid, p_debt_id uuid, p_kind text, p_amount numeric, p_occurred_on date,
  p_account_id uuid, p_actual_name text, p_actual_details text default null,
  p_bank_reference text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_debt public.personal_debts%rowtype; v_existing public.personal_debt_events%rowtype;
        v_balance numeric; v_move_id uuid; v_event_id uuid; v_direction text; v_label text;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'), false) then
    raise exception 'Нет доступа к финансам' using errcode = '42501';
  end if;
  if p_request_id is null or p_kind not in ('principal', 'repayment') or p_amount is null or p_amount <= 0
     or p_occurred_on is null or p_account_id is null or nullif(btrim(p_actual_name), '') is null then
    raise exception 'Заполните вид операции, сумму, дату, счёт и фактического получателя/отправителя';
  end if;
  select * into v_debt from public.personal_debts where id = p_debt_id for update;
  if not found then raise exception 'Долг не найден'; end if;
  select * into v_existing from public.personal_debt_events where request_id = p_request_id;
  if found then
    if (v_existing.debt_id, v_existing.kind, v_existing.amount, v_existing.occurred_on, v_existing.account_id,
        v_existing.actual_counterparty_name, v_existing.actual_counterparty_details, v_existing.bank_reference, v_existing.note)
       is distinct from
       (p_debt_id, p_kind, p_amount, p_occurred_on, p_account_id, btrim(p_actual_name),
        nullif(btrim(p_actual_details), ''), nullif(btrim(p_bank_reference), ''), nullif(btrim(p_note), '')) then
      raise exception 'Номер операции уже использован для другого платежа';
    end if;
    return v_existing.id;
  end if;
  if not exists(select 1 from public.accounts where id = p_account_id) then raise exception 'Счёт не найден'; end if;
  if exists(select 1 from public.accounts where id = p_account_id and opening_date is not null and p_occurred_on < opening_date) then
    raise exception 'Дата операции раньше даты начального остатка счёта';
  end if;
  select coalesce(sum(case when kind = 'principal' then amount else -amount end), 0)
    into v_balance from public.personal_debt_events where debt_id = p_debt_id;
  if p_kind = 'repayment' and p_amount > v_balance then
    raise exception 'Возврат превышает остаток долга (% ₸)', v_balance;
  end if;
  v_direction := case when (v_debt.direction = 'receivable') = (p_kind = 'principal') then 'expense' else 'income' end;
  v_label := case when p_kind = 'principal' then 'Новый долг' else 'Возврат долга' end;
  v_event_id := gen_random_uuid();
  insert into public.money_moves(account_id, direction, amount, move_date, note, source, ref_id, created_by)
  values(p_account_id, v_direction, p_amount, p_occurred_on,
    v_label || ' · ' || v_debt.counterparty_name || ' · фактически ' || btrim(p_actual_name)
    || coalesce(' · ' || nullif(btrim(p_actual_details), ''), '')
    || coalesce(' · банк: ' || nullif(btrim(p_bank_reference), ''), '')
    || coalesce(' · ' || nullif(btrim(p_note), ''), ''),
    'personal_debt', v_event_id, auth.uid()) returning id into v_move_id;
  insert into public.personal_debt_events(id, debt_id, request_id, kind, amount, occurred_on, account_id, move_id,
    actual_counterparty_name, actual_counterparty_details, bank_reference, note, created_by)
  values(v_event_id, p_debt_id, p_request_id, p_kind, p_amount, p_occurred_on, p_account_id, v_move_id,
    btrim(p_actual_name), nullif(btrim(p_actual_details), ''), nullif(btrim(p_bank_reference), ''),
    nullif(btrim(p_note), ''), auth.uid());
  return v_event_id;
end $$;

create function public.kd_guard_personal_debt_move() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from public.personal_debt_events where move_id = old.id) then
    if tg_op = 'DELETE' then raise exception 'Движение связано с журналом долгов'; end if;
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Движение связано с журналом долгов';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger personal_debt_move_guard before update or delete on public.money_moves
for each row execute function public.kd_guard_personal_debt_move();

revoke all on function public.create_personal_debt(uuid,text,text,text,date,text) from public, anon;
revoke all on function public.post_personal_debt_event(uuid,uuid,text,numeric,date,uuid,text,text,text,text) from public, anon;
revoke all on function public.kd_guard_personal_debt_move() from public, anon, authenticated;
grant execute on function public.create_personal_debt(uuid,text,text,text,date,text) to authenticated;
grant execute on function public.post_personal_debt_event(uuid,uuid,text,numeric,date,uuid,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
