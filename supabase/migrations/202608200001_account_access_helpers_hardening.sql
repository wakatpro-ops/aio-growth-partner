-- Issue #35: make every results read/write helper enforce active account, membership and organization state.

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = auth.uid()
      and profile.role = 'platform_admin'
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    join public.user_profiles profile on profile.user_id = member.user_id
    where member.organization_id = org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.archived_at is null
      and organization.status = 'active'
      and organization.archived_at is null
      and profile.status = 'active'
      and profile.archived_at is null
  );
$$;
