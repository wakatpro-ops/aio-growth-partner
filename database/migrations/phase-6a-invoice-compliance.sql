alter table public.invoices add column if not exists invoice_registration_number text;
alter table public.invoices add column if not exists qualified_invoice_issuer_name text;
alter table public.invoices add column if not exists transaction_date date;
alter table public.invoices add column if not exists invoice_sequence_number integer;
alter table public.invoices add column if not exists invoice_number_prefix text;
alter table public.invoices add column if not exists tax_10_subtotal numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_10_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_8_subtotal numeric(12,2) default 0;
alter table public.invoices add column if not exists tax_8_amount numeric(12,2) default 0;
alter table public.invoices add column if not exists payment_status text default 'unpaid';
alter table public.invoices add column if not exists payment_method text;
alter table public.invoices add column if not exists issued_at timestamptz;
alter table public.invoices add column if not exists last_pdf_issued_at timestamptz;

create table if not exists public.invoice_number_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  prefix text not null default 'INV',
  next_number integer not null default 1,
  registration_number text,
  qualified_invoice_issuer_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id)
);

create table if not exists public.invoice_tax_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  tax_rate numeric(5,2) not null,
  taxable_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

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

create table if not exists public.invoice_pdf_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_number text not null,
  issue_type text not null default 'issue',
  file_name text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  issued_by uuid references auth.users(id) on delete set null,
  issued_at timestamptz not null default now()
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

create table if not exists public.subsidy_impact_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  target_month text,
  metrics jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.invoice_number_sequences enable row level security;
alter table public.invoice_tax_lines enable row level security;
alter table public.orders enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_pdf_issues enable row level security;
alter table public.audit_logs enable row level security;
alter table public.accounting_exports enable row level security;
alter table public.integration_configs enable row level security;
alter table public.subsidy_impact_reports enable row level security;

create index if not exists invoice_number_sequences_store_id_idx on public.invoice_number_sequences(store_id);
create index if not exists invoice_tax_lines_invoice_id_idx on public.invoice_tax_lines(invoice_id);
create index if not exists orders_store_id_idx on public.orders(store_id);
create index if not exists payments_store_id_idx on public.payments(store_id);
create index if not exists invoice_pdf_issues_store_id_idx on public.invoice_pdf_issues(store_id);
create index if not exists audit_logs_store_id_idx on public.audit_logs(store_id);
create index if not exists accounting_exports_store_id_idx on public.accounting_exports(store_id);
create index if not exists integration_configs_store_id_idx on public.integration_configs(store_id);
create index if not exists subsidy_impact_reports_store_id_idx on public.subsidy_impact_reports(store_id);

drop policy if exists "read org invoice number sequences" on public.invoice_number_sequences;
drop policy if exists "write org invoice number sequences" on public.invoice_number_sequences;
drop policy if exists "read org invoice tax lines" on public.invoice_tax_lines;
drop policy if exists "write org invoice tax lines" on public.invoice_tax_lines;
drop policy if exists "read org orders" on public.orders;
drop policy if exists "write org orders" on public.orders;
drop policy if exists "read org order status logs" on public.order_status_logs;
drop policy if exists "write org order status logs" on public.order_status_logs;
drop policy if exists "read org payments" on public.payments;
drop policy if exists "write org payments" on public.payments;
drop policy if exists "read org invoice pdf issues" on public.invoice_pdf_issues;
drop policy if exists "write org invoice pdf issues" on public.invoice_pdf_issues;
drop policy if exists "read org audit logs" on public.audit_logs;
drop policy if exists "write org audit logs" on public.audit_logs;
drop policy if exists "read org accounting exports" on public.accounting_exports;
drop policy if exists "write org accounting exports" on public.accounting_exports;
drop policy if exists "read org integration configs" on public.integration_configs;
drop policy if exists "write org integration configs" on public.integration_configs;
drop policy if exists "read org subsidy impact reports" on public.subsidy_impact_reports;
drop policy if exists "write org subsidy impact reports" on public.subsidy_impact_reports;

