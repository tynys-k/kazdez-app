begin;

create table public.ad_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('olx','meta','google','yandex')),
  name text not null check (length(btrim(name)) between 1 and 120),
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  unique(platform,name)
);

create table public.ad_assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ad_accounts(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 240),
  external_id text,
  service text,
  landing_url text,
  margin_pct numeric(5,2) not null default 55 check (margin_pct between 0 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  unique(account_id,external_id)
);
create index ad_assets_account_idx on public.ad_assets(account_id,is_active);

create table public.ad_metrics (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.ad_assets(id) on delete cascade,
  metric_date date not null,
  hour_slot smallint not null default -1 check (hour_slot between -1 and 23),
  impressions integer not null default 0 check (impressions >= 0),
  views integer not null default 0 check (views >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  favorites integer not null default 0 check (favorites >= 0),
  phone_views integer not null default 0 check (phone_views >= 0),
  messages integer not null default 0 check (messages >= 0),
  leads integer not null default 0 check (leads >= 0),
  qualified_leads integer not null default 0 check (qualified_leads >= 0),
  orders integer not null default 0 check (orders >= 0),
  revenue numeric(14,2) not null default 0 check (revenue >= 0),
  gross_profit numeric(14,2) not null default 0 check (gross_profit >= 0),
  spend numeric(14,2) not null default 0 check (spend >= 0),
  source text not null default 'manual' check (source in ('manual','csv','api')),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  unique(asset_id,metric_date,hour_slot)
);
create index ad_metrics_period_idx on public.ad_metrics(metric_date,asset_id);

create table public.ad_promotions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.ad_assets(id) on delete cascade,
  promotion_type text not null check (promotion_type in ('lift_once','lift_7','top_3','top_7','top_30','vip_7','fast','turbo','other')),
  started_on date not null,
  ended_on date not null,
  activated_hour smallint check (activated_hour between 0 and 23),
  cost numeric(14,2) not null check (cost >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  check (ended_on >= started_on)
);
create index ad_promotions_asset_period_idx on public.ad_promotions(asset_id,started_on,ended_on);

alter table public.ad_accounts enable row level security;
alter table public.ad_assets enable row level security;
alter table public.ad_metrics enable row level security;
alter table public.ad_promotions enable row level security;

create policy ad_accounts_read on public.ad_accounts for select to authenticated
  using (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_assets_read on public.ad_assets for select to authenticated
  using (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_metrics_read on public.ad_metrics for select to authenticated
  using (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_promotions_read on public.ad_promotions for select to authenticated
  using (coalesce(public.kd_has_permission('tab.analytics'),false) or coalesce(public.kd_has_permission('action.finance_edit'),false));

create policy ad_accounts_write on public.ad_accounts for all to authenticated
  using (coalesce(public.kd_has_permission('action.finance_edit'),false))
  with check (coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_assets_write on public.ad_assets for all to authenticated
  using (coalesce(public.kd_has_permission('action.finance_edit'),false))
  with check (coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_metrics_write on public.ad_metrics for all to authenticated
  using (coalesce(public.kd_has_permission('action.finance_edit'),false))
  with check (coalesce(public.kd_has_permission('action.finance_edit'),false));
create policy ad_promotions_write on public.ad_promotions for all to authenticated
  using (coalesce(public.kd_has_permission('action.finance_edit'),false))
  with check (coalesce(public.kd_has_permission('action.finance_edit'),false));

grant select,insert,update,delete on public.ad_accounts,public.ad_assets,public.ad_metrics,public.ad_promotions to authenticated;
notify pgrst,'reload schema';
commit;
