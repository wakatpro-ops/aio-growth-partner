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

create table if not exists public.public_store_analyses (
  id uuid primary key default gen_random_uuid(),
  public_token_hash text not null unique,
  source_url text not null,
  final_url text,
  status text not null default 'processing',
  fetch_summary jsonb not null default '{}'::jsonb,
  extracted_profile jsonb not null default '{}'::jsonb,
  analysis_result jsonb not null default '{}'::jsonb,
  clarifying_questions jsonb not null default '[]'::jsonb,
  readiness_score integer not null default 0,
  top_improvement jsonb not null default '{}'::jsonb,
  ai_status text not null default 'not_started',
  ai_model text,
  ai_error_code text,
  rate_limit_key text,
  converted_application_id uuid references public.applications(id) on delete set null,
  converted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_store_analyses_status_check check (status in ('processing','success','partial','failed','converted')),
  constraint public_store_analyses_readiness_score_check check (readiness_score between 0 and 100)
);

alter table public.applications add column if not exists source_analysis_id uuid references public.public_store_analyses(id) on delete set null;
alter table public.applications add column if not exists intake_answers jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists ai_target_questions jsonb not null default '[]'::jsonb;
alter table public.applications add column if not exists ai_dashboard_plan jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists applicant_company_name text;
alter table public.applications add column if not exists applicant_store_relationship text;
alter table public.applications add column if not exists applicant_authority_confirmed_at timestamptz;
alter table public.applications add column if not exists intake_review_status text not null default 'not_required';
alter table public.applications add column if not exists intake_reviewed_at timestamptz;
alter table public.applications add column if not exists intake_reviewed_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists intake_review_note text;

alter table public.public_store_analyses add column if not exists verification_name text;
alter table public.public_store_analyses add column if not exists verification_email text;
alter table public.public_store_analyses add column if not exists verification_email_hash text;
alter table public.public_store_analyses add column if not exists verification_code_hash text;
alter table public.public_store_analyses add column if not exists verification_code_expires_at timestamptz;
alter table public.public_store_analyses add column if not exists verification_attempts integer not null default 0;
alter table public.public_store_analyses add column if not exists verification_sent_at timestamptz;
alter table public.public_store_analyses add column if not exists verification_send_count integer not null default 0;
alter table public.public_store_analyses add column if not exists verification_window_started_at timestamptz;
alter table public.public_store_analyses add column if not exists verified_at timestamptz;

create unique index if not exists applications_source_analysis_uidx on public.applications(source_analysis_id) where source_analysis_id is not null;
create index if not exists public_store_analyses_created_idx on public.public_store_analyses(created_at desc);
create index if not exists public_store_analyses_rate_limit_idx on public.public_store_analyses(rate_limit_key, created_at desc) where rate_limit_key is not null;
create index if not exists public_store_analyses_expiry_idx on public.public_store_analyses(expires_at) where converted_application_id is null;
create index if not exists public_store_analyses_verification_email_idx on public.public_store_analyses(verification_email_hash, verification_sent_at desc) where verification_email_hash is not null;
create index if not exists applications_intake_review_idx on public.applications(intake_review_status, created_at desc) where intake_review_status <> 'not_required';

alter table public.public_store_analyses enable row level security;
revoke all on table public.public_store_analyses from anon, authenticated;
grant all on table public.public_store_analyses to service_role;

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

create table if not exists public.application_email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  to_email text not null,
  from_email text not null,
  subject text not null,
  template_key text not null,
  status text not null default 'queued',
  error_message text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists applications_status_created_at_idx on public.applications(status, created_at desc);
create index if not exists applications_email_idx on public.applications(email);
create index if not exists applications_org_store_idx on public.applications(organization_id, store_id);
create index if not exists application_email_logs_application_idx on public.application_email_logs(application_id, created_at desc);
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

