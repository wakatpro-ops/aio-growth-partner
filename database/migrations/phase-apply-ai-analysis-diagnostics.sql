alter table public.applications add column if not exists ai_analysis_error_code text;
alter table public.applications add column if not exists ai_analysis_model text;

create index if not exists applications_ai_analysis_error_code_idx
  on public.applications(ai_analysis_error_code);

