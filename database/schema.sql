create extension if not exists "pgcrypto";

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  plan_key text references public.plans(key),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null default 'org_owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.industry_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  default_feature_flags jsonb not null default '{}'::jsonb,
  default_dashboard_layout jsonb not null default '[]'::jsonb,
  default_profile_schema jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text not null,
  is_core boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.industry_modules (
  id uuid primary key default gen_random_uuid(),
  industry_type_key text not null references public.industry_types(key) on delete cascade,
  module_key text not null references public.modules(key) on delete cascade,
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (industry_type_key, module_key)
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  name text not null,
  address text,
  phone text,
  website_url text,
  google_business_url text,
  description text,
  profile_data jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_key text not null,
  flag_key text not null,
  is_enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_key, flag_key)
);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  industry_type_key text not null references public.industry_types(key),
  module_key text not null references public.modules(key),
  template_key text not null,
  name text not null,
  system_prompt text not null,
  user_prompt_template text not null,
  output_schema jsonb not null default '{}'::jsonb,
  model text not null default 'gpt-4.1-mini',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (industry_type_key, module_key, template_key)
);

create table if not exists public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  industry_type_key text not null references public.industry_types(key),
  layout_key text not null,
  name text not null,
  cards jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (industry_type_key, layout_key)
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_key text not null,
  permission_key text not null,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (role_key, permission_key)
);

create table if not exists public.plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.plans(key) on delete cascade,
  limit_key text not null,
  limit_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_key, limit_key)
);

create table if not exists public.platform_billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  billing_email text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_customer_id uuid references public.platform_billing_customers(id) on delete set null,
  plan_key text references public.plans(key),
  provider text not null default 'stripe',
  provider_subscription_id text,
  status text not null default 'manual',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.billing_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'disabled',
  external_customer_id text,
  external_subscription_id text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.accounting_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  status text not null default 'disabled',
  external_company_id text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  industry_type_key text references public.industry_types(key),
  store_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  store_count integer not null default 1,
  pain_points text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.applications add column if not exists sales_notes text;
alter table public.applications add column if not exists scheduled_demo_at timestamptz;
alter table public.applications add column if not exists demo_completed_at timestamptz;
alter table public.applications add column if not exists billing_status text not null default 'not_issued';
alter table public.applications add column if not exists billing_amount integer;
alter table public.applications add column if not exists billing_memo text;
alter table public.applications add column if not exists invoice_issued_at timestamptz;
alter table public.applications add column if not exists payment_status text not null default 'unpaid';
alter table public.applications add column if not exists payment_confirmed_at timestamptz;
alter table public.applications add column if not exists approval_status text not null default 'pending';
alter table public.applications add column if not exists approved_at timestamptz;
alter table public.applications add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists account_status text not null default 'not_created';
alter table public.applications add column if not exists approved_organization_id uuid references public.organizations(id) on delete set null;
alter table public.applications add column if not exists approved_store_id uuid references public.stores(id) on delete set null;
alter table public.applications add column if not exists approved_user_id uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.applications add column if not exists store_id uuid references public.stores(id) on delete set null;
alter table public.applications add column if not exists invited_user_id uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists invite_email text;
alter table public.applications add column if not exists invitation_status text not null default 'not_started';
alter table public.applications add column if not exists onboarding_status text not null default 'not_started';
alter table public.applications add column if not exists admin_checklist jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists industry_detail_key text;
alter table public.applications add column if not exists industry_label text;
alter table public.applications add column if not exists website_url text;
alter table public.applications add column if not exists google_maps_url text;
alter table public.applications add column if not exists social_urls jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists reference_urls jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists current_tools jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists improvement_goals jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists ai_business_summary text;
alter table public.applications add column if not exists ai_recommended_setup_steps jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists ai_growth_opportunities jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists ai_first_meeting_points jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists ai_analysis_status text not null default 'not_started';
alter table public.applications add column if not exists ai_analysis_error text;
alter table public.applications add column if not exists ai_analysis_error_code text;
alter table public.applications add column if not exists ai_analysis_model text;
alter table public.applications add column if not exists ai_analyzed_at timestamptz;
alter table public.applications add column if not exists updated_at timestamptz not null default now();

create table if not exists public.application_activity_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  from_status text,
  to_status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists applications_status_created_at_idx on public.applications(status, created_at desc);
create index if not exists applications_email_idx on public.applications(email);
create index if not exists applications_org_store_idx on public.applications(organization_id, store_id);
alter table public.stores add column if not exists source_application_id uuid references public.applications(id) on delete set null;
create index if not exists stores_source_application_idx on public.stores(source_application_id);