alter table public.onboarding_snapshots add column if not exists confirmation_status text not null default 'pending';
alter table public.onboarding_snapshots add column if not exists confirmation_payload jsonb not null default '{}'::jsonb;
alter table public.onboarding_snapshots add column if not exists confirmed_at timestamptz;
alter table public.onboarding_snapshots add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

create index if not exists onboarding_snapshots_store_idx on public.onboarding_snapshots(store_id);
create index if not exists onboarding_snapshots_application_idx on public.onboarding_snapshots(application_id);
create index if not exists onboarding_snapshots_confirmation_idx on public.onboarding_snapshots(store_id, confirmation_status, updated_at desc);
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

alter table public.image_caption_jobs
  add column if not exists storage_bucket text not null default 'sns-media',
  add column if not exists storage_path text,
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists file_sha256 text,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists analysis_json jsonb not null default '{}'::jsonb,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists copyright_confirmed boolean not null default false,
  add column if not exists person_consent_confirmed boolean not null default false,
  add column if not exists privacy_confirmed boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

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

create table if not exists public.unified_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  original_filename text not null,
  storage_bucket text not null default 'import-files',
  storage_path text not null,
  file_sha256 text not null,
  file_type text not null,
  mime_type text,
  file_size bigint not null default 0,
  macro_enabled boolean not null default false,
  status text not null default 'analyzing' check (status in ('analyzing','questions_required','review_required','review_ready','importing','completed','partial_failed','failed')),
  sheet_summaries jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  approved_rows integer not null default 0,
  success_rows integer not null default 0,
  error_rows integer not null default 0,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  unique (id, organization_id, store_id)
);

create table if not exists public.unified_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  sheet_name text not null,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  suggested_record_type text not null default 'unknown' check (suggested_record_type in ('sale','expense','customer','item','inventory','unknown','ignore')),
  confidence numeric(5,4) not null default 0,
  normalized_data jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  question text,
  review_status text not null default 'question' check (review_status in ('ready','question','ignored','approved','imported','error')),
  confirmed_record_type text check (confirmed_record_type is null or confirmed_record_type in ('sale','expense','customer','item','inventory','unknown','ignore')),
  user_corrections jsonb not null default '{}'::jsonb,
  result_table text,
  result_id uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unified_import_rows_job_parent_fk foreign key (import_job_id, organization_id, store_id) references public.unified_import_jobs(id, organization_id, store_id) on delete cascade,
  unique (import_job_id, sheet_name, row_number)
);

create unique index if not exists unified_import_jobs_store_file_active_uidx on public.unified_import_jobs(store_id, file_sha256) where archived_at is null;
create index if not exists unified_import_jobs_store_created_idx on public.unified_import_jobs(store_id, created_at desc) where archived_at is null;
create index if not exists unified_import_rows_job_status_idx on public.unified_import_rows(import_job_id, review_status, sheet_name, row_number);
create index if not exists unified_import_rows_store_type_idx on public.unified_import_rows(store_id, confirmed_record_type, review_status);

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

alter table public.image_caption_jobs
  add column if not exists growth_action_id uuid references public.growth_actions(id) on delete set null;

alter table public.external_channel_accounts
  add column if not exists access_token_encrypted text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text[] not null default '{}'::text[],
  add column if not exists connected_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists error_message text;

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

alter table public.google_business_profiles add column if not exists google_oauth_connection_id uuid references public.google_oauth_connections(id) on delete set null;
alter table public.google_business_profiles add column if not exists location_verified_at timestamptz;

create table if not exists public.google_business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  google_oauth_connection_id uuid not null references public.google_oauth_connections(id) on delete cascade,
  google_account_name text not null,
  google_location_name text not null,
  title text,
  address text,
  store_code text,
  is_selected boolean not null default false,
  selected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, google_account_name, google_location_name)
);

create table if not exists public.google_business_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  google_business_location_id uuid not null references public.google_business_locations(id) on delete restrict,
  google_review_name text not null,
  review_id text,
  reviewer_name text,
  star_rating text,
  comment text,
  google_created_at timestamptz,
  google_updated_at timestamptz,
  google_reply_text text,
  google_reply_updated_at timestamptz,
  reply_draft text,
  reply_status text not null default 'not_started',
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  last_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, google_review_name)
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

