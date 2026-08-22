alter table public.public_store_analyses add column if not exists operating_model_draft jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists operating_model jsonb not null default '{}'::jsonb;
alter table public.organizations add column if not exists operating_model jsonb not null default '{}'::jsonb;
alter table public.stores add column if not exists brand_name text;
alter table public.stores add column if not exists operating_model jsonb not null default '{}'::jsonb;
alter table public.stores add column if not exists onboarding_source_key text;

create unique index if not exists stores_organization_onboarding_source_key_idx
  on public.stores(organization_id, onboarding_source_key);
