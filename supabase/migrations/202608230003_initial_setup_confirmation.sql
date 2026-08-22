-- Issue #52: owner-reviewed AI initial setup before formal data activation.
alter table public.onboarding_snapshots
  add column if not exists confirmation_status text not null default 'pending',
  add column if not exists confirmation_payload jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'onboarding_snapshots_confirmation_status_check'
  ) then
    alter table public.onboarding_snapshots
      add constraint onboarding_snapshots_confirmation_status_check
      check (confirmation_status in ('pending', 'applying', 'completed'));
  end if;
end $$;

alter table public.items
  add column if not exists onboarding_source_key text;

create unique index if not exists items_store_onboarding_source_uidx
  on public.items(store_id, onboarding_source_key);

create index if not exists onboarding_snapshots_confirmation_idx
  on public.onboarding_snapshots(store_id, confirmation_status, updated_at desc);