alter table public.external_publish_jobs add column if not exists idempotency_key text;
alter table public.external_publish_jobs add column if not exists attempt_count integer not null default 0;
alter table public.external_publish_jobs add column if not exists last_attempt_at timestamptz;
alter table public.external_publish_jobs add column if not exists next_retry_at timestamptz;

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
create unique index if not exists google_business_locations_one_selected_idx on public.google_business_locations(store_id) where is_selected and archived_at is null;
create index if not exists google_business_locations_store_idx on public.google_business_locations(store_id, archived_at, last_seen_at desc);
create index if not exists google_business_reviews_store_idx on public.google_business_reviews(store_id, google_updated_at desc, created_at desc);
create index if not exists google_business_reviews_reply_idx on public.google_business_reviews(store_id, reply_status, updated_at desc);
create index if not exists google_gmail_settings_store_idx on public.google_gmail_settings(store_id);
create index if not exists google_calendar_settings_store_idx on public.google_calendar_settings(store_id);
create index if not exists external_publish_jobs_store_idx on public.external_publish_jobs(store_id, provider, created_at desc);
create index if not exists external_publish_jobs_action_idx on public.external_publish_jobs(growth_action_id);
create unique index if not exists external_publish_jobs_idempotency_idx on public.external_publish_jobs(store_id, provider, idempotency_key) where idempotency_key is not null;
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

alter table public.items add column if not exists onboarding_source_key text;
create unique index if not exists items_store_onboarding_source_uidx on public.items(store_id, onboarding_source_key);

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

alter table public.customers add column if not exists customer_code text;
alter table public.customers add column if not exists birth_date date;
alter table public.customers add column if not exists gender text;
alter table public.customers add column if not exists occupation text;
alter table public.customers add column if not exists assigned_staff_name text;
alter table public.customers add column if not exists line_account text;
alter table public.customers add column if not exists instagram_account text;
alter table public.customers add column if not exists facebook_account text;
alter table public.customers add column if not exists last_visit_date date;
alter table public.customers add column if not exists visit_count integer not null default 0;
alter table public.customers add column if not exists preferred_channel text;
alter table public.customers add column if not exists email_opt_in boolean not null default false;
alter table public.customers add column if not exists line_opt_in boolean not null default false;
alter table public.customers add column if not exists social_opt_in boolean not null default false;
alter table public.customers add column if not exists do_not_contact boolean not null default false;
alter table public.customers add column if not exists tags text[] not null default '{}';
alter table public.customers add column if not exists phone_normalized text;
alter table public.customers add column if not exists import_source text;

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  body text not null,
  follow_up text,
  visibility text not null default 'store',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.customer_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  original_filename text not null,
  file_type text not null,
  status text not null default 'preview',
  source_headers jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  preview_rows jsonb not null default '[]'::jsonb,
  raw_rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  success_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  duplicate_behavior text not null default 'skip',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.customer_message_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  segment_key text not null default 'all',
  channel text not null default 'email',
  goal text,
  title text not null,
  body text not null,
  audience_count integer not null default 0,
  scheduled_at timestamptz,
  status text not null default 'draft',
  ai_reasoning text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists customer_notes_customer_idx on public.customer_notes(store_id, customer_id, created_at desc) where archived_at is null;
