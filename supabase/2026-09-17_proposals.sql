-- =====================================================================
-- Коммерческие предложения (КП).
--
-- КП делались руками в Word: каждый раз заново набирались реквизиты
-- клиента, номер придумывался на глаз, а готовый файл жил только на
-- Диске. Отсюда три беды: одинаковые номера у двух КП, устаревшие
-- цены в «почти таком же» КП для постоянной фирмы и невозможность
-- ответить, сколько КП ушло и сколько из них дало заказ.
--
-- Теперь КП — запись в базе: номер выдаёт база, реквизиты берутся из
-- карточки клиента и объекта, цены — из прайса, а сам документ
-- собирается из этой записи. Повторное КП для той же фирмы — копия
-- прошлого с новой датой и номером.
--
-- Запускать в Supabase → SQL Editor целиком. Повторный запуск безопасен.
-- =====================================================================

-- Доступ к КП опирается на те же две функции, что и остальные разделы.
-- Если их нет — значит база отстала на несколько файлов, и политики ниже
-- открыли бы таблицу всем вошедшим. Останавливаемся до, а не после.
do $migration$
begin
  if to_regprocedure('public.kd_has_permission(text)') is null then
    raise exception 'Не найдена функция public.kd_has_permission(text): сначала выполните 2026-09-09_least_privilege.sql';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Не найдена функция public.is_admin()';
  end if;
end
$migration$;

-- Код филиала для номера КП: ALA, AST, KRG, KZO. В номере он нужен,
-- чтобы два города не выдали одинаковый «КП-2026-№12».
alter table public.branches add column if not exists code text;

update public.branches set code = case
  when code is not null and btrim(code) <> '' then code
  when city ilike '%алмат%' then 'ALA'
  when city ilike '%астан%' or city ilike '%нур-султан%' then 'AST'
  when city ilike '%караганд%' then 'KRG'
  when city ilike '%кызылорд%' then 'KZO'
  else 'ALA'
end
where code is null or btrim(code) = '';

create table if not exists public.proposals (
  id            uuid primary key default gen_random_uuid(),

  -- Номер собирается базой и больше не меняется: на него ссылается клиент.
  -- seq уникален внутри года и филиала — это и есть «№52» из «КП-2026-№52-ALA».
  year          int  not null,
  branch_code   text not null default 'ALA',
  seq           int  not null,
  number        text not null unique,

  issue_date    date not null default current_date,
  -- sales — продающая вёрстка (бизнес, ЖК, ОСИ, склады);
  -- official — официальная (госструктуры, больницы, тендеры).
  style         text not null default 'sales',
  segment       text not null default 'custom',

  -- Откуда пришёл клиент: из справочника, из лида или вписан руками.
  client_id     uuid references public.clients(id) on delete set null,
  lead_id       uuid references public.leads(id) on delete set null,
  object_id     uuid references public.objects(id) on delete set null,

  recipient     text,
  client_title  text,
  client_bin    text,
  city          text,
  object_label  text,
  object_address text,
  object_area   numeric,

  subject       text not null default 'Санитарная обработка объекта',
  intro         text,

  -- Строки стоимости и текстовые блоки документа. Хранятся как есть:
  -- КП — это снимок договорённости на дату, и переписывать его при
  -- изменении прайса или шаблона нельзя.
  items         jsonb not null default '[]'::jsonb,
  sections      jsonb not null default '{}'::jsonb,

  total         numeric not null default 0,
  validity_days int     not null default 30,
  payment_terms text,

  -- draft → sent → accepted | declined. Отказ тоже фиксируем: без него
  -- не посчитать, какая доля КП превращается в заказ.
  status        text not null default 'draft',
  sent_at       timestamptz,
  decided_at    timestamptz,
  decline_reason text,

  author_id     uuid references auth.users(id),
  author_name   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint proposals_style_check  check (style in ('sales', 'official')),
  constraint proposals_status_check check (status in ('draft', 'sent', 'accepted', 'declined')),
  constraint proposals_total_check  check (total >= 0),
  constraint proposals_validity_check check (validity_days between 1 and 365)
);

-- request_id добавляем отдельной командой: при повторном запуске файла
-- таблица уже существует, и create table её не тронет.
alter table public.proposals add column if not exists request_id uuid;
create unique index if not exists proposals_request_uniq on public.proposals (request_id) where request_id is not null;

create unique index if not exists proposals_seq_uniq on public.proposals (year, branch_code, seq);
create index if not exists proposals_client_idx on public.proposals (client_id);
create index if not exists proposals_lead_idx   on public.proposals (lead_id);
create index if not exists proposals_status_idx on public.proposals (status, issue_date desc);

