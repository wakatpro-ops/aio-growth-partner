-- Phase 5-B: Growth calendar, approval flow, draft editing, previews, external channel preparation.
-- Safe to run multiple times. Existing data is not deleted.

alter table public.growth_actions add column if not exists external_account_id text;
alter table public.growth_actions add column if not exists external_post_id text;
alter table public.growth_actions add column if not exists scheduled_at timestamptz;
alter table public.growth_actions add column if not exists published_at timestamptz;
alter table public.growth_actions add column if not exists failed_reason text;

alter table public.growth_action_drafts add column if not exists external_account_id text;
alter table public.growth_action_drafts add column if not exists external_post_id text;
alter table public.growth_action_drafts add column if not exists scheduled_at timestamptz;
alter table public.growth_action_drafts add column if not exists published_at timestamptz;
alter table public.growth_action_drafts add column if not exists failed_reason text;

create table if not exists public.growth_action_schedule_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid not null references public.growth_actions(id) on delete cascade,
  growth_action_draft_id uuid references public.growth_action_drafts(id) on delete set null,
  channel text not null,
  title text not null,
  scheduled_date date not null,
  scheduled_at timestamptz,
  status text not null default 'drafted',
  external_provider text,
  external_account_id text,
  external_post_id text,
  external_status text not null default 'not_connected',
  published_at timestamptz,
  failed_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_action_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid not null references public.growth_actions(id) on delete cascade,
  growth_action_draft_id uuid references public.growth_action_drafts(id) on delete set null,
  status text not null default 'pending',
  comment text,
  requested_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.growth_action_draft_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid not null references public.growth_actions(id) on delete cascade,
  growth_action_draft_id uuid not null references public.growth_action_drafts(id) on delete cascade,
  version_number integer not null default 1,
  title text not null,
  body text not null,
  short_body text,
  hashtags text[] not null default '{}'::text[],
  call_to_action text,
  memo text,
  edited_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.external_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  channel text not null,
  external_provider text not null,
  external_account_id text,
  account_name text not null,
  connection_status text not null default 'planned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, channel, external_provider)
);

create index if not exists growth_action_schedule_items_store_date_idx on public.growth_action_schedule_items(store_id, scheduled_date);
create index if not exists growth_action_schedule_items_action_idx on public.growth_action_schedule_items(growth_action_id);
create index if not exists growth_action_approvals_action_idx on public.growth_action_approvals(growth_action_id);
create index if not exists growth_action_draft_versions_draft_idx on public.growth_action_draft_versions(growth_action_draft_id, version_number desc);
create index if not exists external_channel_accounts_store_idx on public.external_channel_accounts(store_id, channel);

alter table public.growth_action_schedule_items enable row level security;
alter table public.growth_action_approvals enable row level security;
alter table public.growth_action_draft_versions enable row level security;
alter table public.external_channel_accounts enable row level security;

drop policy if exists "read org growth action schedule items" on public.growth_action_schedule_items;
drop policy if exists "write org growth action schedule items" on public.growth_action_schedule_items;
drop policy if exists "read org growth action approvals" on public.growth_action_approvals;
drop policy if exists "write org growth action approvals" on public.growth_action_approvals;
drop policy if exists "read org growth action draft versions" on public.growth_action_draft_versions;
drop policy if exists "write org growth action draft versions" on public.growth_action_draft_versions;
drop policy if exists "read org external channel accounts" on public.external_channel_accounts;
drop policy if exists "write org external channel accounts" on public.external_channel_accounts;

