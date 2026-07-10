alter table public.customers add column if not exists vehicle_info jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists updated_at timestamptz not null default now();

create index if not exists customers_store_id_idx on public.customers(store_id);
