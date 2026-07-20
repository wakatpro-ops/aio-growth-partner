create table if not exists public.platform_billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  billing_email text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.platform_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_customer_id uuid references public.platform_billing_customers(id) on delete set null,
  plan_key text references public.plans(key),
  provider text not null default 'stripe',
  provider_subscription_id text,
  status text not null default 'manual',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.store_payment_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null default 'stripe',
  connection_type text not null default 'stripe_connect',
  status text not null default 'not_connected',
  external_account_id text,
  account_name text,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

create table if not exists public.store_accounting_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected',
  external_company_id text,
  office_name text,
  scopes text[] not null default '{}',
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider)
);

create table if not exists public.store_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  provider text not null default 'stripe',
  external_payment_intent_id text,
  external_checkout_session_id text,
  external_charge_id text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'jpy',
  status text not null default 'pending',
  customer_email text,
  paid_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, external_payment_intent_id)
);

create table if not exists public.accounting_export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null,
  provider text not null,
  export_type text not null default 'journal_entries',
  status text not null default 'pending',
  target_period_start date,
  target_period_end date,
  row_count integer not null default 0,
  file_name text,
  storage_path text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.platform_billing_customers enable row level security;
alter table public.platform_subscriptions enable row level security;
alter table public.store_payment_integrations enable row level security;
alter table public.store_accounting_integrations enable row level security;
alter table public.store_payment_transactions enable row level security;
alter table public.accounting_export_jobs enable row level security;

create index if not exists platform_billing_customers_org_idx on public.platform_billing_customers(organization_id);
create index if not exists platform_subscriptions_org_idx on public.platform_subscriptions(organization_id);
create index if not exists store_payment_integrations_store_id_idx on public.store_payment_integrations(store_id);
create index if not exists store_accounting_integrations_store_id_idx on public.store_accounting_integrations(store_id);
create index if not exists store_payment_transactions_store_id_idx on public.store_payment_transactions(store_id);
create index if not exists accounting_export_jobs_store_id_idx on public.accounting_export_jobs(store_id);

drop policy if exists "read org platform billing customers" on public.platform_billing_customers;
drop policy if exists "write admin platform billing customers" on public.platform_billing_customers;
drop policy if exists "read org platform subscriptions" on public.platform_subscriptions;
drop policy if exists "write admin platform subscriptions" on public.platform_subscriptions;
drop policy if exists "read org store payment integrations" on public.store_payment_integrations;
drop policy if exists "write org store payment integrations" on public.store_payment_integrations;
drop policy if exists "read org store accounting integrations" on public.store_accounting_integrations;
drop policy if exists "write org store accounting integrations" on public.store_accounting_integrations;
drop policy if exists "read org store payment transactions" on public.store_payment_transactions;
drop policy if exists "write org store payment transactions" on public.store_payment_transactions;
drop policy if exists "read org accounting export jobs" on public.accounting_export_jobs;
drop policy if exists "write org accounting export jobs" on public.accounting_export_jobs;

create policy "read org platform billing customers" on public.platform_billing_customers
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write admin platform billing customers" on public.platform_billing_customers
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "read org platform subscriptions" on public.platform_subscriptions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write admin platform subscriptions" on public.platform_subscriptions
for all using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "read org store payment integrations" on public.store_payment_integrations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org store payment integrations" on public.store_payment_integrations
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org store accounting integrations" on public.store_accounting_integrations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org store accounting integrations" on public.store_accounting_integrations
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org store payment transactions" on public.store_payment_transactions
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org store payment transactions" on public.store_payment_transactions
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org accounting export jobs" on public.accounting_export_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org accounting export jobs" on public.accounting_export_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category)
values
  ('platform_billing', 'AIO運営側課金', 'AIO boostのSaaS利用料を管理するStripe課金です。店舗側決済とは分離します。', 'billing'),
  ('store_stripe_connect', '店舗側Stripe Connect', '各店舗が自分のStripeアカウントを接続し、店舗のお客様から決済を受けるための拡張枠です。', 'integration'),
  ('store_accounting_integration', '店舗側会計連携', '各店舗が自分のfreee、マネーフォワード等の事業所へ会計データを送るための拡張枠です。', 'integration'),
  ('accounting_export_jobs', '会計連携ジョブ', 'freee等への送信履歴、CSV出力履歴、エラーを店舗ごとに管理します。', 'accounting')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category;

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'platform_billing_model', '"aio_saas_subscription"'),
  ('starter', 'store_payment_integrations', '["stripe_connect"]'),
  ('starter', 'store_accounting_integrations', '["freee","money_forward"]')
on conflict (plan_key, limit_key) do update
set limit_value = excluded.limit_value,
    updated_at = now();
