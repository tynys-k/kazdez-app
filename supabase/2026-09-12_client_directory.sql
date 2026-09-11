-- Единая карточка клиента: реквизиты, контактные лица, адреса и вложения.
-- Повторный запуск безопасен.

alter table public.clients add column if not exists client_type text not null default 'person';
alter table public.clients add column if not exists legal_name text;
alter table public.clients add column if not exists bin_iin text;
alter table public.clients add column if not exists email text;

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text,
  role text,
  phone text,
  email text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coalesce(nullif(btrim(phone), ''), nullif(btrim(email), '')) is not null)
);
create index if not exists client_contacts_client_id_idx on public.client_contacts(client_id);

create table if not exists public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text,
  address text not null,
  contact_name text,
  contact_phone text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_addresses_client_id_idx on public.client_addresses(client_id);

create table if not exists public.client_attachments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists client_attachments_client_id_idx on public.client_attachments(client_id);

alter table public.service_contracts add column if not exists client_id uuid references public.clients(id);
create index if not exists service_contracts_client_id_idx on public.service_contracts(client_id);
alter table public.client_events add column if not exists client_id uuid references public.clients(id);
create index if not exists client_events_client_id_idx on public.client_events(client_id);
update public.client_events e set client_id = c.id
from public.clients c
where e.client_id is null and c.phone_key = public.kd_phone_key(e.client_phone);
update public.service_contracts sc set client_id = c.id
from public.clients c
where sc.client_id is null and c.phone_key = public.kd_phone_key(sc.phone);

create or replace function public.kd_attach_contract_client()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.client_id is null and public.kd_phone_key(new.phone) is not null then
    select id into new.client_id from public.clients where phone_key = public.kd_phone_key(new.phone);
  end if;
  return new;
end $$;
drop trigger if exists service_contracts_attach_client on public.service_contracts;
create trigger service_contracts_attach_client before insert or update of phone, client_id
on public.service_contracts for each row execute function public.kd_attach_contract_client();

alter table public.client_contacts enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_attachments enable row level security;

drop policy if exists "client contacts select" on public.client_contacts;
create policy "client contacts select" on public.client_contacts for select to authenticated
using (coalesce(public.kd_account_active(), false) and (public.is_admin()
  or public.kd_has_permission('action.jobs_edit') or public.kd_has_permission('action.leads_edit')));
drop policy if exists "client contacts write" on public.client_contacts;
create policy "client contacts write" on public.client_contacts for all to authenticated
using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

drop policy if exists "client addresses select" on public.client_addresses;
create policy "client addresses select" on public.client_addresses for select to authenticated
using (coalesce(public.kd_account_active(), false) and (public.is_admin()
  or public.kd_has_permission('action.jobs_edit') or public.kd_has_permission('action.leads_edit')));
drop policy if exists "client addresses write" on public.client_addresses;
create policy "client addresses write" on public.client_addresses for all to authenticated
using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

drop policy if exists "client attachments select" on public.client_attachments;
create policy "client attachments select" on public.client_attachments for select to authenticated
using (coalesce(public.kd_account_active(), false) and (public.is_admin()
  or public.kd_has_permission('action.jobs_edit') or public.kd_has_permission('action.leads_edit')));
drop policy if exists "client attachments write" on public.client_attachments;
create policy "client attachments write" on public.client_attachments for all to authenticated
using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-files', 'client-files', false, 26214400,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client-files read" on storage.objects;
create policy "client-files read" on storage.objects for select to authenticated
using (bucket_id = 'client-files' and coalesce(public.kd_account_active(), false)
  and (public.is_admin() or public.kd_has_permission('action.jobs_edit') or public.kd_has_permission('action.leads_edit')));
drop policy if exists "client-files upload" on storage.objects;
create policy "client-files upload" on storage.objects for insert to authenticated
with check (bucket_id = 'client-files' and (public.is_admin() or public.kd_has_permission('action.jobs_edit')));
drop policy if exists "client-files delete" on storage.objects;
create policy "client-files delete" on storage.objects for delete to authenticated
using (bucket_id = 'client-files' and (public.is_admin() or public.kd_has_permission('action.jobs_edit')));

-- Сохраняем профиль и дочерние строки одной транзакцией.
create or replace function public.save_client_profile_atomic(
  p_client_id uuid,
  p_profile jsonb,
  p_contacts jsonb default '[]'::jsonb,
  p_addresses jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_phone text; v_key text;
begin
  if not (public.is_admin() or public.kd_has_permission('action.jobs_edit')) then
    raise exception 'Недостаточно прав для изменения клиента' using errcode = '42501';
  end if;
  v_phone := nullif(btrim(p_profile->>'phone'), '');
  v_key := public.kd_phone_key(v_phone);
  if v_key is null then raise exception 'Укажите корректный телефон клиента'; end if;

  if p_client_id is null then
    insert into public.clients(phone_key, phone, name, note, client_type, legal_name, bin_iin, email)
    values (v_key, v_phone, nullif(btrim(p_profile->>'name'), ''), nullif(btrim(p_profile->>'note'), ''),
      coalesce(nullif(p_profile->>'client_type', ''), 'person'), nullif(btrim(p_profile->>'legal_name'), ''),
      nullif(btrim(p_profile->>'bin_iin'), ''), nullif(btrim(p_profile->>'email'), '')) returning id into v_id;
  else
    update public.clients set phone_key=v_key, phone=v_phone, name=nullif(btrim(p_profile->>'name'), ''),
      note=nullif(btrim(p_profile->>'note'), ''), client_type=coalesce(nullif(p_profile->>'client_type', ''), 'person'),
      legal_name=nullif(btrim(p_profile->>'legal_name'), ''), bin_iin=nullif(btrim(p_profile->>'bin_iin'), ''),
      email=nullif(btrim(p_profile->>'email'), ''), updated_at=now() where id=p_client_id returning id into v_id;
    if v_id is null then raise exception 'Клиент не найден'; end if;
  end if;

  delete from public.client_contacts where client_id=v_id;
  insert into public.client_contacts(client_id,name,role,phone,email,note)
  select v_id, nullif(btrim(x.name),''), nullif(btrim(x.role),''), nullif(btrim(x.phone),''), nullif(btrim(x.email),''), nullif(btrim(x.note),'')
  from jsonb_to_recordset(coalesce(p_contacts,'[]'::jsonb)) as x(name text, role text, phone text, email text, note text)
  where coalesce(nullif(btrim(x.phone),''),nullif(btrim(x.email),'')) is not null;

  delete from public.client_addresses where client_id=v_id;
  insert into public.client_addresses(client_id,label,address,contact_name,contact_phone,note)
  select v_id, nullif(btrim(x.label),''), btrim(x.address), nullif(btrim(x.contact_name),''), nullif(btrim(x.contact_phone),''), nullif(btrim(x.note),'')
  from jsonb_to_recordset(coalesce(p_addresses,'[]'::jsonb)) as x(label text,address text,contact_name text,contact_phone text,note text)
  where nullif(btrim(x.address),'') is not null;

  update public.jobs set client_id=v_id where client_id is null and public.kd_phone_key(client_phone)=v_key;
  update public.service_contracts set client_id=v_id where client_id is null and public.kd_phone_key(phone)=v_key;
  return v_id;
end $$;
revoke all on function public.save_client_profile_atomic(uuid,jsonb,jsonb,jsonb) from public;
grant execute on function public.save_client_profile_atomic(uuid,jsonb,jsonb,jsonb) to authenticated;
notify pgrst, 'reload schema';
