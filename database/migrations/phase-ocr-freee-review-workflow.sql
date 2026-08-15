alter table public.expense_receipts add column if not exists file_sha256 text;
alter table public.expense_receipts add column if not exists content_fingerprint text;
alter table public.expense_receipts add column if not exists duplicate_of_id uuid references public.expense_receipts(id) on delete set null;
alter table public.expense_receipts add column if not exists page_count integer not null default 1;
alter table public.expense_receipts add column if not exists invoice_registration_number text;
alter table public.expense_receipts add column if not exists field_confidence jsonb not null default '{}'::jsonb;
alter table public.expense_receipts add column if not exists tax_breakdown jsonb not null default '[]'::jsonb;
alter table public.expense_receipts add column if not exists approval_status text not null default 'draft';
alter table public.expense_receipts add column if not exists review_notes text;
alter table public.expense_receipts add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.expense_receipts add column if not exists approved_at timestamptz;
alter table public.expense_receipts add column if not exists reanalyzed_at timestamptz;
alter table public.expense_receipts add column if not exists freee_deal_id text;
alter table public.expense_receipts add column if not exists freee_attempt_count integer not null default 0;
alter table public.expense_receipts add column if not exists freee_last_error text;
alter table public.expense_receipts add column if not exists freee_last_attempt_at timestamptz;

create unique index if not exists expense_receipts_store_file_sha256_active_uidx
  on public.expense_receipts(store_id, file_sha256)
  where file_sha256 is not null and archived_at is null;
create index if not exists expense_receipts_content_fingerprint_idx
  on public.expense_receipts(store_id, content_fingerprint)
  where content_fingerprint is not null and archived_at is null;
create index if not exists expense_receipts_approval_status_idx
  on public.expense_receipts(store_id, approval_status, created_at desc);

drop policy if exists "write org expense receipts" on public.expense_receipts;
create policy "write org expense receipts" on public.expense_receipts
for all using (public.is_org_editor(organization_id) or public.is_platform_admin())
with check (public.is_org_editor(organization_id) or public.is_platform_admin());