create policy "read org invoice number sequences" on public.invoice_number_sequences for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org invoice number sequences" on public.invoice_number_sequences for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org orders" on public.orders for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org orders" on public.orders for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org order status logs" on public.order_status_logs for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org order status logs" on public.order_status_logs for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org payments" on public.payments for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org payments" on public.payments for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org invoice pdf issues" on public.invoice_pdf_issues for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org invoice pdf issues" on public.invoice_pdf_issues for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org audit logs" on public.audit_logs for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org audit logs" on public.audit_logs for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org accounting exports" on public.accounting_exports for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org accounting exports" on public.accounting_exports for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org integration configs" on public.integration_configs for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org integration configs" on public.integration_configs for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org subsidy impact reports" on public.subsidy_impact_reports for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org subsidy impact reports" on public.subsidy_impact_reports for all using (public.is_org_member(organization_id) or public.is_platform_admin()) with check (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "read org invoice tax lines" on public.invoice_tax_lines for select using (exists (select 1 from public.invoices where invoices.id = invoice_tax_lines.invoice_id and (public.is_org_member(invoices.organization_id) or public.is_platform_admin())));
create policy "write org invoice tax lines" on public.invoice_tax_lines for all using (exists (select 1 from public.invoices where invoices.id = invoice_tax_lines.invoice_id and (public.is_org_member(invoices.organization_id) or public.is_platform_admin()))) with check (exists (select 1 from public.invoices where invoices.id = invoice_tax_lines.invoice_id and (public.is_org_member(invoices.organization_id) or public.is_platform_admin())));

insert into public.modules (key, name, description, category, is_core)
values
  ('invoice_compliance', 'インボイス対応請求書', '登録番号、税率別内訳、取引年月日を含む請求書管理です。', 'accounting', false),
  ('invoice_numbering', '請求書番号連番管理', '店舗ごとに請求書番号を連番管理します。', 'accounting', false),
  ('tax_rate_breakdown', '税率別内訳', '10%と8%の対象額、消費税額を管理します。', 'accounting', false),
  ('order_workflow', '受注・作業フロー', '見積、受注、作業完了、請求、入金の流れを管理します。', 'operations', false),
  ('payment_management', '入金管理', '入金状態と支払方法を管理します。', 'payment', false),
  ('accounting_csv_export', '会計CSV出力', '請求・税額・入金状態をCSV出力します。', 'accounting', false),
  ('pdf_issue_logs', 'PDF発行履歴', '請求書PDFの発行、再発行履歴を残します。', 'audit', false),
  ('audit_logs', '操作ログ', '請求、入金、CSV出力などの操作証跡を残します。', 'audit', false),
  ('subsidy_impact_report', '導入効果レポート', '電子化、売上管理、入金管理、AI活用件数を可視化します。', 'report', false),
  ('invoice_tool_map', '補助金対応機能マップ', '会計・受発注・決済・データ連携・AI活用・証跡を説明しやすく整理します。', 'report', false)
on conflict (key) do update set name = excluded.name, description = excluded.description, category = excluded.category, is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('invoice_compliance','invoice_numbering','tax_rate_breakdown','order_workflow','payment_management','accounting_csv_export','pdf_issue_logs','audit_logs','subsidy_impact_report','invoice_tool_map')
on conflict (industry_type_key, module_key) do update set is_enabled = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"invoice_compliance":true,"invoice_numbering":true,"tax_rate_breakdown":true,"order_workflow":true,"payment_management":true,"accounting_csv_export":true,"pdf_issue_logs":true,"audit_logs":true,"subsidy_impact_report":true,"invoice_tool_map":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"invoice_compliance":true,"invoice_numbering":true,"tax_rate_breakdown":true,"order_workflow":true,"payment_management":true,"accounting_csv_export":true,"pdf_issue_logs":true,"audit_logs":true,"subsidy_impact_report":true,"invoice_tool_map":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

insert into public.invoice_number_sequences (organization_id, store_id, prefix, next_number, registration_number, qualified_invoice_issuer_name)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'INV', 2, null, 'AIOサンプル店舗'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'INV-AUTO', 2, null, 'AIOオート整備')
on conflict (store_id) do nothing;
