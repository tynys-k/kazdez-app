-- =====================================================================
-- Объект обработки.
--
-- Адрес жил строкой в заявке: одна и та же точка в десяти заявках — десять
-- несвязанных строк текста. Отсюда невозможны история заражения по объекту,
-- точки контроля, журнал обработок для проверяющего и ответ на вопрос
-- «почему мы сюда ездим четвёртый раз».
--
-- Запускать в Supabase → SQL Editor. Повторный запуск безопасен.
-- =====================================================================

-- Технический ключ адреса: нижний регистр, ё→е, всё кроме букв и цифр —
-- в пробел. «Мкр. Аксай-3, д.12, кв.45» и «мкр аксай 3 д 12 кв 45» сходятся.
--
-- Номер квартиры намеренно остаётся частью ключа: для нас объект — это
-- конкретное помещение, а не дом.
create or replace function public.kd_address_key(p text)
returns text language sql immutable as $$
  select nullif(
    btrim(regexp_replace(
      regexp_replace(lower(translate(coalesce(p, ''), 'ё', 'е')), '[^a-zа-я0-9]+', ' ', 'g'),
      '\s+', ' ', 'g')),
    '')
$$;

create table if not exists public.objects (
  id          uuid primary key default gen_random_uuid(),
  address_key text not null unique,
  address     text not null,
  -- apartment | house | office | food | warehouse | production | land | other
  kind        text not null default 'other',
  area        numeric,
  lat         numeric,
  lng         numeric,
  contact_name  text,
  contact_phone text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.jobs add column if not exists object_id uuid references public.objects(id);
create index if not exists jobs_object_id_idx on public.jobs (object_id);

alter table public.objects enable row level security;

drop policy if exists "objects select" on public.objects;
create policy "objects select" on public.objects
  for select to authenticated using (true);

-- Заводит и правит тот, кто и так оформляет заявки: объект появляется в
-- момент оформления.
drop policy if exists "objects write" on public.objects;
create policy "objects write" on public.objects
  for all to authenticated
  using (public.is_admin() or public.kd_has_permission('action.jobs_edit'))
  with check (public.is_admin() or public.kd_has_permission('action.jobs_edit'));

-- ---------------------------------------------------------------------
-- Перенос: собираем объекты из адресов существующих заявок.
-- Адрес и площадь берём из самой свежей заявки по этой точке — она ближе к
-- действительности, чем запись двухлетней давности.
-- ---------------------------------------------------------------------
insert into public.objects (address_key, address, area)
select k,
       (array_agg(address order by scheduled_date desc nulls last))[1],
       (array_agg(area     order by scheduled_date desc nulls last) filter (where area is not null))[1]
from (
  select public.kd_address_key(address) as k, address, area, scheduled_date
  from public.jobs
  where public.kd_address_key(address) is not null
) t
group by k
on conflict (address_key) do nothing;

update public.jobs j
   set object_id = o.id
  from public.objects o
 where j.object_id is null
   and public.kd_address_key(j.address) = o.address_key;

-- Проверка после запуска:
-- select count(*) as объектов from public.objects;
-- select count(*) filter (where object_id is not null) as привязано,
--        count(*) as заявок from public.jobs;
-- Сколько раз ездили на одну точку — то, ради чего всё затевалось:
-- select o.address, count(*) as обработок
--   from public.jobs j join public.objects o on o.id = j.object_id
--  where j.status = 'done' group by o.address order by 2 desc limit 20;
