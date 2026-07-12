create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null,
  storage_bucket text not null default 'receipt-files',
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size integer,
  status text not null default 'uploaded',
  vendor_name text,
  receipt_date date,
  payment_method text,
  category_name text,
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  tax_rate text,
  extracted_items jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_model text,
  ai_analysis_status text not null default 'not_started',
  ai_analysis_error text,
  freee_status text not null default 'not_sent',
  freee_payload jsonb not null default '{}'::jsonb,
  freee_response jsonb not null default '{}'::jsonb,
  freee_sent_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expense_receipts add column if not exists accounting_integration_id uuid references public.store_accounting_integrations(id) on delete set null;
alter table public.expense_receipts add column if not exists storage_bucket text not null default 'receipt-files';
alter table public.expense_receipts add column if not exists storage_path text;
alter table public.expense_receipts add column if not exists original_file_name text;
alter table public.expense_receipts add column if not exists mime_type text;
alter table public.expense_receipts add column if not exists file_size integer;
alter table public.expense_receipts add column if not exists status text not null default 'uploaded';
alter table public.expense_receipts add column if not exists vendor_name text;
alter table public.expense_receipts add column if not exists receipt_date date;
alter table public.expense_receipts add column if not exists payment_method text;
alter table public.expense_receipts add column if not exists category_name text;
alter table public.expense_receipts add column if not exists subtotal_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists tax_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists total_amount numeric(12,2) not null default 0;
alter table public.expense_receipts add column if not exists tax_rate text;
alter table public.expense_receipts add column if not exists extracted_items jsonb not null default '[]'::jsonb;
alter table public.expense_receipts add column if not exists ai_summary text;
alter table public.expense_receipts add column if not exists ai_model text;
alter table public.expense_receipts add column if not exists ai_analysis_status text not null default 'not_started';
alter table public.expense_receipts add column if not exists ai_analysis_error text;
alter table public.expense_receipts add column if not exists freee_status text not null default 'not_sent';
alter table public.expense_receipts add column if not exists freee_payload jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists freee_response jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists freee_sent_at timestamptz;
alter table public.expense_receipts add column if not exists uploaded_by uuid references auth.users(id) on delete set null;
alter table public.expense_receipts add column if not exists created_at timestamptz not null default now();
alter table public.expense_receipts add column if not exists updated_at timestamptz not null default now();

create index if not exists expense_receipts_store_created_idx on public.expense_receipts(store_id, created_at desc);
create index if not exists expense_receipts_status_idx on public.expense_receipts(status);
create index if not exists expense_receipts_freee_status_idx on public.expense_receipts(freee_status);

alter table public.expense_receipts enable row level security;

drop policy if exists "read org expense receipts" on public.expense_receipts;
drop policy if exists "write org expense receipts" on public.expense_receipts;

create policy "read org expense receipts" on public.expense_receipts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org expense receipts" on public.expense_receipts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-files',
  'receipt-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.modules (key, name, description, category)
values
  ('expense_receipt_ai', 'レシートAI読み取り', '仕入れ・経費のレシート画像をAIで読み取り、会計連携に使える形へ整理します。', 'accounting'),
  ('freee_receipt_export', 'freee経費連携準備', '読み取ったレシート内容をfreeeへ送る前の確認データとして管理します。', 'accounting')
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category;

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'industry_type', industry.key, flag.flag_key, true
from public.industry_types industry
cross join (
  values
    ('expense_receipt_ai'),
    ('freee_receipt_export')
) as flag(flag_key)
where industry.key in ('general_store', 'auto_repair', 'beauty_salon')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

insert into public.feature_flags (scope_type, scope_key, flag_key, is_enabled)
select 'store', store.id::text, flag.flag_key, true
from public.stores store
cross join (
  values
    ('expense_receipt_ai'),
    ('freee_receipt_export')
) as flag(flag_key)
where store.industry_type_key in ('general_store', 'auto_repair', 'beauty_salon')
on conflict (scope_type, scope_key, flag_key) do update set
  is_enabled = excluded.is_enabled,
  updated_at = now();

update public.industry_types
set default_feature_flags = coalesce(default_feature_flags, '{}'::jsonb) || '{"expense_receipt_ai":true,"freee_receipt_export":true}'::jsonb
where key in ('general_store', 'auto_repair', 'beauty_salon');

update public.stores
set feature_flags = coalesce(feature_flags, '{}'::jsonb) || '{"expense_receipt_ai":true,"freee_receipt_export":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair', 'beauty_salon');

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'expense_receipt_ai_monthly', '100')
on conflict (plan_key, limit_key) do update set
  limit_value = excluded.limit_value;