create table if not exists public.onboarding_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  snapshot_type text not null default 'application_intake',
  title text not null default '申込内容から作成した初期設定下書き',
  content jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, snapshot_type)
);

create index if not exists onboarding_snapshots_store_idx on public.onboarding_snapshots(store_id);
create index if not exists onboarding_snapshots_application_idx on public.onboarding_snapshots(application_id);
create index if not exists application_activity_logs_application_idx on public.application_activity_logs(application_id, created_at desc);

create table if not exists public.ai_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  template_id text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  model text not null,
  tokens jsonb,
  status text not null default 'success',
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.post_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  industry_type_key text,
  purpose text,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.review_reply_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  industry_type_key text,
  review_text text,
  rating integer,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.aio_diagnoses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  industry_type_key text,
  score integer,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  channel text not null default 'instagram',
  status text not null default 'draft',
  title text not null,
  body text not null,
  short_body text,
  hashtags text[] not null default '{}'::text[],
  call_to_action text,
  recommended_image_idea text,
  source_type text,
  source_id text,
  ai_reasoning text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  month text not null,
  title text not null,
  good_points jsonb not null default '[]'::jsonb,
  cautions jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  posting_themes jsonb not null default '[]'::jsonb,
  inventory_suggestions jsonb not null default '[]'::jsonb,
  customer_priorities jsonb not null default '[]'::jsonb,
  source_report jsonb not null default '{}'::jsonb,
  ai_reasoning text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_caption_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  image_url text,
  status text not null default 'queued',
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demand_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  alert_type text not null default 'low_stock',
  severity text not null default 'medium',
  title text not null,
  message text not null,
  suggested_action text,
  source_data jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider_key text not null default 'manual_csv',
  connection_type text not null default 'file_upload',
  name text not null,
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  credentials_ref text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider_key, connection_type, name)
);

create table if not exists public.data_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  data_source_id uuid references public.external_data_sources(id) on delete set null,
  status text not null default 'uploaded',
  import_type text not null default 'csv',
  original_filename text,
  encoding text,
  delimiter text,
  header_row_number integer not null default 1,
  detected_columns jsonb not null default '[]'::jsonb,
  mapping_status text not null default 'pending',
  preview_rows jsonb not null default '[]'::jsonb,
  normalized_preview jsonb not null default '[]'::jsonb,
  total_rows integer not null default 0,
  success_rows integer not null default 0,
  error_rows integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_import_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  import_job_id uuid not null references public.data_import_jobs(id) on delete cascade,
  storage_bucket text not null default 'import-files',
  storage_path text not null,
  file_name text not null,
  file_type text not null,
  mime_type text,
  file_size bigint,
  checksum text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (import_job_id)
);

create table if not exists public.data_column_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  data_source_id uuid references public.external_data_sources(id) on delete cascade,
  import_job_id uuid references public.data_import_jobs(id) on delete cascade,
  source_column_name text not null,
  source_column_index integer not null default 0,
  target_field text not null,
  transform_rule jsonb not null default '{}'::jsonb,
  confidence numeric(5,4),
  is_required boolean not null default false,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, import_job_id, source_column_name)
);

create table if not exists public.sales_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  data_source_id uuid references public.external_data_sources(id) on delete set null,
  import_job_id uuid references public.data_import_jobs(id) on delete set null,
  external_transaction_id text,
  source_row_hash text not null,
  transaction_date timestamptz not null,
  business_date date not null,
  customer_name text,
  payment_method text,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  currency text not null default 'JPY',
  channel text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, source_row_hash)
);

