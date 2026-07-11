create table if not exists public.application_email_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  to_email text not null,
  from_email text not null,
  subject text not null,
  template_key text not null,
  status text not null default 'queued',
  error_message text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.application_email_logs add column if not exists application_id uuid references public.applications(id) on delete cascade;
alter table public.application_email_logs add column if not exists to_email text;
alter table public.application_email_logs add column if not exists from_email text;
alter table public.application_email_logs add column if not exists subject text;
alter table public.application_email_logs add column if not exists template_key text;
alter table public.application_email_logs add column if not exists status text not null default 'queued';
alter table public.application_email_logs add column if not exists error_message text;
alter table public.application_email_logs add column if not exists provider_message_id text;
alter table public.application_email_logs add column if not exists sent_at timestamptz;
alter table public.application_email_logs add column if not exists created_at timestamptz not null default now();

create index if not exists application_email_logs_application_idx
on public.application_email_logs(application_id, created_at desc);

update public.application_email_logs
set template_key = 'application_received'
where template_key = 'applicant_auto_reply';

alter table public.application_email_logs enable row level security;

drop policy if exists "admin read application email logs" on public.application_email_logs;
drop policy if exists "admin write application email logs" on public.application_email_logs;

create policy "admin read application email logs" on public.application_email_logs
for select using (public.is_platform_admin());

create policy "admin write application email logs" on public.application_email_logs
for all using (public.is_platform_admin()) with check (public.is_platform_admin());
