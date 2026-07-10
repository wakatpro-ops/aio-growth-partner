alter table public.invoices add column if not exists stripe_payment_url text;
alter table public.invoices add column if not exists stripe_payment_status text default 'not_created';
alter table public.invoices add column if not exists stripe_payment_id text;

alter table public.payments add column if not exists external_provider text;
alter table public.payments add column if not exists external_payment_id text;
alter table public.payments add column if not exists external_payment_url text;

alter table public.store_payment_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_payment_integrations add column if not exists error_message text;
alter table public.store_payment_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.store_accounting_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_accounting_integrations add column if not exists error_message text;
alter table public.store_accounting_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.accounting_export_jobs add column if not exists download_url text;
alter table public.accounting_export_jobs add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists store_payment_transactions_invoice_id_idx on public.store_payment_transactions(invoice_id);
create index if not exists accounting_export_jobs_provider_idx on public.accounting_export_jobs(provider);

insert into public.modules (key, name, description, category)
values
  ('store_integrations', '店舗外部連携', '店舗自身のStripe、freee、会計・決済連携を管理します。AIO運営課金とは分離します。', 'integration'),
  ('manual_stripe_payment_links', 'Stripe手動決済リンク', '請求書ごとに店舗Stripeの決済URLを手動登録し、入金管理へつなげます。', 'payment'),
  ('freee_csv_export', 'freee向けCSV出力', '請求、入金、外部売上データをfreee取り込み向けCSVとして出力します。', 'accounting')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category;

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'store_integrations_manual_modules', '["store_integrations","store_stripe_connect","manual_stripe_payment_links","store_accounting_integration","freee_csv_export"]')
on conflict (plan_key, limit_key) do update
set limit_value = excluded.limit_value,
    updated_at = now();

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'store_integrations', true),
  ('auto_repair', 'store_integrations', true),
  ('general_store', 'manual_stripe_payment_links', true),
  ('auto_repair', 'manual_stripe_payment_links', true),
  ('general_store', 'freee_csv_export', true),
  ('auto_repair', 'freee_csv_export', true)
on conflict (industry_type_key, module_key) do update
set is_enabled = excluded.is_enabled;

update public.industry_types
set default_feature_flags = coalesce(default_feature_flags, '{}'::jsonb) || '{"store_integrations":true,"manual_stripe_payment_links":true,"freee_csv_export":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = coalesce(feature_flags, '{}'::jsonb) || '{"store_integrations":true,"manual_stripe_payment_links":true,"freee_csv_export":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');
