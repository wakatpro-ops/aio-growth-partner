-- Issue #50: staged contact verification and operator approval before detailed diagnosis.
alter table public.public_store_analyses
  add column if not exists verification_name text,
  add column if not exists verification_email text,
  add column if not exists verification_email_hash text,
  add column if not exists verification_code_hash text,
  add column if not exists verification_code_expires_at timestamptz,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_sent_at timestamptz,
  add column if not exists verification_send_count integer not null default 0,
  add column if not exists verification_window_started_at timestamptz,
  add column if not exists verified_at timestamptz;

alter table public.applications
  add column if not exists applicant_company_name text,
  add column if not exists applicant_store_relationship text,
  add column if not exists applicant_authority_confirmed_at timestamptz,
  add column if not exists intake_review_status text not null default 'not_required',
  add column if not exists intake_reviewed_at timestamptz,
  add column if not exists intake_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists intake_review_note text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'public_store_analyses_verification_attempts_check'
  ) then
    alter table public.public_store_analyses
      add constraint public_store_analyses_verification_attempts_check
      check (verification_attempts between 0 and 10);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'public_store_analyses_verification_send_count_check'
  ) then
    alter table public.public_store_analyses
      add constraint public_store_analyses_verification_send_count_check
      check (verification_send_count between 0 and 20);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'applications_intake_review_status_check'
  ) then
    alter table public.applications
      add constraint applications_intake_review_status_check
      check (intake_review_status in ('not_required','pending','approved','changes_requested','rejected'));
  end if;
end
$$;

create index if not exists public_store_analyses_verification_email_idx
  on public.public_store_analyses(verification_email_hash, verification_sent_at desc)
  where verification_email_hash is not null;

create index if not exists applications_intake_review_idx
  on public.applications(intake_review_status, created_at desc)
  where intake_review_status <> 'not_required';

revoke all on table public.public_store_analyses from anon, authenticated;
grant all on table public.public_store_analyses to service_role;

