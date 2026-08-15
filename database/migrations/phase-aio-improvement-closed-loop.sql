-- AIO improvement closed loop: goals, managed improvements, publication checks, and re-diagnosis history.

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

create index if not exists aio_improvement_tasks_store_status_idx
  on public.aio_improvement_tasks(store_id, status, due_date)
  where archived_at is null;
create index if not exists aio_improvement_tasks_publication_idx
  on public.aio_improvement_tasks(store_id, publication_status, next_review_at)
  where archived_at is null;
create index if not exists aio_readiness_snapshots_store_created_idx
  on public.aio_readiness_snapshots(store_id, created_at desc);

alter table public.aio_goals enable row level security;
alter table public.aio_improvement_tasks enable row level security;
alter table public.aio_readiness_snapshots enable row level security;

drop policy if exists "read org aio goals" on public.aio_goals;
drop policy if exists "write org aio goals" on public.aio_goals;
drop policy if exists "read org aio improvement tasks" on public.aio_improvement_tasks;
drop policy if exists "write org aio improvement tasks" on public.aio_improvement_tasks;
drop policy if exists "read org aio readiness snapshots" on public.aio_readiness_snapshots;
drop policy if exists "write org aio readiness snapshots" on public.aio_readiness_snapshots;

create policy "read org aio goals" on public.aio_goals
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org aio goals" on public.aio_goals
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org aio improvement tasks" on public.aio_improvement_tasks
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org aio improvement tasks" on public.aio_improvement_tasks
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org aio readiness snapshots" on public.aio_readiness_snapshots
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org aio readiness snapshots" on public.aio_readiness_snapshots
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values ('aio_improvement_loop', 'AIO改善サイクル', '目標質問、改善実行、公開確認、再診断、履歴を一つにつなぎます。', 'ai', true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select key, 'aio_improvement_loop', true
from public.industry_types
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"aio_improvement_loop":true}'::jsonb;

update public.stores
set feature_flags = feature_flags || '{"aio_improvement_loop":true}'::jsonb;
