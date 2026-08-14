-- Customer CRM and migration foundation.
-- Customer contact data remains in the customer master. Segments are derived views.

alter table public.customers add column if not exists customer_code text;
alter table public.customers add column if not exists birth_date date;
alter table public.customers add column if not exists gender text;
alter table public.customers add column if not exists occupation text;
alter table public.customers add column if not exists assigned_staff_name text;
alter table public.customers add column if not exists line_account text;
alter table public.customers add column if not exists instagram_account text;
alter table public.customers add column if not exists facebook_account text;
alter table public.customers add column if not exists last_visit_date date;
alter table public.customers add column if not exists visit_count integer not null default 0;
alter table public.customers add column if not exists preferred_channel text;
alter table public.customers add column if not exists email_opt_in boolean not null default false;
alter table public.customers add column if not exists line_opt_in boolean not null default false;
alter table public.customers add column if not exists social_opt_in boolean not null default false;
alter table public.customers add column if not exists do_not_contact boolean not null default false;
alter table public.customers add column if not exists tags text[] not null default '{}';
alter table public.customers add column if not exists phone_normalized text;
alter table public.customers add column if not exists import_source text;

create index if not exists customers_store_phone_normalized_idx
  on public.customers(store_id, phone_normalized)
  where archived_at is null;
create index if not exists customers_store_last_visit_idx
  on public.customers(store_id, last_visit_date)
  where archived_at is null;
create index if not exists customers_store_birth_date_idx
  on public.customers(store_id, birth_date)
  where archived_at is null;

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  body text not null,
  follow_up text,
  visibility text not null default 'store',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.customer_import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  original_filename text not null,
  file_type text not null,
  status text not null default 'preview',
  source_headers jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  preview_rows jsonb not null default '[]'::jsonb,
  raw_rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  success_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  duplicate_behavior text not null default 'skip',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create table if not exists public.customer_message_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  segment_key text not null default 'all',
  channel text not null default 'email',
  goal text,
  title text not null,
  body text not null,
  audience_count integer not null default 0,
  scheduled_at timestamptz,
  status text not null default 'draft',
  ai_reasoning text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null
);

create index if not exists customer_notes_customer_idx
  on public.customer_notes(store_id, customer_id, created_at desc)
  where archived_at is null;
create index if not exists customer_import_jobs_store_idx
  on public.customer_import_jobs(store_id, created_at desc)
  where archived_at is null;
create index if not exists customer_message_drafts_store_idx
  on public.customer_message_drafts(store_id, scheduled_at, created_at desc)
  where archived_at is null;

alter table public.customer_notes enable row level security;
alter table public.customer_import_jobs enable row level security;
alter table public.customer_message_drafts enable row level security;

drop policy if exists "read org customer notes" on public.customer_notes;
drop policy if exists "write org customer notes" on public.customer_notes;
drop policy if exists "read org customer import jobs" on public.customer_import_jobs;
drop policy if exists "write org customer import jobs" on public.customer_import_jobs;
drop policy if exists "read org customer message drafts" on public.customer_message_drafts;
drop policy if exists "write org customer message drafts" on public.customer_message_drafts;

create policy "read org customer notes" on public.customer_notes
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org customer notes" on public.customer_notes
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org customer import jobs" on public.customer_import_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org customer import jobs" on public.customer_import_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org customer message drafts" on public.customer_message_drafts
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org customer message drafts" on public.customer_message_drafts
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values
  ('customer_imports', '顧客データ一括取込', 'CSV・Excelの顧客情報を確認してから顧客マスターへ取り込みます。', 'customer', false),
  ('customer_segments', '顧客セグメント', '来店状況や連絡手段から再来店対象を整理します。', 'marketing', false),
  ('customer_message_planning', '顧客メッセージ計画', '個別・セグメント向けのメッセージ下書きと配信予定を管理します。', 'marketing', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select key, module_key, true
from public.industry_types
cross join (values ('customer_imports'), ('customer_segments'), ('customer_message_planning')) modules(module_key)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
select
  key,
  'customer_message_planning',
  'customer_segment_message',
  name || ' 顧客セグメントメッセージ',
  'あなたは店舗の既存顧客フォローを支援する編集者です。個人情報を推測せず、過度な勧誘を避け、人が確認してから使える自然な文章を作成してください。',
  '店舗情報と匿名化されたセグメント集計、目的、配信媒体をもとに、title、body、short_body、call_to_action、ai_reasoningをJSONで返してください。本文では個人名の代わりに{{名前}}を使用してください。'
from public.industry_types
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"customer_imports":true,"customer_segments":true,"customer_message_planning":true}'::jsonb;

update public.stores
set feature_flags = feature_flags || '{"customer_imports":true,"customer_segments":true,"customer_message_planning":true}'::jsonb;

