-- Issue #42: store creation discoverability and store-scoped staff accounts.

create table if not exists public.store_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role_key text not null default 'staff'
    check (role_key in ('store_manager', 'staff', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  invitation_status text not null default 'pending'
    check (invitation_status in ('pending', 'sent', 'accepted', 'failed')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_sent_at timestamptz,
  email_status text,
  email_error text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_memberships_store_org_fkey
    foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  constraint store_memberships_store_user_key unique (store_id, user_id)
);

create unique index if not exists store_memberships_store_email_active_key
  on public.store_memberships(store_id, lower(email))
  where archived_at is null;
create index if not exists store_memberships_user_active_idx
  on public.store_memberships(user_id, store_id)
  where archived_at is null and status = 'active';
create index if not exists store_memberships_store_idx
  on public.store_memberships(store_id, created_at desc);

alter table public.store_memberships enable row level security;

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    join public.user_profiles profile on profile.user_id = member.user_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.role_key = 'org_owner'
      and member.status = 'active'
      and member.archived_at is null
      and organization.status = 'active'
      and organization.archived_at is null
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;

create or replace function public.is_store_member(target_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_memberships membership
    join public.stores store on store.id = membership.store_id
      and store.organization_id = membership.organization_id
    join public.organizations organization on organization.id = membership.organization_id
    join public.user_profiles profile on profile.user_id = membership.user_id
    where membership.store_id = target_store_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.archived_at is null
      and store.status = 'active'
      and store.archived_at is null
      and organization.status = 'active'
      and organization.archived_at is null
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;

create or replace function public.is_store_editor(target_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_memberships membership
    join public.stores store on store.id = membership.store_id
      and store.organization_id = membership.organization_id
    join public.organizations organization on organization.id = membership.organization_id
    join public.user_profiles profile on profile.user_id = membership.user_id
    where membership.store_id = target_store_id
      and membership.user_id = auth.uid()
      and membership.role_key in ('store_manager', 'staff')
      and membership.status = 'active'
      and membership.archived_at is null
      and store.status = 'active'
      and store.archived_at is null
      and organization.status = 'active'
      and organization.archived_at is null
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;

drop policy if exists "read own or owner store memberships" on public.store_memberships;
drop policy if exists "manage owner store memberships" on public.store_memberships;
create policy "read own or owner store memberships" on public.store_memberships
  for select using (
    user_id = auth.uid()
    or public.is_org_owner(organization_id)
    or public.is_platform_admin()
  );
create policy "manage owner store memberships" on public.store_memberships
  for all using (public.is_org_owner(organization_id) or public.is_platform_admin())
  with check (public.is_org_owner(organization_id) or public.is_platform_admin());

drop policy if exists "read org stores" on public.stores;
drop policy if exists "write org stores" on public.stores;
create policy "read permitted stores" on public.stores
  for select using (
    public.is_org_member(organization_id)
    or public.is_store_member(id)
    or public.is_platform_admin()
  );
create policy "owners write stores" on public.stores
  for all using (public.is_org_owner(organization_id) or public.is_platform_admin())
  with check (public.is_org_owner(organization_id) or public.is_platform_admin());

revoke all on function public.is_org_owner(uuid) from public, anon;
revoke all on function public.is_store_member(uuid) from public, anon;
revoke all on function public.is_store_editor(uuid) from public, anon;
grant execute on function public.is_org_owner(uuid) to authenticated, service_role;
grant execute on function public.is_store_member(uuid) to authenticated, service_role;
grant execute on function public.is_store_editor(uuid) to authenticated, service_role;

