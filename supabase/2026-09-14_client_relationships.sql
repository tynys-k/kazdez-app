begin;
alter table public.clients add column if not exists client_labels text[] not null default '{}' check(client_labels <@ array['vip','careful','government','regular']::text[]);
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
    insert into public.clients(phone_key, phone, name, note, client_type, legal_name, bin_iin, email, client_labels)
    values (v_key, v_phone, nullif(btrim(p_profile->>'name'), ''), nullif(btrim(p_profile->>'note'), ''),
      coalesce(nullif(p_profile->>'client_type', ''), 'person'), nullif(btrim(p_profile->>'legal_name'), ''),
      nullif(btrim(p_profile->>'bin_iin'), ''), nullif(btrim(p_profile->>'email'), ''), array(select jsonb_array_elements_text(coalesce(p_profile->'client_labels','[]'::jsonb)))) returning id into v_id;
  else
    update public.clients set phone_key=v_key, phone=v_phone, name=nullif(btrim(p_profile->>'name'), ''),
      note=nullif(btrim(p_profile->>'note'), ''), client_type=coalesce(nullif(p_profile->>'client_type', ''), 'person'),
      legal_name=nullif(btrim(p_profile->>'legal_name'), ''), bin_iin=nullif(btrim(p_profile->>'bin_iin'), ''),
      email=nullif(btrim(p_profile->>'email'), ''), client_labels=array(select jsonb_array_elements_text(coalesce(p_profile->'client_labels','[]'::jsonb))), updated_at=now() where id=p_client_id returning id into v_id;
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

create or replace function public.kd_validate_subscription_contract() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.legal_contract_id is not null and not exists(select 1 from public.legal_contracts c where c.id=new.legal_contract_id and c.client_id=new.client_id) then
  raise exception 'Договор должен принадлежать выбранному клиенту';
 end if;
 return new;
end $$;
create trigger z_subscription_contract_match before insert or update on public.service_contracts for each row execute function public.kd_validate_subscription_contract();
create or replace function public.kd_guard_legal_contract() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' then
  if new.client_id is distinct from old.client_id and exists(select 1 from public.service_contracts where legal_contract_id=old.id) then raise exception 'Сначала снимите привязку абонентов к договору'; end if;
  new.created_by:=old.created_by; new.created_at:=old.created_at;
 else new.created_by:=auth.uid(); new.created_at:=now(); end if;
 new.updated_at:=now(); return new;
end $$;
create trigger legal_contract_guard before insert or update on public.legal_contracts for each row execute function public.kd_guard_legal_contract();
revoke all on function public.kd_validate_subscription_contract(),public.kd_guard_legal_contract() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
