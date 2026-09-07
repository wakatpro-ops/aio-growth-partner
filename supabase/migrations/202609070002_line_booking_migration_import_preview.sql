-- Issue #141: privacy-scoped import preview rows for existing LINE reservations.

alter table public.line_booking_migrations
  add column if not exists import_file_name text,
  add column if not exists import_batch_id uuid,
  add column if not exists import_row_count integer not null default 0 check (import_row_count between 0 and 5000),
  add column if not exists import_valid_row_count integer not null default 0 check (import_valid_row_count between 0 and 5000),
  add column if not exists imported_booking_count integer not null default 0 check (imported_booking_count between 0 and 5000);

create table if not exists public.line_booking_migration_import_rows (
  id uuid primary key default gen_random_uuid(),
  migration_id uuid not null references public.line_booking_migrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  import_batch_id uuid not null,
  row_number integer not null check (row_number between 1 and 5001),
  row_status text not null default 'preview' check (row_status in ('preview','invalid','imported')),
  normalized_data jsonb not null default '{}'::jsonb,
  error_message text,
  imported_booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_booking_migration_rows_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  unique (migration_id, import_batch_id, row_number)
);

create index if not exists line_booking_migration_rows_batch_idx
  on public.line_booking_migration_import_rows(migration_id, import_batch_id, row_number);

alter table public.line_booking_migration_import_rows enable row level security;

create policy "read editable line booking migration rows"
on public.line_booking_migration_import_rows for select using (
  public.is_platform_admin()
  or public.is_org_editor(organization_id)
  or public.is_store_editor(store_id)
);

revoke all on public.line_booking_migration_import_rows from anon, authenticated;
grant select on public.line_booking_migration_import_rows to authenticated;
grant all on public.line_booking_migration_import_rows to service_role;

comment on table public.line_booking_migration_import_rows is
  'Normalized preview rows for a store-scoped LINE reservation migration. Raw files and credentials are not stored.';
