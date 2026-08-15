alter table public.store_payment_transactions add column if not exists idempotency_key text;
alter table public.store_payment_transactions add column if not exists event_created_at timestamptz;
alter table public.store_payment_transactions add column if not exists last_event_id text;
alter table public.store_payment_transactions add column if not exists amount_refunded numeric(12,2) not null default 0;
alter table public.store_payment_transactions add column if not exists refunded_at timestamptz;
alter table public.store_payment_transactions add column if not exists failure_message text;
alter table public.store_payment_transactions add column if not exists disputed_at timestamptz;

create unique index if not exists store_payment_transactions_checkout_session_uidx
  on public.store_payment_transactions(store_id, provider, external_checkout_session_id)
  where external_checkout_session_id is not null;
create unique index if not exists store_payment_transactions_idempotency_uidx
  on public.store_payment_transactions(store_id, provider, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists payments_external_provider_id_uidx
  on public.payments(store_id, external_provider, external_payment_id)
  where external_provider is not null and external_payment_id is not null;

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  connected_account_id text,
  event_type text not null,
  livemode boolean not null default false,
  event_created_at timestamptz,
  payload_sha256 text not null,
  processing_status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  payment_transaction_id uuid references public.store_payment_transactions(id) on delete set null,
  receipt_number text not null,
  amount numeric(12,2) not null,
  currency text not null default 'jpy',
  issued_to text,
  payment_method text not null default 'stripe',
  status text not null default 'issued',
  original_issued_at timestamptz not null default now(),
  last_issued_at timestamptz not null default now(),
  last_sent_at timestamptz,
  public_token_hash text,
  public_token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, receipt_number),
  unique (payment_transaction_id)
);

create table if not exists public.payment_receipt_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  receipt_id uuid not null references public.payment_receipts(id) on delete restrict,
  issue_type text not null default 'issue',
  reissue_reason text,
  recipient_email text,
  delivery_status text,
  provider_message_id text,
  error_message text,
  issued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payment_receipts_invoice_idx on public.payment_receipts(store_id, invoice_id, created_at desc);
create index if not exists payment_receipt_issues_receipt_idx on public.payment_receipt_issues(receipt_id, created_at desc);

alter table public.stripe_webhook_events enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.payment_receipt_issues enable row level security;

drop policy if exists "platform admin reads stripe webhook events" on public.stripe_webhook_events;
create policy "platform admin reads stripe webhook events" on public.stripe_webhook_events for select using (public.is_platform_admin());
drop policy if exists "read org payment receipts" on public.payment_receipts;
create policy "read org payment receipts" on public.payment_receipts for select using (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists "write org payment receipts" on public.payment_receipts;
create policy "write org payment receipts" on public.payment_receipts for all using (public.is_org_editor(organization_id) or public.is_platform_admin()) with check (public.is_org_editor(organization_id) or public.is_platform_admin());
drop policy if exists "read org payment receipt issues" on public.payment_receipt_issues;
create policy "read org payment receipt issues" on public.payment_receipt_issues for select using (public.is_org_member(organization_id) or public.is_platform_admin());
drop policy if exists "write org payment receipt issues" on public.payment_receipt_issues;
create policy "write org payment receipt issues" on public.payment_receipt_issues for all using (public.is_org_editor(organization_id) or public.is_platform_admin()) with check (public.is_org_editor(organization_id) or public.is_platform_admin());
