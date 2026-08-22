-- Issues #44, #45, #46, #47 and #48: URL-first public diagnosis and onboarding handoff.
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

create unique index if not exists applications_source_analysis_uidx
  on public.applications(source_analysis_id)
  where source_analysis_id is not null;
create index if not exists public_store_analyses_created_idx on public.public_store_analyses(created_at desc);
create index if not exists public_store_analyses_rate_limit_idx on public.public_store_analyses(rate_limit_key, created_at desc) where rate_limit_key is not null;
create index if not exists public_store_analyses_expiry_idx on public.public_store_analyses(expires_at) where converted_application_id is null;

alter table public.public_store_analyses enable row level security;
revoke all on table public.public_store_analyses from anon, authenticated;
grant all on table public.public_store_analyses to service_role;

drop policy if exists "anonymous applications insert" on public.applications;
revoke insert on table public.applications from anon;