create index if not exists customer_import_jobs_store_idx on public.customer_import_jobs(store_id, created_at desc) where archived_at is null;
create index if not exists customer_message_drafts_store_idx on public.customer_message_drafts(store_id, scheduled_at, created_at desc) where archived_at is null;

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
  tax_inclusion text not null default 'inclusive',
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
  tax_inclusion text not null default 'inclusive',
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
alter table public.estimates add column if not exists tax_inclusion text default 'inclusive';
alter table public.estimates add column if not exists total numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_10_subtotal numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_10_amount numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_8_subtotal numeric(12,2) default 0;
alter table public.estimates add column if not exists tax_8_amount numeric(12,2) default 0;
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
alter table public.invoices add column if not exists tax_inclusion text default 'inclusive';
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
  idempotency_key text,
  event_created_at timestamptz,
  last_event_id text,
  amount_refunded numeric(12,2) not null default 0,
  refunded_at timestamptz,
  failure_message text,
  disputed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, external_payment_intent_id)
);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  connected_account_id text,
  event_type text not null,
  livemode boolean not null default false,
  event_created_at timestamptz,
  payload_sha256 text not null,
  processing_status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade, invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null, payment_transaction_id uuid references public.store_payment_transactions(id) on delete set null,
  receipt_number text not null, amount numeric(12,2) not null, currency text not null default 'jpy', issued_to text,
  payment_method text not null default 'stripe', status text not null default 'issued', original_issued_at timestamptz not null default now(),
  last_issued_at timestamptz not null default now(), last_sent_at timestamptz, public_token_hash text, public_token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (store_id, receipt_number), unique (payment_transaction_id)
);

