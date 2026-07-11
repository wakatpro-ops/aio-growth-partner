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
alter table public.applications add column if not exists ai_analyzed_at timestamptz;

create index if not exists applications_industry_detail_idx
  on public.applications(industry_detail_key);

create index if not exists applications_ai_analysis_status_idx
  on public.applications(ai_analysis_status);
