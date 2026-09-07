-- Issue #144: one secure, store-scoped AI email inbox per store.
-- Raw email bodies and attachments are deliberately not persisted.

create table if not exists public.store_ai_inboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  email_address text not null,
  status text not null default 'active' check (status in ('active','paused')),
  auto_apply_reservations boolean not null default false,
  trusted_senders text[] not null default '{}'::text[] check (cardinality(trusted_senders) <= 100),
  last_received_at timestamptz,
  last_tested_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_ai_inboxes_id_store_unique unique (id, store_id),
  constraint store_ai_inboxes_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  constraint store_ai_inboxes_email_check check (email_address ~ '^[a-z0-9][a-z0-9._+-]*@in\.aioboost\.jp$')
);

create unique index if not exists store_ai_inboxes_store_active_uidx
  on public.store_ai_inboxes(store_id) where archived_at is null;
create unique index if not exists store_ai_inboxes_email_uidx
  on public.store_ai_inboxes(lower(email_address));

create table if not exists public.store_ai_email_messages (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.store_ai_inboxes(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  provider_event_id text,
  message_fingerprint text not null,
  sender_name text,
  sender_email text,
  sender_domain text,
  subject text not null default '件名なし',
  summary text not null,
  category text not null check (category in (
    'reservation','inquiry','complaint','review','invoice_receipt','purchasing',
    'inventory_shipping','platform_notice','advertising','sensitive','unknown'
  )),
  classification_confidence numeric(4,3) not null default 0 check (classification_confidence between 0 and 1),
  classification_reason text,
  processing_status text not null default 'review_required' check (processing_status in (
    'review_required','ready_to_apply','applied','ignored','rejected','error'
  )),
  requires_human_confirmation boolean not null default true,
  sensitive boolean not null default false,
  known_template boolean not null default false,
  extracted_data jsonb not null default '{}'::jsonb,
  applied_target_type text,
  applied_target_id uuid,
  received_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_ai_email_messages_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade,
  constraint store_ai_email_messages_inbox_store_fkey foreign key (inbox_id, store_id)
    references public.store_ai_inboxes(id, store_id) on delete restrict,
  constraint store_ai_email_messages_sensitive_minimization_check check (
    not sensitive or (
      category = 'sensitive'
      and subject = '機密性の高いメール'
      and extracted_data = '{}'::jsonb
      and processing_status = 'rejected'
    )
  ),
  unique (inbox_id, message_fingerprint)
);

create index if not exists store_ai_email_messages_store_status_idx
  on public.store_ai_email_messages(store_id, processing_status, received_at desc) where archived_at is null;
create index if not exists store_ai_email_messages_store_category_idx
  on public.store_ai_email_messages(store_id, category, received_at desc) where archived_at is null;

alter table public.store_ai_inboxes enable row level security;
alter table public.store_ai_email_messages enable row level security;

-- All access goes through authenticated server boundaries or the authenticated webhook.
revoke all on public.store_ai_inboxes from public, anon, authenticated;
revoke all on public.store_ai_email_messages from public, anon, authenticated;
grant all on public.store_ai_inboxes to service_role;
grant all on public.store_ai_email_messages to service_role;

create or replace function public.create_default_store_ai_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.store_ai_inboxes (organization_id, store_id, email_address)
  values (new.organization_id, new.id, 'store-' || replace(gen_random_uuid()::text, '-', '') || '@in.aioboost.jp')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists create_default_store_ai_inbox_after_store on public.stores;
create trigger create_default_store_ai_inbox_after_store
after insert on public.stores
for each row execute function public.create_default_store_ai_inbox();

insert into public.store_ai_inboxes (organization_id, store_id, email_address)
select store.organization_id, store.id, 'store-' || replace(gen_random_uuid()::text, '-', '') || '@in.aioboost.jp'
from public.stores store
where store.archived_at is null
  and not exists (
    select 1 from public.store_ai_inboxes inbox
    where inbox.store_id = store.id and inbox.archived_at is null
  );

create or replace function public.rotate_store_ai_inbox(
  p_organization_id uuid,
  p_store_id uuid,
  p_actor_user_id uuid
)
returns public.store_ai_inboxes
language plpgsql
security definer
set search_path = public
as $$
declare
  next_inbox public.store_ai_inboxes%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception '受信アドレスを再発行する権限がありません。'; end if;
  if not exists (select 1 from public.stores where id = p_store_id and organization_id = p_organization_id and status = 'active' and archived_at is null) then
    raise exception '店舗を確認できません。';
  end if;
  update public.store_ai_inboxes
  set archived_at = now(), archived_by = p_actor_user_id, status = 'paused', updated_at = now(), updated_by = p_actor_user_id
  where store_id = p_store_id and organization_id = p_organization_id and archived_at is null;
  insert into public.store_ai_inboxes (organization_id, store_id, email_address, created_by, updated_by)
  values (p_organization_id, p_store_id, 'store-' || replace(gen_random_uuid()::text, '-', '') || '@in.aioboost.jp', p_actor_user_id, p_actor_user_id)
  returning * into next_inbox;
  return next_inbox;
end;
$$;

create or replace function public.apply_store_ai_email_booking(
  p_message_id uuid,
  p_actor_user_id uuid,
  p_automatic boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  message_row public.store_ai_email_messages%rowtype;
  inbox_row public.store_ai_inboxes%rowtype;
  booking_id uuid;
  starts_at timestamptz;
  ends_at timestamptz;
  customer_name text;
  external_id text;
begin
  if auth.role() <> 'service_role' then raise exception 'メールから予約へ反映する権限がありません。'; end if;
  select * into message_row from public.store_ai_email_messages where id = p_message_id for update;
  if message_row.id is null or message_row.archived_at is not null then raise exception '対象メールを確認できません。'; end if;
  if message_row.processing_status = 'applied' and message_row.applied_target_id is not null then return message_row.applied_target_id; end if;
  if message_row.category <> 'reservation' or message_row.sensitive then raise exception '予約として反映できるメールではありません。'; end if;
  select * into inbox_row from public.store_ai_inboxes where id = message_row.inbox_id and archived_at is null and status = 'active';
  if inbox_row.id is null then raise exception 'AI受信箱が停止されています。'; end if;
  if p_automatic and (
    not inbox_row.auto_apply_reservations
    or not message_row.known_template
    or message_row.classification_confidence < 0.98
    or message_row.sender_email is null
    or not (lower(message_row.sender_email) = any(inbox_row.trusted_senders))
  ) then raise exception 'このメールは自動反映の安全条件を満たしていません。'; end if;

  customer_name := nullif(btrim(message_row.extracted_data->>'customer_name'), '');
  if customer_name is null then raise exception 'お客様名を確認してください。'; end if;
  begin starts_at := (message_row.extracted_data->>'starts_at')::timestamptz; exception when others then raise exception '予約日時を確認してください。'; end;
  begin ends_at := (message_row.extracted_data->>'ends_at')::timestamptz; exception when others then raise exception '終了日時を確認してください。'; end;

  booking_id := public.create_store_booking(
    message_row.organization_id,
    message_row.store_id,
    null,
    null,
    'confirmed',
    'external',
    starts_at,
    ends_at,
    customer_name,
    coalesce(message_row.extracted_data->>'customer_phone', ''),
    coalesce(message_row.extracted_data->>'customer_email', ''),
    coalesce(message_row.extracted_data->>'service_name', ''),
    'AI受信箱から' || case when p_automatic then '自動' else '確認後に' end || '反映',
    '{}'::uuid[],
    p_actor_user_id
  );
  external_id := coalesce(nullif(message_row.extracted_data->>'reservation_id', ''), message_row.message_fingerprint);
  update public.bookings
  set external_provider = 'email_inbox', external_booking_id = external_id,
      metadata = metadata || jsonb_build_object('store_ai_email_message_id', message_row.id, 'automatic', p_automatic)
  where id = booking_id;
  update public.store_ai_email_messages
  set processing_status = 'applied', requires_human_confirmation = false,
      applied_target_type = 'booking', applied_target_id = booking_id,
      reviewed_at = now(), reviewed_by = p_actor_user_id, updated_at = now()
  where id = message_row.id;
  return booking_id;
end;
$$;

revoke all on function public.rotate_store_ai_inbox(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_store_ai_email_booking(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.rotate_store_ai_inbox(uuid, uuid, uuid) to service_role;
grant execute on function public.apply_store_ai_email_booking(uuid, uuid, boolean) to service_role;
