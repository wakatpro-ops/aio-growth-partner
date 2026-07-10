create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  order_number text not null,
  title text not null,
  status text not null default 'ordered',
  work_status text not null default 'not_started',
  ordered_at date,
  completed_at date,
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, order_number)
);

create table if not exists public.order_status_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  comment text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_pdf_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_number text not null,
  issue_type text not null default 'issue',
  reissue_reason text,
  file_name text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_date date not null default current_date,
  amount numeric(12,2) not null default 0,
  payment_method text not null default 'bank_transfer',
  status text not null default 'received',
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_type text not null,
  target_id uuid,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  export_type text not null default 'invoice_csv',
  file_name text,
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.subsidy_impact_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists work_status text default 'not_started';
alter table public.invoice_pdf_issues add column if not exists reissue_reason text;

create table if not exists public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  provider text not null,
  integration_type text not null,
  status text not null default 'planned',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, provider, integration_type)
);

alter table public.integration_configs enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.invoice_pdf_issues enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.accounting_exports enable row level security;
alter table public.subsidy_impact_reports enable row level security;

create index if not exists orders_store_id_idx on public.orders(store_id);
create index if not exists order_status_logs_store_id_idx on public.order_status_logs(store_id);
create index if not exists invoice_pdf_issues_store_id_idx on public.invoice_pdf_issues(store_id);
create index if not exists payments_store_id_idx on public.payments(store_id);
create index if not exists audit_logs_store_id_idx on public.audit_logs(store_id);
create index if not exists accounting_exports_store_id_idx on public.accounting_exports(store_id);
create index if not exists subsidy_impact_reports_store_id_idx on public.subsidy_impact_reports(store_id);
create index if not exists integration_configs_store_id_idx on public.integration_configs(store_id);

drop policy if exists "read org orders" on public.orders;
drop policy if exists "write org orders" on public.orders;
drop policy if exists "read org order status logs" on public.order_status_logs;
drop policy if exists "write org order status logs" on public.order_status_logs;
drop policy if exists "read org invoice pdf issues" on public.invoice_pdf_issues;
drop policy if exists "write org invoice pdf issues" on public.invoice_pdf_issues;
drop policy if exists "read org payments" on public.payments;
drop policy if exists "write org payments" on public.payments;
drop policy if exists "read org audit logs" on public.audit_logs;
drop policy if exists "write org audit logs" on public.audit_logs;
drop policy if exists "read org accounting exports" on public.accounting_exports;
drop policy if exists "write org accounting exports" on public.accounting_exports;
drop policy if exists "read org subsidy impact reports" on public.subsidy_impact_reports;
drop policy if exists "write org subsidy impact reports" on public.subsidy_impact_reports;
drop policy if exists "read org integration configs" on public.integration_configs;
drop policy if exists "write org integration configs" on public.integration_configs;

create policy "read org orders" on public.orders
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org orders" on public.orders
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org order status logs" on public.order_status_logs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org order status logs" on public.order_status_logs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org invoice pdf issues" on public.invoice_pdf_issues
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org invoice pdf issues" on public.invoice_pdf_issues
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org payments" on public.payments
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org payments" on public.payments
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org audit logs" on public.audit_logs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org audit logs" on public.audit_logs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org accounting exports" on public.accounting_exports
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org accounting exports" on public.accounting_exports
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org subsidy impact reports" on public.subsidy_impact_reports
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org subsidy impact reports" on public.subsidy_impact_reports
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org integration configs" on public.integration_configs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org integration configs" on public.integration_configs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values
  ('invoice_compliance', 'インボイス対応請求書', '登録番号、税率別内訳、取引年月日を含む請求書管理です。', 'accounting', false),
  ('order_management', '受注管理', '見積から受注、作業完了、請求化までを管理します。', 'operations', false),
  ('payment_management', '入金管理', '入金状態と支払方法を管理します。', 'payment', false),
  ('accounting_export', '会計・売上CSV出力', '売上日、税率、入金状態を含む汎用CSVを出力します。', 'accounting', false),
  ('audit_log', '証跡管理', '重要操作、ステータス変更、出力履歴を確認します。', 'audit', false),
  ('subsidy_impact_report', '導入効果レポート', '電子化、売上管理、入金管理、AI活用件数を可視化します。', 'report', false),
  ('future_accounting_integrations', '将来の会計・決済連携', 'freee、マネーフォワード、Stripeへの将来拡張枠です。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('invoice_compliance','order_management','payment_management','accounting_export','audit_log','subsidy_impact_report','future_accounting_integrations')
on conflict (industry_type_key, module_key) do update set is_enabled = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"invoice_compliance":true,"order_management":true,"payment_management":true,"accounting_export":true,"audit_log":true,"subsidy_impact_report":true,"future_accounting_integrations":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"invoice_compliance":true,"order_management":true,"payment_management":true,"accounting_export":true,"audit_log":true,"subsidy_impact_report":true,"future_accounting_integrations":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

insert into public.integration_configs (organization_id, store_id, provider, integration_type, status, settings)
select stores.organization_id, stores.id, provider.provider, provider.integration_type, 'planned', '{}'::jsonb
from public.stores
cross join (
  values
    ('freee', 'accounting'),
    ('money_forward', 'accounting'),
    ('stripe', 'payment')
) as provider(provider, integration_type)
where stores.status = 'active'
on conflict (store_id, provider, integration_type) do nothing;

insert into public.plan_limits (plan_key, limit_key, limit_value)
values ('starter', 'phase5e_invoice_business_modules', '["invoice_compliance","order_management","payment_management","accounting_export","audit_log","subsidy_impact_report","future_accounting_integrations"]')
on conflict (plan_key, limit_key) do update set limit_value = excluded.limit_value;
