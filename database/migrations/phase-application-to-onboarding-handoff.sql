alter table public.applications add column if not exists approved_organization_id uuid references public.organizations(id) on delete set null;
alter table public.applications add column if not exists approved_store_id uuid references public.stores(id) on delete set null;
alter table public.applications add column if not exists approved_user_id uuid references auth.users(id) on delete set null;

alter table public.stores add column if not exists source_application_id uuid references public.applications(id) on delete set null;

create index if not exists stores_source_application_idx
  on public.stores(source_application_id);

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

create index if not exists onboarding_snapshots_store_idx
  on public.onboarding_snapshots(store_id);

create index if not exists onboarding_snapshots_application_idx
  on public.onboarding_snapshots(application_id);

alter table public.onboarding_snapshots enable row level security;

drop policy if exists "read org onboarding snapshots" on public.onboarding_snapshots;
drop policy if exists "write org onboarding snapshots" on public.onboarding_snapshots;

create policy "read org onboarding snapshots" on public.onboarding_snapshots
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org onboarding snapshots" on public.onboarding_snapshots
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