create table if not exists public.payment_receipt_issues (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade, receipt_id uuid not null references public.payment_receipts(id) on delete restrict,
  issue_type text not null default 'issue', reissue_reason text, recipient_email text, delivery_status text, provider_message_id text,
  error_message text, issued_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
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

create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null,
  storage_bucket text not null default 'receipt-files',
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size integer,
  status text not null default 'uploaded',
  vendor_name text,
  receipt_date date,
  payment_method text,
  category_name text,
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  tax_rate text,
  extracted_items jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_model text,
  ai_analysis_status text not null default 'not_started',
  ai_analysis_error text,
  file_sha256 text,
  content_fingerprint text,
  duplicate_of_id uuid references public.expense_receipts(id) on delete set null,
  page_count integer not null default 1,
  invoice_registration_number text,
  field_confidence jsonb not null default '{}'::jsonb,
  tax_breakdown jsonb not null default '[]'::jsonb,
  approval_status text not null default 'draft',
  review_notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  reanalyzed_at timestamptz,
  freee_status text not null default 'not_sent',
  freee_payload jsonb not null default '{}'::jsonb,
  freee_response jsonb not null default '{}'::jsonb,
  freee_sent_at timestamptz,
  freee_deal_id text,
  freee_attempt_count integer not null default 0,
  freee_last_error text,
  freee_last_attempt_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
create unique index if not exists store_payment_transactions_checkout_session_uidx on public.store_payment_transactions(store_id, provider, external_checkout_session_id) where external_checkout_session_id is not null;
create unique index if not exists store_payment_transactions_idempotency_uidx on public.store_payment_transactions(store_id, provider, idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_external_provider_id_uidx on public.payments(store_id, external_provider, external_payment_id) where external_provider is not null and external_payment_id is not null;
create index if not exists payment_receipts_invoice_idx on public.payment_receipts(store_id, invoice_id, created_at desc);
create index if not exists payment_receipt_issues_receipt_idx on public.payment_receipt_issues(receipt_id, created_at desc);
create index if not exists accounting_export_jobs_provider_idx on public.accounting_export_jobs(provider);
create index if not exists expense_receipts_store_created_idx on public.expense_receipts(store_id, created_at desc);
create index if not exists expense_receipts_status_idx on public.expense_receipts(status);
create index if not exists expense_receipts_freee_status_idx on public.expense_receipts(freee_status);

alter table public.store_payment_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.store_payment_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_payment_integrations add column if not exists error_message text;
alter table public.store_payment_transactions add column if not exists idempotency_key text;
alter table public.store_payment_transactions add column if not exists event_created_at timestamptz;
alter table public.store_payment_transactions add column if not exists last_event_id text;
alter table public.store_payment_transactions add column if not exists amount_refunded numeric(12,2) not null default 0;
alter table public.store_payment_transactions add column if not exists refunded_at timestamptz;
alter table public.store_payment_transactions add column if not exists failure_message text;
alter table public.store_payment_transactions add column if not exists disputed_at timestamptz;
alter table public.store_accounting_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.store_accounting_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_accounting_integrations add column if not exists error_message text;
alter table public.accounting_export_jobs add column if not exists download_url text;
alter table public.accounting_export_jobs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null;
alter table public.expense_receipts add column if not exists storage_bucket text not null default 'receipt-files';
alter table public.expense_receipts add column if not exists storage_path text;
alter table public.expense_receipts add column if not exists original_file_name text;
alter table public.expense_receipts add column if not exists mime_type text;
alter table public.expense_receipts add column if not exists file_size integer;
alter table public.expense_receipts add column if not exists status text not null default 'uploaded';
alter table public.expense_receipts add column if not exists vendor_name text;
alter table public.expense_receipts add column if not exists receipt_date date;
alter table public.expense_receipts add column if not exists payment_method text;
alter table public.expense_receipts add column if not exists category_name text;
alter table public.expense_receipts add column if not exists subtotal_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists tax_rate text;
alter table public.expense_receipts add column if not exists extracted_items jsonb not null default '[]'::jsonb;
alter table public.expense_receipts add column if not exists ai_summary text;
alter table public.expense_receipts add column if not exists ai_model text;
alter table public.expense_receipts add column if not exists ai_analysis_status text not null default 'not_started';
alter table public.expense_receipts add column if not exists ai_analysis_error text;
alter table public.expense_receipts add column if not exists file_sha256 text;
alter table public.expense_receipts add column if not exists content_fingerprint text;
alter table public.expense_receipts add column if not exists duplicate_of_id uuid references public.expense_receipts(id) on delete set null;
alter table public.expense_receipts add column if not exists page_count integer not null default 1;
alter table public.expense_receipts add column if not exists invoice_registration_number text;
alter table public.expense_receipts add column if not exists field_confidence jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists tax_breakdown jsonb not null default '[]'::jsonb;
alter table public.expense_receipts add column if not exists approval_status text not null default 'draft';
alter table public.expense_receipts add column if not exists review_notes text;
alter table public.expense_receipts add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.expense_receipts add column if not exists approved_at timestamptz;
alter table public.expense_receipts add column if not exists reanalyzed_at timestamptz;
alter table public.expense_receipts add column if not exists freee_status text not null default 'not_sent';
alter table public.expense_receipts add column if not exists freee_payload jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists freee_response jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists freee_sent_at timestamptz;
alter table public.expense_receipts add column if not exists freee_deal_id text;
alter table public.expense_receipts add column if not exists freee_attempt_count integer not null default 0;
alter table public.expense_receipts add column if not exists freee_last_error text;
alter table public.expense_receipts add column if not exists freee_last_attempt_at timestamptz;
alter table public.expense_receipts add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.expense_receipts add column if not exists created_at timestamptz not null default now();
alter table public.expense_receipts add column if not exists updated_at timestamptz not null default now();

alter table public.customers add column if not exists vehicle_info jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

alter table public.orders add column if not exists work_status text default 'not_started';
alter table public.invoice_pdf_issues add column if not exists reissue_reason text;

-- Archive management. Business records stay recoverable and keep their relations.
alter table public.user_profiles add column if not exists status text not null default 'active';
alter table public.user_profiles add column if not exists archived_at timestamptz;
alter table public.user_profiles add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.organizations add column if not exists status text not null default 'active';
alter table public.organizations add column if not exists archived_at timestamptz;
alter table public.organizations add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.organization_members add column if not exists status text not null default 'active';
alter table public.organization_members add column if not exists archived_at timestamptz;
alter table public.organization_members add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.stores add column if not exists archived_at timestamptz;
alter table public.stores add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists archived_at timestamptz;
alter table public.applications add column if not exists archived_by uuid references auth.users(id) on delete set null;
create unique index if not exists applications_active_email_uidx on public.applications(lower(email)) where archived_at is null;
alter table public.items add column if not exists archived_at timestamptz;
alter table public.items add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists archived_at timestamptz;
alter table public.customers add column if not exists archived_by uuid references auth.users(id) on delete set null;
create index if not exists customers_store_phone_normalized_idx on public.customers(store_id, phone_normalized) where archived_at is null;
create index if not exists customers_store_last_visit_idx on public.customers(store_id, last_visit_date) where archived_at is null;
create index if not exists customers_store_birth_date_idx on public.customers(store_id, birth_date) where archived_at is null;
alter table public.estimates add column if not exists archived_at timestamptz;
alter table public.estimates add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.invoices add column if not exists archived_at timestamptz;
alter table public.invoices add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists archived_at timestamptz;
alter table public.orders add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.data_import_jobs add column if not exists archived_at timestamptz;
alter table public.data_import_jobs add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.marketing_drafts add column if not exists archived_at timestamptz;
alter table public.marketing_drafts add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.ai_recommendations add column if not exists archived_at timestamptz;
alter table public.ai_recommendations add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.sales_ai_reports add column if not exists archived_at timestamptz;
alter table public.sales_ai_reports add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.growth_actions add column if not exists archived_at timestamptz;
alter table public.growth_actions add column if not exists archived_by uuid references auth.users(id) on delete set null;
alter table public.expense_receipts add column if not exists archived_at timestamptz;
alter table public.expense_receipts add column if not exists archived_by uuid references auth.users(id) on delete set null;
create unique index if not exists expense_receipts_store_file_sha256_active_uidx on public.expense_receipts(store_id, file_sha256) where file_sha256 is not null and archived_at is null;
create index if not exists expense_receipts_content_fingerprint_idx on public.expense_receipts(store_id, content_fingerprint) where content_fingerprint is not null and archived_at is null;
create index if not exists expense_receipts_approval_status_idx on public.expense_receipts(store_id, approval_status, created_at desc);

-- AIO improvement closed loop.
create table if not exists public.aio_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null unique references public.stores(id) on delete cascade,
  target_questions text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.aio_improvement_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  source_key text not null,
  title text not null,
  description text,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'on_hold')),
  assignee_name text,
  due_date date,
  source_href text,
  before_score integer check (before_score between 0 and 100),
  after_score integer check (after_score between 0 and 100),
  before_value text,
  after_value text,
  change_summary text,
  hold_reason text,
  publication_target text not null default 'none' check (publication_target in ('none', 'website', 'google', 'instagram', 'facebook', 'other')),
  publication_status text not null default 'not_published' check (publication_status in ('not_published', 'pending_review', 'verified')),
  publication_url text,
  published_at timestamptz,
  verified_at timestamptz,
  next_review_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.aio_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  trigger_type text not null default 'manual' check (trigger_type in ('initial', 'manual', 'monthly', 'task_completed')),
  readiness_items jsonb not null default '[]'::jsonb,
  publication_status jsonb not null default '{}'::jsonb,
  target_questions text[] not null default '{}',
  next_action_key text,
  next_action_label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists aio_improvement_tasks_store_status_idx on public.aio_improvement_tasks(store_id, status, due_date) where archived_at is null;
