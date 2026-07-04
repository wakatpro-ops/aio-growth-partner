create table if not exists public.google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider_user_id text,
  email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  status text not null default 'not_connected',
  connected_at timestamptz,
  disconnected_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_connections add column if not exists provider_user_id text;
alter table public.google_oauth_connections add column if not exists email text;
alter table public.google_oauth_connections add column if not exists access_token_encrypted text;
alter table public.google_oauth_connections add column if not exists refresh_token_encrypted text;
alter table public.google_oauth_connections add column if not exists expires_at timestamptz;
alter table public.google_oauth_connections add column if not exists scopes text[] not null default '{}'::text[];
alter table public.google_oauth_connections add column if not exists status text not null default 'not_connected';
alter table public.google_oauth_connections add column if not exists connected_at timestamptz;
alter table public.google_oauth_connections add column if not exists disconnected_at timestamptz;
alter table public.google_oauth_connections add column if not exists error_message text;
alter table public.google_oauth_connections add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.google_oauth_connections add column if not exists updated_at timestamptz not null default now();

create table if not exists public.google_business_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  google_account_id text,
  location_id text,
  location_name text,
  address text,
  status text not null default 'not_connected',
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

alter table public.google_business_profiles add column if not exists google_account_id text;
alter table public.google_business_profiles add column if not exists location_id text;
alter table public.google_business_profiles add column if not exists location_name text;
alter table public.google_business_profiles add column if not exists address text;
alter table public.google_business_profiles add column if not exists status text not null default 'not_connected';
alter table public.google_business_profiles add column if not exists last_synced_at timestamptz;
alter table public.google_business_profiles add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.google_business_profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.google_gmail_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  email text,
  sender_name text,
  signature text,
  status text not null default 'not_connected',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

alter table public.google_gmail_settings add column if not exists email text;
alter table public.google_gmail_settings add column if not exists sender_name text;
alter table public.google_gmail_settings add column if not exists signature text;
alter table public.google_gmail_settings add column if not exists status text not null default 'not_connected';
alter table public.google_gmail_settings add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.google_gmail_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.google_calendar_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  calendar_id text,
  calendar_name text,
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'not_connected',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

alter table public.google_calendar_settings add column if not exists calendar_id text;
alter table public.google_calendar_settings add column if not exists calendar_name text;
alter table public.google_calendar_settings add column if not exists timezone text not null default 'Asia/Tokyo';
alter table public.google_calendar_settings add column if not exists status text not null default 'not_connected';
alter table public.google_calendar_settings add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.google_calendar_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.external_publish_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid references public.growth_actions(id) on delete set null,
  channel text not null,
  provider text not null,
  target_id text,
  status text not null default 'ready',
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  payload_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_publish_jobs add column if not exists growth_action_id uuid references public.growth_actions(id) on delete set null;
alter table public.external_publish_jobs add column if not exists channel text not null default 'google_business_profile';
alter table public.external_publish_jobs add column if not exists provider text not null default 'google';
alter table public.external_publish_jobs add column if not exists target_id text;
alter table public.external_publish_jobs add column if not exists status text not null default 'ready';
alter table public.external_publish_jobs add column if not exists scheduled_at timestamptz;
alter table public.external_publish_jobs add column if not exists sent_at timestamptz;
alter table public.external_publish_jobs add column if not exists error_message text;
alter table public.external_publish_jobs add column if not exists payload_json jsonb not null default '{}'::jsonb;
alter table public.external_publish_jobs add column if not exists response_json jsonb not null default '{}'::jsonb;
alter table public.external_publish_jobs add column if not exists updated_at timestamptz not null default now();

create table if not exists public.external_integration_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  action_type text not null,
  status text not null,
  message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.external_integration_logs add column if not exists provider text not null default 'google';
alter table public.external_integration_logs add column if not exists action_type text not null default 'unknown';
alter table public.external_integration_logs add column if not exists status text not null default 'success';
alter table public.external_integration_logs add column if not exists message text;
alter table public.external_integration_logs add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists google_oauth_connections_store_idx on public.google_oauth_connections(store_id, status, created_at desc);
create index if not exists google_business_profiles_store_idx on public.google_business_profiles(store_id);
create index if not exists google_gmail_settings_store_idx on public.google_gmail_settings(store_id);
create index if not exists google_calendar_settings_store_idx on public.google_calendar_settings(store_id);
create index if not exists external_publish_jobs_store_idx on public.external_publish_jobs(store_id, provider, created_at desc);
create index if not exists external_publish_jobs_action_idx on public.external_publish_jobs(growth_action_id);
create index if not exists external_integration_logs_store_idx on public.external_integration_logs(store_id, provider, created_at desc);

alter table public.google_oauth_connections enable row level security;
alter table public.google_business_profiles enable row level security;
alter table public.google_gmail_settings enable row level security;
alter table public.google_calendar_settings enable row level security;
alter table public.external_publish_jobs enable row level security;
alter table public.external_integration_logs enable row level security;

