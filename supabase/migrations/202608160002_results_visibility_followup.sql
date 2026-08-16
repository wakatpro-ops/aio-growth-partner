-- Issue #31 follow-up: previous-period comparison, selectable properties and AI visibility monitoring.

alter table public.search_visibility_snapshots
  drop constraint if exists search_visibility_snapshots_period_kind_check;
alter table public.search_visibility_snapshots
  add constraint search_visibility_snapshots_period_kind_check
  check (period_kind in ('baseline', 'previous', 'current'));

create table if not exists public.ai_visibility_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  question text not null check (char_length(question) between 5 and 300),
  sort_order integer not null default 0,
  frequency_days integer not null default 7 check (frequency_days in (7, 14, 30)),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create unique index if not exists ai_visibility_questions_active_unique_idx
  on public.ai_visibility_questions(store_id, lower(question)) where archived_at is null;
create index if not exists ai_visibility_questions_due_idx
  on public.ai_visibility_questions(next_run_at, store_id) where archived_at is null;

create table if not exists public.ai_visibility_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  question_id uuid not null references public.ai_visibility_questions(id) on delete restrict,
  question_snapshot text not null,
  model text not null,
  status text not null check (status in ('success', 'error')),
  store_mentioned boolean not null default false,
  mention_position integer check (mention_position is null or mention_position > 0),
  cited_urls jsonb not null default '[]'::jsonb,
  answer_excerpt text,
  error_message text,
  observed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_visibility_observations_store_idx
  on public.ai_visibility_observations(store_id, observed_at desc);
create index if not exists ai_visibility_observations_question_idx
  on public.ai_visibility_observations(question_id, observed_at desc);

alter table public.ai_visibility_questions enable row level security;
alter table public.ai_visibility_observations enable row level security;

drop policy if exists "read org ai visibility questions" on public.ai_visibility_questions;
drop policy if exists "write org ai visibility questions" on public.ai_visibility_questions;
drop policy if exists "read org ai visibility observations" on public.ai_visibility_observations;
drop policy if exists "write org ai visibility observations" on public.ai_visibility_observations;

create policy "read org ai visibility questions" on public.ai_visibility_questions for select
using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org ai visibility questions" on public.ai_visibility_questions for all
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org ai visibility observations" on public.ai_visibility_observations for select
using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org ai visibility observations" on public.ai_visibility_observations for all
using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