create index if not exists aio_improvement_tasks_publication_idx on public.aio_improvement_tasks(store_id, publication_status, next_review_at) where archived_at is null;
create index if not exists aio_readiness_snapshots_store_created_idx on public.aio_readiness_snapshots(store_id, created_at desc);

-- Inventory and sales synchronization.
alter table public.inventory_stocks add column if not exists reserved_quantity numeric(12,2) not null default 0;
alter table public.inventory_movements add column if not exists reserved_delta numeric(12,2) not null default 0;
alter table public.inventory_movements add column if not exists balance_after numeric(12,2);
alter table public.inventory_movements add column if not exists reserved_after numeric(12,2);
alter table public.inventory_movements add column if not exists reason text;
alter table public.inventory_movements add column if not exists reference_type text;
alter table public.inventory_movements add column if not exists reference_id uuid;
alter table public.inventory_movements add column if not exists movement_key text;
alter table public.inventory_movements add column if not exists occurred_at timestamptz not null default now();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default '個',
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.import_item_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  import_job_id uuid not null references public.data_import_jobs(id) on delete cascade,
  source_item_key text not null,
  source_item_name text not null,
  source_item_code text,
  suggested_item_id uuid references public.items(id) on delete set null,
  confirmed_item_id uuid references public.items(id) on delete set null,
  status text not null default 'pending',
  confidence numeric(5,4),
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_job_id, source_item_key)
);