-- Кто менял КП и когда: черновик правится много раз, и «последняя версия»
-- должна быть видна без догадок.
create or replace function public.kd_touch_proposal()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists proposals_touch on public.proposals;
create trigger proposals_touch before update on public.proposals
for each row execute function public.kd_touch_proposal();

-- Создание КП с номером. Номер выдаётся под блокировкой строки филиала:
-- два менеджера, нажавшие «Создать» одновременно, получат №53 и №54, а не
-- два №53. Повторный вызов с тем же p_request_id вернёт уже созданное КП —
-- двойной клик и повторная отправка не плодят пустые дубли.
create or replace function public.create_proposal(
  p_request_id uuid,
  p_branch_code text default 'ALA',
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_existing uuid;
  v_year int := extract(year from coalesce((p_payload->>'issue_date')::date, current_date));
  v_code text := upper(coalesce(nullif(btrim(p_branch_code), ''), 'ALA'));
  v_seq int;
  v_id uuid;
begin
  if not (public.is_admin() or public.kd_has_permission('tab.proposals')) then
    raise exception using errcode = '42501', message = 'Нет доступа к коммерческим предложениям';
  end if;

  select id into v_existing from public.proposals where request_id = p_request_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Блокировка по (год, филиал): числовой ключ склеен из года и кода города.
  perform pg_advisory_xact_lock(hashtext('kd_proposal_seq:' || v_year || ':' || v_code));

  select coalesce(max(seq), 0) + 1 into v_seq
  from public.proposals where year = v_year and branch_code = v_code;

  insert into public.proposals (
    request_id, year, branch_code, seq, number, issue_date, style, segment,
    client_id, lead_id, object_id, recipient, client_title, client_bin, city,
    object_label, object_address, object_area, subject, intro, items, sections,
    total, validity_days, payment_terms, author_id, author_name
  ) values (
    p_request_id, v_year, v_code, v_seq,
    'КП-' || v_year || '-№' || v_seq || '-' || v_code,
    coalesce((p_payload->>'issue_date')::date, current_date),
    coalesce(nullif(p_payload->>'style', ''), 'sales'),
    coalesce(nullif(p_payload->>'segment', ''), 'custom'),
    nullif(p_payload->>'client_id', '')::uuid,
    nullif(p_payload->>'lead_id', '')::uuid,
    nullif(p_payload->>'object_id', '')::uuid,
    nullif(p_payload->>'recipient', ''),
    nullif(p_payload->>'client_title', ''),
    nullif(p_payload->>'client_bin', ''),
    nullif(p_payload->>'city', ''),
    nullif(p_payload->>'object_label', ''),
    nullif(p_payload->>'object_address', ''),
    nullif(p_payload->>'object_area', '')::numeric,
    coalesce(nullif(p_payload->>'subject', ''), 'Санитарная обработка объекта'),
    nullif(p_payload->>'intro', ''),
    coalesce(p_payload->'items', '[]'::jsonb),
    coalesce(p_payload->'sections', '{}'::jsonb),
    coalesce(nullif(p_payload->>'total', '')::numeric, 0),
    coalesce(nullif(p_payload->>'validity_days', '')::int, 30),
    nullif(p_payload->>'payment_terms', ''),
    auth.uid(),
    nullif(p_payload->>'author_name', '')
  ) returning id into v_id;

  return v_id;
end $$;

alter table public.proposals enable row level security;

-- Видят КП те же роли, что ведут клиентов: менеджер должен найти прошлое
-- КП фирмы, не спрашивая администратора.
drop policy if exists "proposals select" on public.proposals;
create policy "proposals select" on public.proposals
  for select to authenticated
  using (public.is_admin() or public.kd_has_permission('tab.proposals'));

drop policy if exists "proposals update" on public.proposals;
create policy "proposals update" on public.proposals
  for update to authenticated
  using (public.is_admin() or public.kd_has_permission('tab.proposals'))
  with check (public.is_admin() or public.kd_has_permission('tab.proposals'));

-- Удаляет только администратор: отправленное клиенту КП — документ, а не
-- черновик, и его исчезновение ломает историю переговоров.
drop policy if exists "proposals delete" on public.proposals;
create policy "proposals delete" on public.proposals
  for delete to authenticated using (public.is_admin());

-- Вставка идёт только через create_proposal: иначе номер можно вписать руками.
-- Права на insert не выдаются вовсе — это надёжнее отсутствующей политики.
drop policy if exists "proposals insert" on public.proposals;
revoke all on public.proposals from anon;
grant select, update, delete on public.proposals to authenticated;

grant execute on function public.create_proposal(uuid, text, jsonb) to authenticated;
