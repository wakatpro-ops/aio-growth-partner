alter table public.store_accounting_integrations add column if not exists scopes text[] not null default '{}';
alter table public.store_accounting_integrations add column if not exists access_token_encrypted text;
alter table public.store_accounting_integrations add column if not exists refresh_token_encrypted text;
alter table public.store_accounting_integrations add column if not exists token_expires_at timestamptz;
alter table public.store_accounting_integrations add column if not exists connected_at timestamptz;
alter table public.store_accounting_integrations add column if not exists disconnected_at timestamptz;
alter table public.store_accounting_integrations add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.store_accounting_integrations add column if not exists last_synced_at timestamptz;
alter table public.store_accounting_integrations add column if not exists error_message text;

insert into public.modules (key, name, description, category)
values
  ('freee_oauth_connection', 'freee事業所接続', '店舗ユーザー自身のfreee事業所をOAuthで接続し、会計連携に利用します。', 'integration'),
  ('freee_accounting_api', 'freee会計API連携', 'freee会計APIへの将来送信に備え、接続状態と事業所情報を管理します。', 'accounting')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'industry_type', industry.key, flag.flag_key, flag.is_enabled
from public.industry_types industry
cross join (
  values
    ('freee_oauth_connection', true),
    ('freee_accounting_api', false)
) as flag(flag_key, is_enabled)
where industry.key in ('general_store', 'auto_repair', 'beauty_salon')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'store', store.id::text, flag.flag_key, flag.is_enabled
from public.stores store
cross join (
  values
    ('freee_oauth_connection', true),
    ('freee_accounting_api', false)
) as flag(flag_key, is_enabled)
where store.industry_type_key in ('general_store', 'auto_repair', 'beauty_salon')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

update public.industry_types
set default_feature_flags = coalesce(default_feature_flags, '{}'::jsonb) || '{"freee_oauth_connection":true,"freee_accounting_api":false}'::jsonb
where key in ('general_store', 'auto_repair', 'beauty_salon');

update public.stores
set feature_flags = coalesce(feature_flags, '{}'::jsonb) || '{"freee_oauth_connection":true,"freee_accounting_api":false}'::jsonb
where industry_type_key in ('general_store', 'auto_repair', 'beauty_salon');

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'freee_integrations', '1')
on conflict (plan_key, limit_key) do update set
  limit_value = excluded.limit_value;
