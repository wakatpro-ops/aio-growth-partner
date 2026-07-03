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

create index if not exists stores_organization_id_idx on public.stores(organization_id);
create index if not exists stores_industry_type_key_idx on public.stores(industry_type_key);
create index if not exists ai_generation_logs_store_id_idx on public.ai_generation_logs(store_id);
create index if not exists ai_generation_logs_created_at_idx on public.ai_generation_logs(created_at desc);
