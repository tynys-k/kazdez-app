-- =====================================================================
-- Клиент как отдельная запись.
--
-- Раньше клиента не существовало: история собиралась сравнением цифр
-- телефона прямо в заявках. Из-за этого «+7 701 382 1617» и
-- «8701 382 16 17» считались разными людьми, а хранить что-либо
-- о клиенте (имя, заметку, «не беспокоить») было негде.
--
-- Ключ склейки — ПОСЛЕДНИЕ 10 ЦИФР номера. В Казахстане значащая часть
-- ровно такая, а различаются записи только префиксом 8 / +7.
--
-- Запускать в Supabase → SQL Editor целиком. Повторный запуск безопасен.
-- =====================================================================

-- 1. Таблица -----------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  phone_key   text not null unique,   -- последние 10 цифр: техническая склейка
  phone       text,                   -- как показывать человеку
  name        text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.jobs add column if not exists client_id uuid references public.clients(id);
create index if not exists jobs_client_id_idx on public.jobs (client_id);

-- 2. Как считается ключ ------------------------------------------------
create or replace function public.kd_phone_key(p text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '');
$$;

-- 3. Перенос существующих заявок --------------------------------------
-- Имя и «как показывать» берём из самой свежей заявки клиента: там
-- запись обычно аккуратнее, чем в самой старой.
insert into public.clients (phone_key, phone, name)
select k.phone_key, k.phone, k.name
from (
  select
    public.kd_phone_key(client_phone) as phone_key,
    (array_agg(client_phone order by scheduled_date desc nulls last))[1] as phone,
    (array_agg(contact_name order by scheduled_date desc nulls last)
       filter (where coalesce(contact_name, '') <> ''))[1] as name
  from public.jobs
  where public.kd_phone_key(client_phone) is not null
    and length(regexp_replace(coalesce(client_phone, ''), '\D', '', 'g')) >= 10
  group by 1
) k
on conflict (phone_key) do nothing;

update public.jobs j
   set client_id = c.id
  from public.clients c
 where c.phone_key = public.kd_phone_key(j.client_phone)
   and j.client_id is distinct from c.id;

-- 4. Дальше связь проставляется сама -----------------------------------
-- Триггер, а не код приложения: заявки создаются из нескольких мест,
-- и любое забытое место снова разъехалось бы с базой — ровно так мы уже
-- теряли ревизию кассы и расход препаратов.
create or replace function public.kd_attach_client()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_key text; v_id uuid;
begin
  v_key := public.kd_phone_key(new.client_phone);
  if v_key is null then return new; end if;

  insert into public.clients (phone_key, phone, name)
  values (v_key, new.client_phone, nullif(new.contact_name, ''))
  on conflict (phone_key) do update
    set phone      = coalesce(excluded.phone, clients.phone),
        name       = coalesce(nullif(excluded.name, ''), clients.name),
        updated_at = now()
  returning id into v_id;

  new.client_id := v_id;
  return new;
end $$;

drop trigger if exists jobs_attach_client on public.jobs;
create trigger jobs_attach_client
  before insert or update of client_phone on public.jobs
  for each row execute function public.kd_attach_client();

-- 5. Доступ ------------------------------------------------------------
alter table public.clients enable row level security;

-- Читают все вошедшие: дезинфектору нужно видеть, кто заказчик.
drop policy if exists "clients select" on public.clients;
create policy "clients select" on public.clients
  for select to authenticated using (true);

-- Менять карточку клиента — тем, кто и так правит заявки.
drop policy if exists "clients write" on public.clients;
create policy "clients write" on public.clients
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

-- 6. Проверка после запуска -------------------------------------------
-- select count(*) as клиентов from clients;
-- select count(*) as заявок_без_клиента from jobs
--   where client_id is null and length(regexp_replace(coalesce(client_phone,''),'\D','','g')) >= 10;
