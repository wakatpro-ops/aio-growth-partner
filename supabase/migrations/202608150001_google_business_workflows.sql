-- Issue #15: safe Google Business Profile selection, posts, reviews and replies.

alter table public.google_business_profiles
  add column if not exists google_oauth_connection_id uuid references public.google_oauth_connections(id) on delete set null,
  add column if not exists location_verified_at timestamptz;

create table if not exists public.google_business_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  google_oauth_connection_id uuid not null references public.google_oauth_connections(id) on delete cascade,
  google_account_name text not null,
  google_location_name text not null,
  title text,
  address text,
  store_code text,
  is_selected boolean not null default false,
  selected_at timestamptz,
  last_seen_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, google_account_name, google_location_name)
);

create unique index if not exists google_business_locations_one_selected_idx
  on public.google_business_locations(store_id) where is_selected and archived_at is null;
create index if not exists google_business_locations_store_idx
  on public.google_business_locations(store_id, archived_at, last_seen_at desc);

create table if not exists public.google_business_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  google_business_location_id uuid not null references public.google_business_locations(id) on delete restrict,
  google_review_name text not null,
  review_id text,
  reviewer_name text,
  star_rating text,
  comment text,
  google_created_at timestamptz,
  google_updated_at timestamptz,
  google_reply_text text,
  google_reply_updated_at timestamptz,
  reply_draft text,
  reply_status text not null default 'not_started',
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  last_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, google_review_name)
);

create index if not exists google_business_reviews_store_idx
  on public.google_business_reviews(store_id, google_updated_at desc, created_at desc);
create index if not exists google_business_reviews_reply_idx
  on public.google_business_reviews(store_id, reply_status, updated_at desc);

alter table public.external_publish_jobs
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz;

create unique index if not exists external_publish_jobs_idempotency_idx
  on public.external_publish_jobs(store_id, provider, idempotency_key)
  where idempotency_key is not null;

alter table public.google_business_locations enable row level security;
alter table public.google_business_reviews enable row level security;

drop policy if exists "read org google business locations" on public.google_business_locations;
drop policy if exists "write org google business locations" on public.google_business_locations;
drop policy if exists "read org google business reviews" on public.google_business_reviews;
drop policy if exists "write org google business reviews" on public.google_business_reviews;

create policy "read org google business locations" on public.google_business_locations
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google business locations" on public.google_business_locations
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "read org google business reviews" on public.google_business_reviews
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

create policy "write org google business reviews" on public.google_business_reviews
for all using (public.is_org_member(organization_id) or public.is_platform_admin())
with check (public.is_org_member(organization_id) or public.is_platform_admin());
