-- Issue #31: measurable before/after search visibility without confusing it with AIO readiness.

create table if not exists public.search_visibility_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null unique references public.stores(id) on delete cascade,
  baseline_date date not null default current_date,
  comparison_days integer not null default 28 check (comparison_days between 7 and 90),
  search_console_property_uri text,
  country_filter text not null default 'jpn',
  device_filter text not null default 'all' check (device_filter in ('all', 'desktop', 'mobile', 'tablet')),
  status text not null default 'draft' check (status in ('draft', 'connected', 'needs_reconnect', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.search_visibility_keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  keyword text not null check (char_length(keyword) between 2 and 120),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create unique index if not exists search_visibility_keywords_active_unique_idx
  on public.search_visibility_keywords(store_id, lower(keyword)) where archived_at is null;
create index if not exists search_visibility_keywords_store_idx
  on public.search_visibility_keywords(store_id, archived_at, sort_order, created_at);

create table if not exists public.search_visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  keyword_id uuid not null references public.search_visibility_keywords(id) on delete restrict,
  source text not null check (source in ('search_console', 'manual')),
  period_kind text not null check (period_kind in ('baseline', 'current')),
  period_start date not null,
  period_end date not null,
  country_filter text not null default 'jpn',
  device_filter text not null default 'all',
  clicks numeric not null default 0 check (clicks >= 0),
  impressions numeric not null default 0 check (impressions >= 0),
  ctr numeric not null default 0 check (ctr between 0 and 1),
  average_position numeric check (average_position >= 0),
  raw_summary jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (keyword_id, source, period_kind, period_start, period_end, country_filter, device_filter),
  check (period_end >= period_start)
);

create index if not exists search_visibility_snapshots_store_idx
  on public.search_visibility_snapshots(store_id, period_end desc, fetched_at desc);

alter table public.search_visibility_settings enable row level security;
alter table public.search_visibility_keywords enable row level security;
alter table public.search_visibility_snapshots enable row level security;

drop policy if exists "read org search visibility settings" on public.search_visibility_settings;
drop policy if exists "write org search visibility settings" on public.search_visibility_settings;
drop policy if exists "read org search visibility keywords" on public.search_visibility_keywords;
drop policy if exists "write org search visibility keywords" on public.search_visibility_keywords;
drop policy if exists "read org search visibility snapshots" on public.search_visibility_snapshots;
drop policy if exists "write org search visibility snapshots" on public.search_visibility_snapshots;

create policy "read org search visibility settings" on public.search_visibility_settings for select
using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org search visibility settings" on public.search_visibility_settings for all
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org search visibility keywords" on public.search_visibility_keywords for select
using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org search visibility keywords" on public.search_visibility_keywords for all
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org search visibility snapshots" on public.search_visibility_snapshots for select
using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org search visibility snapshots" on public.search_visibility_snapshots for all
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values ('results_visibility', '成果の見える化', '導入前からの検索表示・行動・AI定点観測の変化を比較します。', 'ai', true)
on conflict (key) do update set name = excluded.name, description = excluded.description, category = excluded.category, is_core = excluded.is_core;
insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select key, 'results_visibility', true from public.industry_types
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;
update public.industry_types set default_feature_flags = default_feature_flags || '{"results_visibility":true}'::jsonb;
update public.stores set feature_flags = feature_flags || '{"results_visibility":true}'::jsonb;
