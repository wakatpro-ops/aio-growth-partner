-- Phase Store-Integrations-B: 店舗側Stripe Connect OAuth
-- 既存データを消さず、再実行しても安全な差分です。

alter table public.store_payment_integrations add column if not exists access_token_encrypted text;
alter table public.store_payment_integrations add column if not exists refresh_token_encrypted text;
alter table public.store_payment_integrations add column if not exists token_expires_at timestamptz;
alter table public.store_payment_integrations add column if not exists scopes text[] not null default '{}'::text[];
alter table public.store_payment_integrations add column if not exists connected_at timestamptz;
alter table public.store_payment_integrations add column if not exists disconnected_at timestamptz;
alter table public.store_payment_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_payment_integrations add column if not exists error_message text;
alter table public.store_payment_integrations add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.store_payment_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists store_payment_integrations_status_idx
  on public.store_payment_integrations(store_id, provider, status, updated_at desc);

insert into public.modules (key, name, description, category, is_core)
values
  ('store_stripe_connect', '店舗側Stripe Connect', '各店舗が自分のStripeアカウントを接続し、店舗のお客様から決済を受けるための連携です。', 'integration', false),
  ('stripe_connect_oauth', 'Stripe Connect OAuth', '店舗ごとのStripeアカウント接続、接続状態保存、接続解除を行います。', 'integration', false),
  ('stripe_webhook_payments', 'Stripe Webhook入金反映', 'Stripe決済結果をWebhookで受け取り、入金管理へ反映する将来拡張です。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('store_stripe_connect', 'stripe_connect_oauth')
on conflict (industry_type_key, module_key) do update set is_enabled = true;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, false
from public.industry_types industry
cross join public.modules module
where module.key in ('stripe_webhook_payments')
on conflict (industry_type_key, module_key) do update set is_enabled = false;

update public.industry_types
set default_feature_flags = coalesce(default_feature_flags, '{}'::jsonb)
  || '{"store_stripe_connect":true,"stripe_connect_oauth":true,"stripe_webhook_payments":false}'::jsonb;

update public.stores
set feature_flags = coalesce(feature_flags, '{}'::jsonb)
  || '{"store_stripe_connect":true,"stripe_connect_oauth":true,"stripe_webhook_payments":false}'::jsonb;

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'store_payment_integrations', '["stripe_connect"]'),
  ('starter', 'stripe_connect_mode', '"direct_charges"')
on conflict (plan_key, limit_key) do update
set limit_value = excluded.limit_value,
    updated_at = now();

select 'phase-store-integrations-b-stripe-connect-oauth applied' as migration_note;
