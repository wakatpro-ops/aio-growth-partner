alter table public.applications add column if not exists sales_notes text;
alter table public.applications add column if not exists scheduled_demo_at timestamptz;
alter table public.applications add column if not exists demo_completed_at timestamptz;
alter table public.applications add column if not exists billing_status text not null default 'not_issued';
alter table public.applications add column if not exists billing_amount integer;
alter table public.applications add column if not exists billing_memo text;
alter table public.applications add column if not exists invoice_issued_at timestamptz;
alter table public.applications add column if not exists payment_status text not null default 'unpaid';
alter table public.applications add column if not exists payment_confirmed_at timestamptz;
alter table public.applications add column if not exists approval_status text not null default 'pending';
alter table public.applications add column if not exists approved_at timestamptz;
alter table public.applications add column if not exists approved_by uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists account_status text not null default 'not_created';
alter table public.applications add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.applications add column if not exists store_id uuid references public.stores(id) on delete set null;
alter table public.applications add column if not exists invited_user_id uuid references auth.users(id) on delete set null;
alter table public.applications add column if not exists invite_email text;
alter table public.applications add column if not exists invitation_status text not null default 'not_started';
alter table public.applications add column if not exists onboarding_status text not null default 'not_started';
alter table public.applications add column if not exists admin_checklist jsonb not null default '{}'::jsonb;
alter table public.applications add column if not exists updated_at timestamptz not null default now();

create index if not exists applications_status_created_at_idx on public.applications(status, created_at desc);
create index if not exists applications_email_idx on public.applications(email);
create index if not exists applications_org_store_idx on public.applications(organization_id, store_id);

create table if not exists public.application_activity_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  from_status text,
  to_status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists application_activity_logs_application_idx on public.application_activity_logs(application_id, created_at desc);

alter table public.application_activity_logs enable row level security;

drop policy if exists "admin read application activity logs" on public.application_activity_logs;
drop policy if exists "admin write application activity logs" on public.application_activity_logs;
drop policy if exists "admin update applications" on public.applications;

create policy "admin read application activity logs" on public.application_activity_logs
for select using (public.is_platform_admin());

create policy "admin write application activity logs" on public.application_activity_logs
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "admin update applications" on public.applications
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

insert into public.modules (key, name, description, category, is_core)
values
  ('sales_approval_flow', '営業・承認フロー', '公開申し込みから説明、請求、入金確認、承認、利用開始準備までを管理します。', 'admin', true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core,
  updated_at = now();