create table if not exists public.sales_transaction_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  sales_transaction_id uuid not null references public.sales_transactions(id) on delete cascade,
  external_item_id text,
  item_name text not null,
  category_name text,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.normalized_sales_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  summary_type text not null,
  summary_date date,
  summary_month text,
  item_name text,
  category_name text,
  payment_method text,
  weekday integer,
  hour integer,
  transaction_count integer not null default 0,
  quantity numeric(14,3) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.import_error_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  import_job_id uuid not null references public.data_import_jobs(id) on delete cascade,
  row_number integer not null,
  raw_row jsonb not null,
  error_code text not null,
  error_message text not null,
  suggested_fix jsonb not null default '{}'::jsonb,
  status text not null default 'unresolved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_ai_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  target_month text not null,
  title text not null,
  summary_metrics jsonb not null default '{}'::jsonb,
  ai_result jsonb not null default '{}'::jsonb,
  anomaly_summary jsonb not null default '[]'::jsonb,
  prompt_version text not null default 'phase-4-b-v1',
  model_name text not null default 'gpt-4.1-mini',
  status text not null default 'success',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_ai_report_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  report_id uuid not null references public.sales_ai_reports(id) on delete cascade,
  section_key text not null,
  title text not null,
  content jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_anomaly_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  report_id uuid references public.sales_ai_reports(id) on delete cascade,
  target_month text not null,
  anomaly_type text not null,
  severity text not null default 'medium',
  title text not null,
  description text not null,
  source_data jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text not null,
  item_name text not null,
  forecast_type text not null default 'stable',
  current_value numeric(14,2) not null default 0,
  previous_value numeric(14,2) not null default 0,
  predicted_value numeric(14,2) not null default 0,
  confidence numeric(5,4) not null default 0.5,
  reason text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text not null,
  item_name text not null,
  alert_type text not null,
  current_stock numeric(14,3) not null default 0,
  reorder_point numeric(14,3) not null default 0,
  recent_sales_quantity numeric(14,3) not null default 0,
  severity text not null default 'medium',
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recommended_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text not null,
  action_type text not null,
  title text not null,
  body text not null,
  item_name text,
  priority text not null default 'medium',
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  title text not null,
  summary text not null,
  priority text not null default 'medium',
  reason text not null,
  recommended_date date,
  target_channel text not null,
  status text not null default 'todo',
  source_type text,
  source_id text,
  external_provider text,
  external_account_id text,
  external_post_id text,
  external_status text not null default 'not_connected',
  scheduled_at timestamptz,
  published_at timestamptz,
  failed_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_action_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid not null references public.growth_actions(id) on delete cascade,
  channel text not null,
  title text not null,
  body text not null,
  short_body text,
  hashtags text[] not null default '{}'::text[],
  call_to_action text,
  copy_variant text not null default 'primary',
  external_provider text,
  external_account_id text,
  external_post_id text,
  external_status text not null default 'not_connected',
  scheduled_at timestamptz,
  published_at timestamptz,
  failed_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_action_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  growth_action_id uuid references public.growth_actions(id) on delete cascade,
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

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

create index if not exists stores_organization_id_idx on public.stores(organization_id);
create index if not exists stores_industry_type_key_idx on public.stores(industry_type_key);
create index if not exists ai_generation_logs_store_id_idx on public.ai_generation_logs(store_id);
create index if not exists ai_generation_logs_created_at_idx on public.ai_generation_logs(created_at desc);
create index if not exists marketing_drafts_store_id_idx on public.marketing_drafts(store_id);
create index if not exists marketing_drafts_created_at_idx on public.marketing_drafts(created_at desc);
create index if not exists ai_recommendations_store_month_idx on public.ai_recommendations(store_id, month);
create index if not exists image_caption_jobs_store_id_idx on public.image_caption_jobs(store_id);
create index if not exists demand_alerts_store_id_idx on public.demand_alerts(store_id);
create index if not exists external_data_sources_store_id_idx on public.external_data_sources(store_id);
create index if not exists data_import_jobs_store_id_idx on public.data_import_jobs(store_id);
create index if not exists data_import_jobs_created_at_idx on public.data_import_jobs(created_at desc);
create index if not exists data_column_mappings_source_idx on public.data_column_mappings(store_id, data_source_id);
create index if not exists sales_transactions_store_date_idx on public.sales_transactions(store_id, business_date desc);
create index if not exists sales_transactions_import_job_idx on public.sales_transactions(import_job_id);
create index if not exists sales_transaction_items_store_id_idx on public.sales_transaction_items(store_id);
create index if not exists normalized_sales_summaries_store_type_idx on public.normalized_sales_summaries(store_id, summary_type);
create index if not exists import_error_rows_job_idx on public.import_error_rows(import_job_id);
create index if not exists sales_ai_reports_store_month_idx on public.sales_ai_reports(store_id, target_month desc);
create index if not exists sales_ai_report_sections_report_idx on public.sales_ai_report_sections(report_id);
create index if not exists sales_anomaly_flags_store_month_idx on public.sales_anomaly_flags(store_id, target_month);
create index if not exists demand_forecasts_store_month_idx on public.demand_forecasts(store_id, target_month desc);
create index if not exists inventory_alerts_store_month_idx on public.inventory_alerts(store_id, target_month desc);
create index if not exists recommended_actions_store_month_idx on public.recommended_actions(store_id, target_month desc);
create index if not exists growth_actions_store_status_idx on public.growth_actions(store_id, status, created_at desc);
create index if not exists growth_actions_store_channel_idx on public.growth_actions(store_id, target_channel);
create index if not exists growth_action_drafts_action_idx on public.growth_action_drafts(growth_action_id);
create index if not exists growth_action_logs_action_idx on public.growth_action_logs(growth_action_id);
create index if not exists growth_action_schedule_items_store_date_idx on public.growth_action_schedule_items(store_id, scheduled_date);
create index if not exists growth_action_schedule_items_action_idx on public.growth_action_schedule_items(growth_action_id);
create index if not exists growth_action_approvals_action_idx on public.growth_action_approvals(growth_action_id);
create index if not exists growth_action_draft_versions_draft_idx on public.growth_action_draft_versions(growth_action_draft_id, version_number desc);
create index if not exists external_channel_accounts_store_idx on public.external_channel_accounts(store_id, channel);
create index if not exists google_oauth_connections_store_idx on public.google_oauth_connections(store_id, status, created_at desc);
create index if not exists google_business_profiles_store_idx on public.google_business_profiles(store_id);
create index if not exists google_gmail_settings_store_idx on public.google_gmail_settings(store_id);
create index if not exists google_calendar_settings_store_idx on public.google_calendar_settings(store_id);
create index if not exists external_publish_jobs_store_idx on public.external_publish_jobs(store_id, provider, created_at desc);
create index if not exists external_publish_jobs_action_idx on public.external_publish_jobs(growth_action_id);
create index if not exists external_integration_logs_store_idx on public.external_integration_logs(store_id, provider, created_at desc);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  industry_type_key text not null references public.industry_types(key),
  item_type text not null default 'product',
  name text not null,
  sku text,
  description text,
  unit text not null default '個',
  unit_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 10,
  is_stock_managed boolean not null default true,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demand_alerts
