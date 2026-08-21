-- Primary business records are archived instead of physically deleted.
-- archived_at IS NULL means the record is available in normal operations.

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

alter table public.items add column if not exists archived_at timestamptz;
alter table public.items add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.customers add column if not exists archived_at timestamptz;
alter table public.customers add column if not exists archived_by uuid references auth.users(id) on delete set null;

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
create index if not exists stores_active_idx on public.stores(organization_id, created_at desc) where archived_at is null;
create index if not exists items_active_idx on public.items(store_id, created_at desc) where archived_at is null;
create index if not exists customers_active_idx on public.customers(store_id, created_at desc) where archived_at is null;
create index if not exists estimates_active_idx on public.estimates(store_id, created_at desc) where archived_at is null;
create index if not exists invoices_active_idx on public.invoices(store_id, created_at desc) where archived_at is null;
create index if not exists orders_active_idx on public.orders(store_id, created_at desc) where archived_at is null;
create index if not exists data_import_jobs_active_idx on public.data_import_jobs(store_id, created_at desc) where archived_at is null;
create index if not exists marketing_drafts_active_idx on public.marketing_drafts(store_id, created_at desc) where archived_at is null;
create index if not exists growth_actions_active_idx on public.growth_actions(store_id, created_at desc) where archived_at is null;
create index if not exists expense_receipts_active_idx on public.expense_receipts(store_id, created_at desc) where archived_at is null;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where user_id = auth.uid()
      and role = 'platform_admin'
      and status = 'active'
      and archived_at is null
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
