-- OLX-учёт по объявлениям: ссылка, картинка и снимки счётчиков.
--
-- OLX показывает по объявлению только три накопительных счётчика —
-- просмотры, избранное и показ телефона — «всего с момента публикации».
-- Поэтому храним не дневной прирост, а снимок счётчика на дату: раз в
-- неделю и в конце месяца. Прирост за период система считает сама как
-- разницу двух снимков, а вложения — по покупкам продвижения в
-- ad_promotions. В кассу эти суммы не попадают: это аналитика окупаемости
-- рекламы, а не движение денег.
--
-- Картинка объявления хранится в закрытом бакете ad-images: по ней видно,
-- какое из 40–50 похожих объявлений работает.

begin;

do $dependencies$
begin
  if to_regprocedure('public.kd_has_permission(text)') is null
     or to_regclass('public.ad_assets') is null then
    raise exception 'Не найдены kd_has_permission или ad_assets — сначала примените 2026-09-17_ad_intelligence.sql';
  end if;
end
$dependencies$;

alter table public.ad_assets add column if not exists image_path text;

create table if not exists public.ad_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.ad_assets(id) on delete cascade,
  snapshot_date date not null,
  views integer not null default 0 check (views >= 0),
  favorites integer not null default 0 check (favorites >= 0),
  phone_views integer not null default 0 check (phone_views >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  unique(asset_id,snapshot_date)
);
create index if not exists ad_snapshots_date_idx on public.ad_snapshots(snapshot_date,asset_id);

alter table public.ad_snapshots enable row level security;

drop policy if exists ad_snapshots_read on public.ad_snapshots;
create policy ad_snapshots_read on public.ad_snapshots for select to authenticated
  using (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false));
drop policy if exists ad_snapshots_write on public.ad_snapshots;
create policy ad_snapshots_write on public.ad_snapshots for all to authenticated
  using (coalesce(public.kd_has_permission('action.finance_edit'),false))
  with check (coalesce(public.kd_has_permission('action.finance_edit'),false));

grant select,insert,update,delete on public.ad_snapshots to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-images', 'ad-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ad-images read" on storage.objects;
create policy "ad-images read" on storage.objects for select to authenticated
using (bucket_id = 'ad-images'
  and (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false)));
drop policy if exists "ad-images upload" on storage.objects;
create policy "ad-images upload" on storage.objects for insert to authenticated
with check (bucket_id = 'ad-images' and coalesce(public.kd_has_permission('action.finance_edit'),false));
drop policy if exists "ad-images delete" on storage.objects;
create policy "ad-images delete" on storage.objects for delete to authenticated
using (bucket_id = 'ad-images' and coalesce(public.kd_has_permission('action.finance_edit'),false));

notify pgrst,'reload schema';
commit;