create policy "read org growth action schedule items" on public.growth_action_schedule_items
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action schedule items" on public.growth_action_schedule_items
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action approvals" on public.growth_action_approvals
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action approvals" on public.growth_action_approvals
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org growth action draft versions" on public.growth_action_draft_versions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org growth action draft versions" on public.growth_action_draft_versions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external channel accounts" on public.external_channel_accounts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external channel accounts" on public.external_channel_accounts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values
  ('growth_calendar', '集客カレンダー', '投稿、配信、返信、POP作成の予定を管理します。', 'marketing', false),
  ('draft_approval_flow', '下書き承認フロー', '承認待ち、承認済み、差し戻しを管理します。', 'marketing', false),
  ('draft_editing', '下書き編集', '投稿下書きの本文、CTA、ハッシュタグを編集します。', 'marketing', false),
  ('channel_previews', 'チャネル別プレビュー', 'Google、Instagram、LINE、POPなどの見え方を確認します。', 'marketing', false),
  ('external_channel_accounts', '外部チャネル設定', '将来の外部アカウント連携に備えた管理項目です。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'growth_calendar', true),
  ('auto_repair', 'growth_calendar', true),
  ('general_store', 'draft_approval_flow', true),
  ('auto_repair', 'draft_approval_flow', true),
  ('general_store', 'draft_editing', true),
  ('auto_repair', 'draft_editing', true),
  ('general_store', 'channel_previews', true),
  ('auto_repair', 'channel_previews', true),
  ('general_store', 'external_channel_accounts', true),
  ('auto_repair', 'external_channel_accounts', true)
on conflict (industry_type_key, module_key) do update set
  is_enabled = excluded.is_enabled;

update public.industry_types
set default_feature_flags = default_feature_flags || '{
  "growth_calendar": true,
  "draft_approval_flow": true,
  "draft_editing": true,
  "channel_previews": true,
  "external_channel_accounts": true
}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{
  "growth_calendar": true,
  "draft_approval_flow": true,
  "draft_editing": true,
  "channel_previews": true,
  "external_channel_accounts": true
}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'industry_type', industry.key, flag.flag_key, true
from public.industry_types industry
cross join (
  values
    ('growth_calendar'),
    ('draft_approval_flow'),
    ('draft_editing'),
    ('channel_previews'),
    ('external_channel_accounts')
) as flag(flag_key)
where industry.key in ('general_store', 'auto_repair')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'store', store.id::text, flag.flag_key, true
from public.stores store
cross join (
  values
    ('growth_calendar'),
    ('draft_approval_flow'),
    ('draft_editing'),
    ('channel_previews'),
    ('external_channel_accounts')
) as flag(flag_key)
where store.industry_type_key in ('general_store', 'auto_repair')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

insert into public.plan_limits (plan_key, limit_key, limit_value)
values ('starter', 'enabled_modules', '[]')
on conflict (plan_key, limit_key) do nothing;

update public.plan_limits
set limit_value = '[
  "store_profile",
  "multi_store",
  "ai_post_generation",
  "ai_review_reply",
  "aio_diagnosis",
  "product_management",
  "inventory_management",
  "customer_management",
  "estimate_management",
  "invoice_management",
  "pdf_export",
  "monthly_report",
  "marketing_drafts",
  "instagram_draft_generation",
  "google_business_profile_draft",
  "ai_monthly_recommendations",
  "demand_alerts",
  "data_imports",
  "csv_import",
  "excel_import",
  "column_mapping",
  "sales_normalization",
  "sales_reports",
  "sales_ai_report",
  "sales_anomaly_detection",
  "demand_forecast",
  "inventory_alerts",
  "recommended_actions",
  "growth_action_center",
  "google_business_profile_drafts",
  "instagram_drafts",
  "review_reply_drafts",
  "customer_message_drafts",
  "pop_copy_drafts",
  "line_message_drafts",
  "growth_calendar",
  "draft_approval_flow",
  "draft_editing",
  "channel_previews",
  "external_channel_accounts",
  "sales_report_pdf"
]'
where plan_key = 'starter'
  and limit_key = 'enabled_modules';

insert into public.growth_action_schedule_items (
  organization_id,
  store_id,
  growth_action_id,
  growth_action_draft_id,
  channel,
  title,
  scheduled_date,
  scheduled_at,
  status,
  external_provider,
  external_account_id,
  external_post_id,
  external_status,
  published_at,
  failed_reason,
  metadata
)
select
  action.organization_id,
  action.store_id,
  action.id,
  draft.id,
  action.target_channel,
  action.title,
  coalesce(action.recommended_date, current_date),
  coalesce(action.scheduled_at, (coalesce(action.recommended_date, current_date)::text || ' 09:00:00+00')::timestamptz),
  action.status,
  action.external_provider,
  action.external_account_id,
  action.external_post_id,
  coalesce(action.external_status, 'not_connected'),
  action.published_at,
  action.failed_reason,
  '{"backfilled": true}'::jsonb
from public.growth_actions action
left join lateral (
  select id
  from public.growth_action_drafts
  where growth_action_id = action.id
  order by created_at asc
  limit 1
) draft on true
where not exists (
  select 1
  from public.growth_action_schedule_items item
  where item.growth_action_id = action.id
);