drop policy if exists "read org google oauth connections" on public.google_oauth_connections;
drop policy if exists "write org google oauth connections" on public.google_oauth_connections;
drop policy if exists "read org google business profiles" on public.google_business_profiles;
drop policy if exists "write org google business profiles" on public.google_business_profiles;
drop policy if exists "read org google gmail settings" on public.google_gmail_settings;
drop policy if exists "write org google gmail settings" on public.google_gmail_settings;
drop policy if exists "read org google calendar settings" on public.google_calendar_settings;
drop policy if exists "write org google calendar settings" on public.google_calendar_settings;
drop policy if exists "read org external publish jobs" on public.external_publish_jobs;
drop policy if exists "write org external publish jobs" on public.external_publish_jobs;
drop policy if exists "read org external integration logs" on public.external_integration_logs;
drop policy if exists "write org external integration logs" on public.external_integration_logs;

create policy "read org google oauth connections" on public.google_oauth_connections
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google oauth connections" on public.google_oauth_connections
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google business profiles" on public.google_business_profiles
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google business profiles" on public.google_business_profiles
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google gmail settings" on public.google_gmail_settings
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google gmail settings" on public.google_gmail_settings
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google calendar settings" on public.google_calendar_settings
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google calendar settings" on public.google_calendar_settings
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external publish jobs" on public.external_publish_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external publish jobs" on public.external_publish_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org external integration logs" on public.external_integration_logs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org external integration logs" on public.external_integration_logs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values
  ('google_integrations', 'Google連携', 'Googleビジネスプロフィール、Gmail、Googleカレンダー連携の共通基盤です。', 'integration', false),
  ('google_oauth_connection', 'Google OAuth接続', 'Google OAuth接続状態とトークン保存の基盤です。', 'integration', false),
  ('google_business_profile_integration', 'Googleビジネスプロフィール連携', 'Google検索・マップ向け投稿とロケーション管理の準備です。', 'integration', false),
  ('gmail_draft_integration', 'Gmail下書き連携', '既存顧客案内メールをGmail下書きへ連携する準備です。', 'integration', false),
  ('google_calendar_integration', 'Googleカレンダー連携', '投稿・配信・案内予定をGoogleカレンダーへ連携する準備です。', 'integration', false),
  ('external_publish_jobs', '外部送信準備ログ', '外部サービスに送る前の確認内容、予約日時、結果ログを保存します。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'google_integrations', true),
  ('auto_repair', 'google_integrations', true),
  ('general_store', 'google_oauth_connection', true),
  ('auto_repair', 'google_oauth_connection', true),
  ('general_store', 'google_business_profile_integration', true),
  ('auto_repair', 'google_business_profile_integration', true),
  ('general_store', 'gmail_draft_integration', true),
  ('auto_repair', 'gmail_draft_integration', true),
  ('general_store', 'google_calendar_integration', true),
  ('auto_repair', 'google_calendar_integration', true),
  ('general_store', 'external_publish_jobs', true),
  ('auto_repair', 'external_publish_jobs', true)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'google_integrations', 'google_send_preparation', '汎用店舗 Google送信前確認', 'あなたは地域店舗のGoogle連携前チェックを支援する運用担当です。外部送信前に、本文、送信先、注意点を簡潔に整理してください。', '集客アクション、下書き、送信先、予約日時をもとに、確認ポイント、リスク、次の手順をJSONで返してください。'),
  ('auto_repair', 'google_integrations', 'google_send_preparation', '自動車修理 Google送信前確認', 'あなたは整備工場のGoogle連携前チェックを支援する運用担当です。車検、点検、修理、予約導線の表現が正しいか確認してください。', '集客アクション、下書き、送信先、予約日時をもとに、確認ポイント、リスク、次の手順をJSONで返してください。')
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"google_integrations":true,"google_oauth_connection":true,"google_business_profile_integration":true,"gmail_draft_integration":true,"google_calendar_integration":true,"external_publish_jobs":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"google_integrations":true,"google_oauth_connection":true,"google_business_profile_integration":true,"gmail_draft_integration":true,"google_calendar_integration":true,"external_publish_jobs":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

insert into public.plan_limits (plan_key, limit_key, limit_value)
values ('starter', 'enabled_modules', '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","demand_forecast","inventory_alerts","recommended_actions","growth_action_center","google_business_profile_drafts","instagram_drafts","review_reply_drafts","customer_message_drafts","pop_copy_drafts","line_message_drafts","growth_calendar","draft_approval_flow","draft_editing","channel_previews","external_channel_accounts","google_integrations","google_oauth_connection","google_business_profile_integration","gmail_draft_integration","google_calendar_integration","external_publish_jobs","sales_report_pdf"]')
on conflict (plan_key, limit_key) do update set limit_value = excluded.limit_value;
