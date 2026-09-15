begin;

alter table public.accounts add column if not exists scope text not null default 'business'
  check (scope in ('business','owner'));
alter table public.money_moves add column if not exists finance_class text not null default 'standard'
  check (finance_class in ('standard','owner_direct_spend'));
alter table public.money_moves add column if not exists income_channel text
  check (income_channel in ('clients','tenders','products','other'));
alter table public.opex add column if not exists account_id uuid references public.accounts(id);
alter table public.opex add column if not exists money_move_id uuid unique references public.money_moves(id);
alter table public.expense_categories add column if not exists purpose text not null default 'operations'
  check (purpose in ('operations','growth'));

create function public.kd_guard_account_scope() returns trigger language plpgsql
security definer set search_path = pg_catalog, public as $$
begin
  if new.scope is distinct from old.scope and exists (
    select 1 from public.money_moves where account_id = old.id or to_account_id = old.id
  ) then raise exception 'Тип счёта с проведёнными движениями нельзя менять задним числом'; end if;
  return new;
end $$;
create trigger account_scope_guard before update on public.accounts
for each row execute function public.kd_guard_account_scope();
revoke all on function public.kd_guard_account_scope() from public, anon, authenticated;

create function public.set_expense_category_purpose(p_category_id uuid,p_purpose text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  if p_purpose not in ('operations','growth') then raise exception 'Неверное назначение категории'; end if;
  update public.expense_categories set purpose=p_purpose where id=p_category_id;
  if not found then raise exception 'Категория не найдена'; end if;
end $$;
revoke all on function public.set_expense_category_purpose(uuid,text) from public,anon;
grant execute on function public.set_expense_category_purpose(uuid,text) to authenticated;

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  account_id uuid not null references public.accounts(id),
  bank_name text not null check (length(btrim(bank_name)) > 0),
  filename text not null check (length(btrim(filename)) > 0),
  file_type text not null check (file_type in ('xlsx','csv','pdf')),
  period_from date,
  period_to date,
  closing_balance numeric(14,2),
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid()
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.bank_statements(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  fingerprint text not null,
  booked_on date not null,
  direction text not null check (direction in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  counterparty text,
  reference text,
  created_at timestamptz not null default now(),
  unique(account_id, fingerprint)
);
create index bank_transactions_statement_idx on public.bank_transactions(statement_id, booked_on);

-- Evidence survives removal of a fully reconciled source statement. No PDF/Excel binary is stored.
create table public.bank_evidence (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid unique references public.bank_transactions(id) on delete set null,
  account_id uuid not null references public.accounts(id),
  fingerprint text not null,
  move_id uuid references public.money_moves(id),
  job_id uuid references public.jobs(id),
  kind text not null check (kind in ('move','qr_job','excluded')),
  booked_on date not null,
  direction text not null check (direction in ('income','expense')),
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  note text,
  verified_at timestamptz not null default now(),
  verified_by uuid not null default auth.uid(),
  unique(account_id, fingerprint),
  check ((kind='move' and move_id is not null and job_id is null)
    or (kind='qr_job' and job_id is not null and move_id is null)
    or (kind='excluded' and move_id is null and job_id is null))
);
create index bank_evidence_move_idx on public.bank_evidence(move_id);
create unique index bank_evidence_qr_job_once on public.bank_evidence(job_id) where kind='qr_job';

alter table public.bank_statements enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_evidence enable row level security;
create policy bank_statements_read on public.bank_statements for select to authenticated
  using (public.kd_has_permission('action.finance_edit'));
create policy bank_transactions_read on public.bank_transactions for select to authenticated
  using (public.kd_has_permission('action.finance_edit'));
create policy bank_evidence_read on public.bank_evidence for select to authenticated
  using (public.kd_has_permission('action.finance_edit'));
grant select on public.bank_statements, public.bank_transactions, public.bank_evidence to authenticated;

create function public.import_bank_statement(
  p_request_id uuid, p_account_id uuid, p_bank_name text, p_filename text,
  p_file_type text, p_rows jsonb, p_closing_balance numeric default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_statement_id uuid; v_existing public.bank_statements%rowtype; v_row jsonb;
        v_date date; v_direction text; v_amount numeric; v_description text;
        v_counterparty text; v_reference text; v_key text; v_fingerprint text;
        v_seen jsonb := '{}'::jsonb; v_ordinal integer; v_imported integer := 0;
        v_duplicates integer := 0; v_first date; v_last date;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  if p_request_id is null or p_account_id is null or nullif(btrim(p_bank_name),'') is null
     or nullif(btrim(p_filename),'') is null or p_file_type not in ('xlsx','csv','pdf')
     or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 3000 then
    raise exception 'Нужны счёт, банк, имя файла и 1–3000 распознанных операций'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and kind='bank') then
    raise exception 'Выберите банковский счёт, а не наличные'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bank_import:'||p_account_id::text,0));
  select * into v_existing from public.bank_statements where request_id=p_request_id;
  if found then return jsonb_build_object('statement_id',v_existing.id,'imported',v_existing.imported_count,'duplicates',v_existing.duplicate_count); end if;
  insert into public.bank_statements(request_id,account_id,bank_name,filename,file_type,closing_balance,created_by)
  values(p_request_id,p_account_id,btrim(p_bank_name),btrim(p_filename),p_file_type,p_closing_balance,auth.uid())
  returning id into v_statement_id;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_date := (v_row->>'booked_on')::date;
    v_direction := v_row->>'direction';
    v_amount := (v_row->>'amount')::numeric;
    v_description := coalesce(nullif(btrim(v_row->>'description'),''),'Операция по выписке');
    v_counterparty := nullif(btrim(v_row->>'counterparty'),'');
    v_reference := nullif(btrim(v_row->>'reference'),'');
    if v_date is null or v_direction not in ('income','expense') or v_amount is null or v_amount <= 0
       or v_amount > 999999999999.99 then raise exception 'Неверная строка выписки'; end if;
    v_key := md5(v_date::text||':'||v_direction||':'||v_amount::numeric(14,2)::text||':'||lower(v_description)||':'||coalesce(v_reference,'')||':'||coalesce(v_counterparty,''));
    v_ordinal := coalesce((v_seen->>v_key)::integer,0)+1;
    v_seen := jsonb_set(v_seen,array[v_key],to_jsonb(v_ordinal));
    v_fingerprint := md5(p_account_id::text||':'||v_key||':'||v_ordinal::text);
    if exists(select 1 from public.bank_transactions where account_id=p_account_id and fingerprint=v_fingerprint)
       or exists(select 1 from public.bank_evidence where account_id=p_account_id and fingerprint=v_fingerprint) then
      v_duplicates := v_duplicates+1; continue; end if;
    insert into public.bank_transactions(statement_id,account_id,fingerprint,booked_on,direction,amount,description,counterparty,reference)
    values(v_statement_id,p_account_id,v_fingerprint,v_date,v_direction,v_amount,v_description,v_counterparty,v_reference);
    v_imported := v_imported+1;
    v_first := least(coalesce(v_first,v_date),v_date);
    v_last := greatest(coalesce(v_last,v_date),v_date);
  end loop;
  update public.bank_statements set imported_count=v_imported,duplicate_count=v_duplicates,period_from=v_first,period_to=v_last
    where id=v_statement_id;
  return jsonb_build_object('statement_id',v_statement_id,'imported',v_imported,'duplicates',v_duplicates);
end $$;

create function public.link_bank_transaction(p_transaction_id uuid,p_move_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.bank_transactions%rowtype; v_move public.money_moves%rowtype;
        v_expected text; v_existing public.bank_evidence%rowtype; v_id uuid;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  select * into v_row from public.bank_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Строка выписки не найдена'; end if;
  select * into v_existing from public.bank_evidence where transaction_id=p_transaction_id;
  if found then
    if v_existing.kind='move' and v_existing.move_id=p_move_id then return v_existing.id; end if;
    raise exception 'Строка уже разнесена'; end if;
  select * into v_move from public.money_moves where id=p_move_id for update;
  if not found then raise exception 'Движение по счёту не найдено'; end if;
  v_expected := case when v_move.direction='transfer' and v_move.account_id=v_row.account_id then 'expense'
                     when v_move.direction='transfer' and v_move.to_account_id=v_row.account_id then 'income'
                     when v_move.account_id=v_row.account_id then v_move.direction else null end;
  if v_expected is distinct from v_row.direction or v_move.amount is distinct from v_row.amount
     or v_move.move_date is null or abs(v_move.move_date-v_row.booked_on)>3 then
    raise exception 'Счёт, направление, сумма или дата движения не совпадают с выпиской'; end if;
  if exists(select 1 from public.bank_evidence where move_id=p_move_id and account_id=v_row.account_id and direction=v_row.direction) then
    raise exception 'Это движение уже подтверждено строкой выписки'; end if;
  insert into public.bank_evidence(transaction_id,account_id,fingerprint,move_id,kind,booked_on,direction,amount,description,verified_by)
  values(v_row.id,v_row.account_id,v_row.fingerprint,p_move_id,'move',v_row.booked_on,v_row.direction,v_row.amount,v_row.description,auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.classify_bank_transaction(
  p_transaction_id uuid,p_kind text,p_category_id uuid default null,p_to_account_id uuid default null,
  p_note text default null,p_job_id uuid default null,p_income_channel text default null
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.bank_transactions%rowtype; v_scope text; v_to_scope text; v_move_id uuid; v_id uuid;
        v_job public.jobs%rowtype; v_fee numeric;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  select * into v_row from public.bank_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Строка выписки не найдена'; end if;
  if exists(select 1 from public.bank_evidence where transaction_id=p_transaction_id) then
    raise exception 'Строка уже разнесена'; end if;
  select scope into v_scope from public.accounts where id=v_row.account_id;
  if p_kind in ('transfer','owner_draw') then
    if p_to_account_id is null or p_to_account_id=v_row.account_id then raise exception 'Укажите другой счёт'; end if;
    select scope into v_to_scope from public.accounts where id=p_to_account_id;
    if not found then raise exception 'Счёт назначения не найден'; end if;
    if p_kind='owner_draw' and (v_row.direction<>'expense' or v_scope<>'business' or v_to_scope<>'owner') then
      raise exception 'Личное изъятие: перевод со счёта компании на личный счёт владельца'; end if;
  elsif p_kind='owner_direct_spend' and (v_scope<>'business' or v_row.direction<>'expense') then
    raise exception 'Прямой личный расход проводится как списание с бизнес-счёта';
  elsif p_kind in ('owner_spend','owner_income') and
    (v_scope<>'owner' or v_row.direction<>case when p_kind='owner_spend' then 'expense' else 'income' end) then
    raise exception 'Личная операция проводится с личного счёта владельца';
  elsif p_kind='qr_job' then
    if v_row.direction<>'income' or p_job_id is null then raise exception 'Выберите заявку с QR-оплатой'; end if;
    select * into v_job from public.jobs where id=p_job_id;
    if not found or v_job.status<>'done' or coalesce(v_job.report_qr,0)<=0 then raise exception 'У заявки нет завершённой QR-оплаты'; end if;
    if exists(select 1 from public.bank_evidence where kind='qr_job' and job_id=p_job_id) then raise exception 'QR-оплата этой заявки уже подтверждена'; end if;
    if v_row.account_id is distinct from (select nullif(value,'')::uuid from public.app_settings where key='qr_account_id') then
      raise exception 'QR-оплата относится к другому счёту'; end if;
    select coalesce(nullif(value,''),'0.95')::numeric / 100 into v_fee from public.app_settings where key='qr_fee_rate';
    v_fee := coalesce(v_fee,0.0095);
    if abs(v_row.amount-v_job.report_qr)>1 and abs(v_row.amount-round(v_job.report_qr*(1-v_fee),2))>1 then
      raise exception 'Сумма не совпадает с QR-оплатой заявки (включая комиссию)'; end if;
    insert into public.bank_evidence(transaction_id,account_id,fingerprint,job_id,kind,booked_on,direction,amount,description,note,verified_by)
    values(v_row.id,v_row.account_id,v_row.fingerprint,p_job_id,'qr_job',v_row.booked_on,v_row.direction,v_row.amount,v_row.description,nullif(btrim(p_note),''),auth.uid())
    returning id into v_id;
    return v_id;
  elsif p_kind='excluded' then
    if nullif(btrim(p_note),'') is null then raise exception 'Укажите причину исключения'; end if;
    insert into public.bank_evidence(transaction_id,account_id,fingerprint,kind,booked_on,direction,amount,description,note,verified_by)
    values(v_row.id,v_row.account_id,v_row.fingerprint,'excluded',v_row.booked_on,v_row.direction,v_row.amount,v_row.description,btrim(p_note),auth.uid())
    returning id into v_id;
    return v_id;
  elsif p_kind not in ('business','owner_spend','owner_income','owner_direct_spend') then
    raise exception 'Неверный вид операции'; end if;
  if p_kind='business' and v_scope='owner' then raise exception 'Операция с личного счёта должна быть личной'; end if;
  if p_kind='business' and v_row.direction='income' and (p_income_channel is null or p_income_channel not in ('clients','tenders','products','other')) then
    raise exception 'Укажите канал дохода'; end if;
  if p_kind='business' and v_row.direction='expense' and p_category_id is null then
    raise exception 'Укажите статью расхода'; end if;
  if (p_kind in ('business','owner_income') and v_row.direction='income')
     or p_kind in ('transfer','owner_draw','owner_spend','owner_direct_spend') then
    if nullif(btrim(p_note),'') is null then raise exception 'Укажите назначение операции'; end if;
  end if;
  insert into public.money_moves(account_id,to_account_id,direction,amount,move_date,category_id,finance_class,income_channel,note,source,ref_id,created_by)
  values(case when p_kind in ('transfer','owner_draw') and v_row.direction='income' then p_to_account_id else v_row.account_id end,
    case when p_kind in ('transfer','owner_draw') and v_row.direction='income' then v_row.account_id
         when p_kind in ('transfer','owner_draw') then p_to_account_id else null end,
    case when p_kind in ('transfer','owner_draw') then 'transfer' else v_row.direction end,
    v_row.amount,v_row.booked_on,
    case when p_kind in ('transfer','owner_draw') or v_row.direction='income' then null else p_category_id end,
    case when p_kind='owner_direct_spend' then 'owner_direct_spend' else 'standard' end,
    case when p_kind='business' and v_row.direction='income' then p_income_channel else null end,
    'По выписке: '||v_row.description||coalesce(' · '||nullif(btrim(p_note),''),''),
    'bank_import',v_row.id,auth.uid()) returning id into v_move_id;
  insert into public.bank_evidence(transaction_id,account_id,fingerprint,move_id,kind,booked_on,direction,amount,description,note,verified_by)
  values(v_row.id,v_row.account_id,v_row.fingerprint,v_move_id,'move',v_row.booked_on,v_row.direction,v_row.amount,v_row.description,nullif(btrim(p_note),''),auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.link_opex_bank_transaction(p_transaction_id uuid,p_opex_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_row public.bank_transactions%rowtype; v_opex public.opex%rowtype; v_move_id uuid; v_evidence_id uuid;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  select * into v_row from public.bank_transactions where id=p_transaction_id for update;
  if not found or v_row.direction<>'expense' then raise exception 'Нужна строка расхода из выписки'; end if;
  if exists(select 1 from public.bank_evidence where transaction_id=p_transaction_id) then
    raise exception 'Строка уже разнесена'; end if;
  select * into v_opex from public.opex where id=p_opex_id for update;
  if not found or v_opex.money_move_id is not null then raise exception 'Ручной расход уже проведён или не найден'; end if;
  if v_opex.amount is distinct from v_row.amount or v_opex.spent_date is null
     or abs(v_opex.spent_date-v_row.booked_on)>3
     or (v_opex.account_id is not null and v_opex.account_id<>v_row.account_id) then
    raise exception 'Сумма, счёт или дата ручного расхода не соответствуют выписке'; end if;
  if v_opex.category_id is null then raise exception 'В ручном расходе нужна статья'; end if;
  insert into public.money_moves(account_id,direction,amount,move_date,category_id,subcategory_id,note,source,ref_id,created_by)
  values(v_row.account_id,'expense',v_row.amount,v_row.booked_on,v_opex.category_id,v_opex.subcategory_id,
    'Ручной расход по выписке: '||coalesce(nullif(btrim(v_opex.note),''),v_row.description),
    'opex_bank',v_opex.id,auth.uid()) returning id into v_move_id;
  update public.opex set account_id=v_row.account_id,money_move_id=v_move_id where id=v_opex.id;
  insert into public.bank_evidence(transaction_id,account_id,fingerprint,move_id,kind,booked_on,direction,amount,description,verified_by)
  values(v_row.id,v_row.account_id,v_row.fingerprint,v_move_id,'move',v_row.booked_on,v_row.direction,v_row.amount,v_row.description,auth.uid())
  returning id into v_evidence_id;
  return v_evidence_id;
end $$;

create function public.kd_guard_posted_opex() returns trigger language plpgsql
security definer set search_path = pg_catalog, public as $$
begin
  if old.money_move_id is not null then raise exception 'Проведённый ручной расход нельзя менять или удалять'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger posted_opex_guard before update or delete on public.opex
for each row execute function public.kd_guard_posted_opex();
revoke all on function public.kd_guard_posted_opex() from public,anon,authenticated;

create function public.delete_bank_statement(p_statement_id uuid) returns integer
language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_statement public.bank_statements%rowtype; v_missing integer;
begin
  if not coalesce(public.kd_has_permission('action.finance_edit'),false) then
    raise exception 'Нет доступа к финансам' using errcode='42501'; end if;
  select * into v_statement from public.bank_statements where id=p_statement_id for update;
  if not found then raise exception 'Выписка не найдена'; end if;
  select count(*) into v_missing from public.bank_transactions t
    where t.statement_id=p_statement_id and not exists(select 1 from public.bank_evidence e where e.transaction_id=t.id);
  if v_missing>0 then raise exception 'Сначала разнесите % операций',v_missing; end if;
  delete from public.bank_statements where id=p_statement_id;
  return v_statement.imported_count;
end $$;

create function public.kd_guard_verified_money_move() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if exists(select 1 from public.bank_evidence where move_id=old.id) then
    if tg_op='DELETE' then raise exception 'Движение подтверждено банковской выпиской'; end if;
    if (new.account_id,new.to_account_id,new.direction,new.amount,new.move_date,new.finance_class)
       is distinct from (old.account_id,old.to_account_id,old.direction,old.amount,old.move_date,old.finance_class) then
      raise exception 'Подтверждённые деньги нельзя менять. Исправление — отдельной корректировкой'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger verified_money_move_guard before update or delete on public.money_moves
for each row execute function public.kd_guard_verified_money_move();
revoke all on function public.kd_guard_verified_money_move() from public,anon,authenticated;

create function public.kd_validate_owner_direct_spend() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.finance_class='owner_direct_spend' and (new.direction<>'expense' or new.to_account_id is not null
     or nullif(btrim(new.note),'') is null
     or not exists(select 1 from public.accounts where id=new.account_id and scope='business')) then
    raise exception 'Личный расход: списание с бизнес-счёта, без перевода, с назначением'; end if;
  return new;
end $$;
create trigger owner_direct_spend_guard before insert or update on public.money_moves
for each row execute function public.kd_validate_owner_direct_spend();
revoke all on function public.kd_validate_owner_direct_spend() from public,anon,authenticated;

revoke all on function public.import_bank_statement(uuid,uuid,text,text,text,jsonb,numeric) from public,anon;
revoke all on function public.link_bank_transaction(uuid,uuid) from public,anon;
revoke all on function public.classify_bank_transaction(uuid,text,uuid,uuid,text,uuid,text) from public,anon;
revoke all on function public.link_opex_bank_transaction(uuid,uuid) from public,anon;
revoke all on function public.delete_bank_statement(uuid) from public,anon;
grant execute on function public.import_bank_statement(uuid,uuid,text,text,text,jsonb,numeric) to authenticated;
grant execute on function public.link_bank_transaction(uuid,uuid) to authenticated;
grant execute on function public.classify_bank_transaction(uuid,text,uuid,uuid,text,uuid,text) to authenticated;
grant execute on function public.link_opex_bank_transaction(uuid,uuid) to authenticated;
grant execute on function public.delete_bank_statement(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
