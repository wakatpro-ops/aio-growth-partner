-- Issue #141: store-scoped workflow for moving an existing LINE reservation operation.
-- Secrets and credentials must never be stored in this table.

create table if not exists public.line_booking_migrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  current_provider_name text not null check (char_length(btrim(current_provider_name)) between 1 and 200),
  official_account_name text,
  official_account_basic_id text,
  admin_access_status text not null default 'unknown'
    check (admin_access_status in ('confirmed','needs_owner','unknown')),
  export_method text not null default 'unknown'
    check (export_method in ('api','csv','manual','none','unknown')),
  data_preparation_status text not null default 'not_started'
    check (data_preparation_status in ('not_started','export_ready','manual_ready','no_data')),
  open_booking_count integer check (open_booking_count between 0 and 1000000),
  target_cutover_at timestamptz,
  rollback_plan text,
  notes text,
  stage text not null default 'assessment'
    check (stage in ('assessment','data_preparation','test','cutover','completed','rolled_back')),
  data_prepared_at timestamptz,
  test_confirmed_at timestamptz,
  cutover_requested_at timestamptz,
  completed_at timestamptz,
  rolled_back_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_booking_migrations_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists line_booking_migrations_store_active_uidx
  on public.line_booking_migrations(store_id) where archived_at is null;
create index if not exists line_booking_migrations_org_stage_idx
  on public.line_booking_migrations(organization_id, stage, updated_at desc) where archived_at is null;

alter table public.line_booking_migrations enable row level security;

create policy "read editable line booking migrations"
on public.line_booking_migrations for select using (
  public.is_platform_admin()
  or public.is_org_editor(organization_id)
  or public.is_store_editor(store_id)
);

revoke all on public.line_booking_migrations from anon, authenticated;
grant select on public.line_booking_migrations to authenticated;
grant all on public.line_booking_migrations to service_role;

comment on table public.line_booking_migrations is
  'Store-scoped, non-secret migration plans for moving an existing LINE reservation operation to AIO boost.';