alter table public.data_import_jobs add column if not exists source_url text;
alter table public.data_import_jobs add column if not exists item_matching_status text not null default 'pending';
alter table public.sales_transaction_items add column if not exists item_match_status text not null default 'unmatched';
do $$ begin
  alter table public.data_import_jobs add constraint data_import_jobs_item_matching_status_check check (item_matching_status in ('pending', 'confirmed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sales_transaction_items add constraint sales_transaction_items_item_match_status_check check (item_match_status in ('unmatched', 'confirmed', 'ignored'));
exception when duplicate_object then null; end $$;

create or replace function public.apply_inventory_movement(
  p_store_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity_delta numeric,
  p_reserved_delta numeric default 0,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_movement_key text default null,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_existing_id uuid;
  v_movement_id uuid;
  v_quantity numeric(12,2);
  v_reserved numeric(12,2);
begin
  select s.organization_id into v_organization_id
  from public.stores s
  join public.items i on i.store_id = s.id and i.id = p_item_id
  where s.id = p_store_id and s.archived_at is null and i.archived_at is null;
  if v_organization_id is null then raise exception '店舗または在庫対象が見つかりません。'; end if;

  if p_movement_key is not null then
    select id into v_existing_id from public.inventory_movements where store_id = p_store_id and movement_key = p_movement_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  insert into public.inventory_stocks (organization_id, store_id, item_id, quantity, reserved_quantity)
  values (v_organization_id, p_store_id, p_item_id, 0, 0)
  on conflict (item_id) do nothing;

  select quantity, reserved_quantity into v_quantity, v_reserved
  from public.inventory_stocks where item_id = p_item_id for update;
  if p_movement_key is not null then
    select id into v_existing_id from public.inventory_movements where store_id = p_store_id and movement_key = p_movement_key;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;
  v_quantity := v_quantity + coalesce(p_quantity_delta, 0);
  v_reserved := greatest(0, v_reserved + coalesce(p_reserved_delta, 0));
  update public.inventory_stocks set quantity = v_quantity, reserved_quantity = v_reserved, updated_at = now() where item_id = p_item_id;

  insert into public.inventory_movements (
    organization_id, store_id, item_id, movement_type, quantity_delta, reserved_delta,
    balance_after, reserved_after, note, reason, reference_type, reference_id,
    movement_key, created_by, occurred_at
  ) values (
    v_organization_id, p_store_id, p_item_id, p_movement_type, coalesce(p_quantity_delta, 0), coalesce(p_reserved_delta, 0),
    v_quantity, v_reserved, p_reason, p_reason, p_reference_type, p_reference_id,
    p_movement_key, p_actor_user_id, now()
  ) returning id into v_movement_id;
  return v_movement_id;
end;
$$;

revoke all on function public.apply_inventory_movement(uuid, uuid, text, numeric, numeric, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_inventory_movement(uuid, uuid, text, numeric, numeric, text, text, uuid, text, uuid) to service_role;
create unique index if not exists inventory_movements_store_key_unique on public.inventory_movements(store_id, movement_key) where movement_key is not null;
create index if not exists inventory_movements_item_time_idx on public.inventory_movements(item_id, occurred_at desc);
create index if not exists order_items_order_idx on public.order_items(store_id, order_id, sort_order) where archived_at is null;
create index if not exists import_item_matches_job_idx on public.import_item_matches(store_id, import_job_id, status);
