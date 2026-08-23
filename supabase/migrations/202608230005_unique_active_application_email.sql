-- One active application/account lifecycle per normalized applicant email.
-- Archived applications remain as evidence and do not prevent a fresh application.
create unique index if not exists applications_active_email_uidx
  on public.applications (lower(email))
  where archived_at is null;