add column if not exists item_id uuid references public.items(id) on delete set null;

alter table public.sales_transaction_items
add column if not exists item_id uuid references public.items(id) on delete set null;

create table if not exists public.inventory_stocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  quantity numeric(12,2) not null default 0,
  reorder_point numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (item_id)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  movement_type text not null default 'adjustment',
  quantity_delta numeric(12,2) not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  company_name text,
  email text,
  phone text,
  address text,
  vehicle_info jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  document_number text not null,
  title text not null,
  issue_date date not null default current_date,
  expiry_date date,
  status text not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, document_number)
);

create table if not exists public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default '個',
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 10,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  document_number text not null,
  title text not null,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, document_number)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default '個',
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 10,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0
);

alter table public.estimates add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.estimates add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.estimates add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.estimates add column if not exists document_number text;
alter table public.estimates add column if not exists title text;
alter table public.estimates add column if not exists issue_date date default current_date;
alter table public.estimates add column if not exists expiry_date date;
alter table public.estimates add column if not exists status text default 'draft';
alter table public.estimates add column if not exists subtotal numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_total numeric(12,2) default 0;
alter table public.estimates add column if not exists total numeric(12,2) default 0;
alter table public.estimates add column if not exists notes text;
alter table public.estimates add column if not exists created_at timestamptz default now();
alter table public.estimates add column if not exists updated_at timestamptz default now();

alter table public.invoices add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.invoices add column if not exists store_id uuid references public.stores(id) on delete cascade;
alter table public.invoices add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.invoices add column if not exists document_number text;
alter table public.invoices add column if not exists title text;
alter table public.invoices add column if not exists issue_date date default current_date;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists status text default 'draft';
alter table public.invoices add column if not exists subtotal numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_total numeric(12,2) default 0;
alter table public.invoices add column if not exists total numeric(12,2) default 0;
alter table public.invoices add column if not exists paid_at timestamptz;
alter table public.invoices add column if not exists invoice_registration_number text;
alter table public.invoices add column if not exists qualified_invoice_issuer_name text;
alter table public.invoices add column if not exists transaction_date date;
alter table public.invoices add column if not exists invoice_sequence_number integer;
alter table public.invoices add column if not exists invoice_number_prefix text;
alter table public.invoices add column if not exists tax_10_subtotal numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_10_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_8_subtotal numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_8_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists payment_status text default 'unpaid';
alter table public.invoices add column if not exists payment_method text;
alter table public.invoices add column if not exists stripe_payment_url text;
alter table public.invoices add column if not exists stripe_payment_status text default 'not_created';
alter table public.invoices add column if not exists stripe_payment_id text;
alter table public.invoices add column if not exists issued_at timestamptz;
alter table public.invoices add column if not exists last_pdf_issued_at timestamptz;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists created_at timestamptz default now();
alter table public.invoices add column if not exists updated_at timestamptz default now();

