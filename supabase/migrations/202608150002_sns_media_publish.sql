-- Issue #16: safe SNS media, AI captions, approval and publish evidence.

alter table public.image_caption_jobs
  add column if not exists growth_action_id uuid references public.growth_actions(id) on delete set null,
  add column if not exists storage_bucket text not null default 'sns-media',
  add column if not exists storage_path text,
  add column if not exists original_file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists file_sha256 text,
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists analysis_json jsonb not null default '{}'::jsonb,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists copyright_confirmed boolean not null default false,
  add column if not exists person_consent_confirmed boolean not null default false,
  add column if not exists privacy_confirmed boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create unique index if not exists image_caption_jobs_public_token_idx
  on public.image_caption_jobs(public_token);
create unique index if not exists image_caption_jobs_active_file_idx
  on public.image_caption_jobs(store_id, growth_action_id, file_sha256)
  where archived_at is null and file_sha256 is not null;
create index if not exists image_caption_jobs_action_idx
  on public.image_caption_jobs(store_id, growth_action_id, created_at desc)
  where archived_at is null;

alter table public.external_channel_accounts
  add column if not exists access_token_encrypted text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists scopes text[] not null default '{}'::text[],
  add column if not exists connected_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists error_message text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sns-media', 'sns-media', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.image_caption_jobs enable row level security;
drop policy if exists "read org image caption jobs" on public.image_caption_jobs;
drop policy if exists "write org image caption jobs" on public.image_caption_jobs;
create policy "read org image caption jobs" on public.image_caption_jobs
for select using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy "write org image caption jobs" on public.image_caption_jobs
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
