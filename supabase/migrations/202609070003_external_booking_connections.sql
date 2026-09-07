-- Issue #136: store-scoped onboarding and status tracking for external booking providers.
-- Provider credentials are deliberately not stored until a documented adapter can validate them.

create table if not exists public.external_booking_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider_key text not null check (provider_key in (
    'minimo', 'hotpepper_beauty', 'rakuten_beauty', 'epark',
    'ozmall', 'ekiten', 'reserva', 'stores_reservation'
  )),
  connection_mode text not null check (connection_mode in (
    'official_read_api', 'contract_api', 'partner_inquiry', 'file_import'
  )),
  status text not null default 'preparing' check (status in (
    'preparing', 'awaiting_provider', 'credentials_required',
    'connection_test_required', 'connected_read_only', 'paused', 'error'
  )),
  external_account_label text,
  external_store_id text,
  contracted_plan text,
  notes text,
  owner_authorized_at timestamptz not null,
  owner_authorized_by uuid references auth.users(id) on delete set null,
  application_requested_at timestamptz,
  credentials_received_at timestamptz,
  connection_tested_at timestamptz,
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  sync_enabled boolean not null default false,
  read_only boolean not null default true check (read_only),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_booking_connections_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists external_booking_connections_store_provider_active_uidx
  on public.external_booking_connections(store_id, provider_key) where archived_at is null;
create index if not exists external_booking_connections_store_status_idx
  on public.external_booking_connections(store_id, status, updated_at desc) where archived_at is null;

alter table public.external_booking_connections enable row level security;

-- Pages and Server Actions use the service role only after the shared store authorization check.
-- Direct browser access is denied even to authenticated users, including unaffiliated users.
revoke all on public.external_booking_connections from public, anon, authenticated;
grant all on public.external_booking_connections to service_role;
