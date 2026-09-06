-- Issue #135: LINE reservation window on top of the guarded booking hub.
-- No LINE credential is stored in the database. Channel credentials remain server-side environment variables.

create table if not exists public.line_store_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  channel_id text not null,
  official_account_basic_id text,
  display_name text not null default 'AIOBoostサポート',
  status text not null default 'active' check (status in ('active','paused','error')),
  booking_enabled boolean not null default true,
  auto_confirm_bookings boolean not null default false,
  consent_version text not null default '2026-09-06',
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  last_event_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_store_integrations_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists line_store_integrations_store_active_uidx
  on public.line_store_integrations(store_id) where archived_at is null;
create index if not exists line_store_integrations_channel_idx
  on public.line_store_integrations(channel_id, status) where archived_at is null;

create table if not exists public.line_store_link_codes (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.line_store_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  code_hash text not null unique,
  code_hint text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint line_store_link_codes_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create index if not exists line_store_link_codes_active_idx
  on public.line_store_link_codes(store_id, expires_at) where archived_at is null and consumed_at is null;

create table if not exists public.line_booking_contacts (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.line_store_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid references public.customers(id) on delete set null,
  line_user_hash text not null,
  line_user_ciphertext text not null,
  consent_version text,
  consented_at timestamptz,
  do_not_contact boolean not null default false,
  opted_out_at timestamptz,
  last_interaction_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_booking_contacts_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists line_booking_contacts_integration_user_active_uidx
  on public.line_booking_contacts(integration_id, line_user_hash) where archived_at is null;
create index if not exists line_booking_contacts_store_idx
  on public.line_booking_contacts(store_id, last_interaction_at desc) where archived_at is null;

create table if not exists public.line_booking_conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.line_booking_contacts(id) on delete cascade,
  integration_id uuid not null references public.line_store_integrations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  state text not null default 'awaiting_consent',
  context jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  last_event_id text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_booking_conversations_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists line_booking_conversations_contact_active_uidx
  on public.line_booking_conversations(contact_id) where archived_at is null;
create index if not exists line_booking_conversations_expiry_idx
  on public.line_booking_conversations(expires_at) where archived_at is null;

create table if not exists public.line_webhook_events (
  event_id text primary key,
  event_type text not null,
  source_hash text,
  integration_id uuid references public.line_store_integrations(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  store_id uuid references public.stores(id) on delete set null,
  processing_status text not null default 'processing'
    check (processing_status in ('processing','completed','ignored','failed')),
  attempt_count integer not null default 1,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists line_webhook_events_status_idx
  on public.line_webhook_events(processing_status, received_at desc);

create table if not exists public.line_booking_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  integration_id uuid not null references public.line_store_integrations(id) on delete cascade,
  contact_id uuid not null references public.line_booking_contacts(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','processing','sent','cancelled','failed')),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  sent_at timestamptz,
  error_message text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_booking_reminders_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists line_booking_reminders_booking_active_uidx
  on public.line_booking_reminders(booking_id) where archived_at is null;
create index if not exists line_booking_reminders_due_idx
  on public.line_booking_reminders(status, scheduled_for, next_retry_at) where archived_at is null;

alter table public.bookings add column if not exists line_contact_id uuid references public.line_booking_contacts(id) on delete set null;

alter table public.line_store_integrations enable row level security;
alter table public.line_store_link_codes enable row level security;
alter table public.line_booking_contacts enable row level security;
alter table public.line_booking_conversations enable row level security;
alter table public.line_webhook_events enable row level security;
alter table public.line_booking_reminders enable row level security;

create policy "read permitted line integrations" on public.line_store_integrations for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);
create policy "read permitted line link codes" on public.line_store_link_codes for select using (
  public.is_platform_admin() or public.is_org_editor(organization_id) or public.is_store_editor(store_id)
);
create policy "read permitted line contacts" on public.line_booking_contacts for select using (
  public.is_platform_admin() or public.is_org_editor(organization_id) or public.is_store_editor(store_id)
);
create policy "read permitted line reminders" on public.line_booking_reminders for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);

revoke all on public.line_store_integrations from anon;
revoke all on public.line_store_link_codes from anon;
revoke all on public.line_booking_contacts from anon;
revoke all on public.line_booking_conversations from anon, authenticated;
revoke all on public.line_webhook_events from anon, authenticated;
revoke all on public.line_booking_reminders from anon;
revoke insert, update, delete on public.line_store_integrations from authenticated;
revoke insert, update, delete on public.line_store_link_codes from authenticated;
revoke insert, update, delete on public.line_booking_contacts from authenticated;
revoke insert, update, delete on public.line_booking_reminders from authenticated;
grant select on public.line_store_integrations to authenticated;
grant select on public.line_store_link_codes to authenticated;
grant select on public.line_booking_contacts to authenticated;
grant select on public.line_booking_reminders to authenticated;

create or replace function public.create_line_store_booking(
  p_integration_id uuid,
  p_contact_id uuid,
  p_service_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_event_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  integration public.line_store_integrations%rowtype;
  service public.booking_services%rowtype;
  new_booking_id uuid;
  resource_ids uuid[] := case when p_resource_id is null then '{}'::uuid[] else array[p_resource_id] end;
  ends_at timestamptz;
  booking_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'LINE予約の登録権限がありません。'; end if;
  select * into integration from public.line_store_integrations
    where id = p_integration_id and status = 'active' and booking_enabled and archived_at is null;
  if integration.id is null then raise exception 'LINE予約を利用できない店舗です。'; end if;
  if not exists (
    select 1 from public.line_booking_contacts
    where id = p_contact_id and integration_id = integration.id and store_id = integration.store_id
      and consented_at is not null and not do_not_contact and archived_at is null
  ) then raise exception '同意済みのLINE利用者を確認できません。'; end if;
  select * into service from public.booking_services
    where id = p_service_id and store_id = integration.store_id and is_bookable and archived_at is null;
  if service.id is null then raise exception '選択した予約内容を利用できません。'; end if;
  if p_resource_id is not null and not exists (
    select 1 from public.booking_resources where id = p_resource_id and store_id = integration.store_id and is_bookable and archived_at is null
  ) then raise exception '選択した担当者・設備を利用できません。'; end if;
  if nullif(btrim(p_customer_name), '') is null then raise exception 'お客様名を入力してください。'; end if;
  if p_starts_at < now() then raise exception '過去の日時は予約できません。'; end if;
  ends_at := p_starts_at + make_interval(mins => service.duration_minutes);
  perform public.assert_booking_resources_available(
    integration.store_id,
    p_starts_at - make_interval(mins => service.buffer_before_minutes),
    ends_at + make_interval(mins => service.buffer_after_minutes),
    resource_ids,
    null
  );
  -- Without an assigned resource there is no reliable capacity lock, so the request must remain pending.
  booking_status := case when integration.auto_confirm_bookings and p_resource_id is not null then 'confirmed' else 'pending' end;
  insert into public.bookings (
    organization_id, store_id, service_id, line_contact_id, status, source, starts_at, ends_at,
    customer_name, service_name, external_provider, external_booking_id, metadata
  ) values (
    integration.organization_id, integration.store_id, service.id, p_contact_id, booking_status, 'line', p_starts_at, ends_at,
    btrim(p_customer_name), service.name, 'line_messaging_api', p_event_id,
    jsonb_build_object('line_contact_id', p_contact_id, 'requested_via', 'line')
  ) returning id into new_booking_id;
  insert into public.booking_resource_allocations (organization_id, store_id, booking_id, resource_id)
    select integration.organization_id, integration.store_id, new_booking_id, resource_id from unnest(resource_ids) resource_id;
  insert into public.line_booking_reminders (
    organization_id, store_id, integration_id, contact_id, booking_id, scheduled_for
  ) values (
    integration.organization_id, integration.store_id, integration.id, p_contact_id, new_booking_id,
    greatest(p_starts_at - interval '24 hours', now() + interval '5 minutes')
  );
  insert into public.audit_logs (organization_id, store_id, action_type, target_type, target_id, message, metadata)
  values (integration.organization_id, integration.store_id, 'line_booking_created', 'booking', new_booking_id,
    btrim(p_customer_name) || '様のLINE予約希望を受け付けました。', jsonb_build_object('status', booking_status));
  return new_booking_id;
end;
$$;

create or replace function public.reschedule_line_store_booking(
  p_booking_id uuid,
  p_contact_id uuid,
  p_starts_at timestamptz,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.bookings%rowtype;
  service public.booking_services%rowtype;
  resource_ids uuid[];
  ends_at timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'LINE予約の変更権限がありません。'; end if;
  select * into target from public.bookings
    where id = p_booking_id and line_contact_id = p_contact_id and source = 'line'
      and status in ('pending','confirmed') and starts_at > now() and archived_at is null;
  if target.id is null then raise exception '変更できる予約を確認できません。'; end if;
  select * into service from public.booking_services where id = target.service_id and archived_at is null;
  if service.id is null then raise exception '予約内容を確認できません。'; end if;
  select coalesce(array_agg(resource_id order by resource_id), '{}'::uuid[]) into resource_ids
    from public.booking_resource_allocations where booking_id = target.id and archived_at is null;
  ends_at := p_starts_at + make_interval(mins => service.duration_minutes);
  perform public.assert_booking_resources_available(
    target.store_id,
    p_starts_at - make_interval(mins => service.buffer_before_minutes),
    ends_at + make_interval(mins => service.buffer_after_minutes),
    resource_ids,
    target.id
  );
  update public.bookings set starts_at = p_starts_at, ends_at = ends_at, status = 'pending', updated_at = now(),
    metadata = metadata || jsonb_build_object('last_line_event_id', p_event_id, 'rescheduled_via', 'line') where id = target.id;
  update public.line_booking_reminders set scheduled_for = greatest(p_starts_at - interval '24 hours', now() + interval '5 minutes'),
    status = 'scheduled', attempt_count = 0, next_retry_at = null, sent_at = null, error_message = null, updated_at = now()
    where booking_id = target.id and archived_at is null;
  insert into public.audit_logs (organization_id, store_id, action_type, target_type, target_id, message, metadata)
  values (target.organization_id, target.store_id, 'line_booking_rescheduled', 'booking', target.id,
    target.customer_name || '様のLINE予約変更希望を受け付けました。', jsonb_build_object('status', 'pending'));
end;
$$;

create or replace function public.cancel_line_store_booking(
  p_booking_id uuid,
  p_contact_id uuid,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target public.bookings%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'LINE予約のキャンセル権限がありません。'; end if;
  select * into target from public.bookings
    where id = p_booking_id and line_contact_id = p_contact_id and source = 'line'
      and status in ('pending','confirmed') and starts_at > now() and archived_at is null;
  if target.id is null then raise exception 'キャンセルできる予約を確認できません。'; end if;
  update public.bookings set status = 'cancelled', updated_at = now(),
    metadata = metadata || jsonb_build_object('last_line_event_id', p_event_id, 'cancelled_via', 'line') where id = target.id;
  update public.line_booking_reminders set status = 'cancelled', updated_at = now()
    where booking_id = target.id and archived_at is null and status <> 'sent';
  insert into public.audit_logs (organization_id, store_id, action_type, target_type, target_id, message)
  values (target.organization_id, target.store_id, 'line_booking_cancelled', 'booking', target.id,
    target.customer_name || '様のLINE予約をキャンセルしました。');
end;
$$;

revoke all on function public.create_line_store_booking(uuid, uuid, uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.reschedule_line_store_booking(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.cancel_line_store_booking(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_line_store_booking(uuid, uuid, uuid, uuid, timestamptz, text, text) to service_role;
grant execute on function public.reschedule_line_store_booking(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.cancel_line_store_booking(uuid, uuid, text) to service_role;