create table if not exists public.invoice_number_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  prefix text not null default 'INV',
  next_number integer not null default 1,
  registration_number text,
  qualified_invoice_issuer_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

create table if not exists public.invoice_tax_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  tax_rate numeric(5,2) not null,
  taxable_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_number text not null,
  title text not null,
  status text not null default 'ordered',
  work_status text not null default 'not_started',
  ordered_at date,
  completed_at date,
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, order_number)
);

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  comment text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_date date not null default current_date,
  amount numeric(12,2) not null default 0,
  payment_method text not null default 'bank_transfer',
  status text not null default 'received',
  external_provider text,
  external_payment_id text,
  external_payment_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_pdf_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_number text not null,
  issue_type text not null default 'issue',
  reissue_reason text,
  file_name text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  export_type text not null default 'invoice_csv',
  file_name text,
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  integration_type text not null,
  status text not null default 'planned',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, integration_type)
);

create table if not exists public.store_payment_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null default 'stripe',
  connection_type text not null default 'stripe_connect',
  status text not null default 'not_connected',
  external_account_id text,
  account_name text,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  error_message text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

create table if not exists public.store_accounting_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  external_company_id text,
  office_name text,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  error_message text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

create table if not exists public.store_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'stripe',
  external_payment_intent_id text,
  external_checkout_session_id text,
  external_charge_id text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'jpy',
  status text not null default 'pending',
  customer_email text,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, external_payment_intent_id)
);

create table if not exists public.accounting_export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null,
  provider text not null,
  export_type text not null default 'journal_entries',
  status text not null default 'pending',
  target_period_start date,
  target_period_end date,
  row_count integer not null default 0,
  file_name text,
  download_url text,
  storage_path text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.subsidy_impact_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists items_store_id_idx on public.items(store_id);
create index if not exists inventory_stocks_store_id_idx on public.inventory_stocks(store_id);
create index if not exists inventory_movements_store_id_idx on public.inventory_movements(store_id);
create index if not exists customers_store_id_idx on public.customers(store_id);
create index if not exists estimates_store_id_idx on public.estimates(store_id);
create index if not exists invoices_store_id_idx on public.invoices(store_id);
create index if not exists invoice_number_sequences_store_id_idx on public.invoice_number_sequences(store_id);
create index if not exists invoice_tax_lines_invoice_id_idx on public.invoice_tax_lines(invoice_id);
create index if not exists orders_store_id_idx on public.orders(store_id);
create index if not exists payments_store_id_idx on public.payments(store_id);
create index if not exists invoice_pdf_issues_store_id_idx on public.invoice_pdf_issues(store_id);
create index if not exists audit_logs_store_id_idx on public.audit_logs(store_id);
create index if not exists accounting_exports_store_id_idx on public.accounting_exports(store_id);
create index if not exists integration_configs_store_id_idx on public.integration_configs(store_id);
create index if not exists subsidy_impact_reports_store_id_idx on public.subsidy_impact_reports(store_id);
create index if not exists platform_billing_customers_org_idx on public.platform_billing_customers(organization_id);
create index if not exists platform_subscriptions_org_idx on public.platform_subscriptions(organization_id);
create index if not exists store_payment_integrations_store_id_idx on public.store_payment_integrations(store_id);
create index if not exists store_accounting_integrations_store_id_idx on public.store_accounting_integrations(store_id);
create index if not exists store_payment_transactions_store_id_idx on public.store_payment_transactions(store_id);
create index if not exists accounting_export_jobs_store_id_idx on public.accounting_export_jobs(store_id);
create index if not exists store_payment_transactions_invoice_id_idx on public.store_payment_transactions(invoice_id);
create index if not exists accounting_export_jobs_provider_idx on public.accounting_export_jobs(provider);

alter table public.store_payment_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.store_payment_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_payment_integrations add column if not exists error_message text;
alter table public.store_accounting_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.store_accounting_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_accounting_integrations add column if not exists error_message text;
alter table public.accounting_export_jobs add column if not exists download_url text;
alter table public.accounting_export_jobs add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.customers add column if not exists vehicle_info jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

alter table public.orders add column if not exists work_status text default 'not_started';
alter table public.invoice_pdf_issues add column if not exists reissue_reason text;
