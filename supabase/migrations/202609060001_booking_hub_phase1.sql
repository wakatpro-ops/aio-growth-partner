-- Issue #134: store-scoped booking core. External reservation providers are not written in phase 1.

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  item_id uuid references public.items(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 1440),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 360),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 360),
  price numeric(12,2) not null default 0 check (price >= 0),
  color text not null default '#248565' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_bookable boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_services_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create table if not exists public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  membership_id uuid references public.store_memberships(id) on delete set null,
  resource_type text not null default 'staff'
    check (resource_type in ('staff','seat','room','equipment','table','vehicle','other')),
  name text not null,
  capacity integer not null default 1 check (capacity between 1 and 100),
  color text not null default '#5478d4' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_bookable boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_resources_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  customer_id uuid references public.customers(id) on delete set null,
  service_id uuid references public.booking_services(id) on delete set null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  source text not null default 'manual'
    check (source in ('aio_boost','manual','phone','line','external')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  service_name text,
  notes text,
  external_provider text,
  external_booking_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_order_check check (ends_at > starts_at),
  constraint bookings_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create table if not exists public.booking_resource_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  resource_id uuid not null references public.booking_resources(id) on delete cascade,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint booking_allocations_store_org_fkey foreign key (store_id, organization_id)
    references public.stores(id, organization_id) on delete cascade
);

create unique index if not exists booking_services_store_name_active_uidx
  on public.booking_services(store_id, lower(name)) where archived_at is null;
create index if not exists booking_services_store_sort_idx
  on public.booking_services(store_id, archived_at, sort_order, name);
create unique index if not exists booking_resources_store_name_active_uidx
  on public.booking_resources(store_id, lower(name)) where archived_at is null;
create index if not exists booking_resources_store_sort_idx
  on public.booking_resources(store_id, archived_at, sort_order, name);
create index if not exists bookings_store_starts_idx
  on public.bookings(store_id, starts_at, status) where archived_at is null;
create index if not exists bookings_store_customer_idx
  on public.bookings(store_id, customer_id, starts_at desc) where archived_at is null;
create unique index if not exists bookings_external_uidx
  on public.bookings(store_id, external_provider, external_booking_id)
  where external_provider is not null and external_booking_id is not null and archived_at is null;
create unique index if not exists booking_allocations_booking_resource_active_uidx
  on public.booking_resource_allocations(booking_id, resource_id) where archived_at is null;
create index if not exists booking_allocations_resource_idx
  on public.booking_resource_allocations(resource_id, booking_id) where archived_at is null;

alter table public.booking_services enable row level security;
alter table public.booking_resources enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_resource_allocations enable row level security;

create policy "read permitted booking services" on public.booking_services for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);
create policy "read permitted booking resources" on public.booking_resources for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);
create policy "read permitted bookings" on public.bookings for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);
create policy "read permitted booking allocations" on public.booking_resource_allocations for select using (
  public.is_platform_admin() or public.is_org_member(organization_id) or public.is_store_member(store_id)
);

-- All writes flow through guarded Server Actions or the atomic RPC functions below.
-- This prevents browser-side REST writes from bypassing overlap checks and audit logging.
revoke insert, update, delete on public.booking_services from anon, authenticated;
revoke insert, update, delete on public.booking_resources from anon, authenticated;
revoke insert, update, delete on public.bookings from anon, authenticated;
revoke insert, update, delete on public.booking_resource_allocations from anon, authenticated;
grant select on public.booking_services to authenticated;
grant select on public.booking_resources to authenticated;
grant select on public.bookings to authenticated;
grant select on public.booking_resource_allocations to authenticated;

create or replace function public.may_write_store_booking(p_organization_id uuid, p_store_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select auth.role() = 'service_role'
    or public.is_platform_admin()
    or public.is_org_editor(p_organization_id)
    or public.is_store_editor(p_store_id);
$$;

create or replace function public.assert_booking_resources_available(
  p_store_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_resource_ids uuid[],
  p_excluded_booking_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resource_row record;
  overlap_count integer;
begin
  if p_ends_at <= p_starts_at then
    raise exception '終了日時は開始日時より後にしてください。';
  end if;

  for resource_row in
    select id, name, capacity
    from public.booking_resources
    where id = any(coalesce(p_resource_ids, '{}'::uuid[]))
      and store_id = p_store_id
      and archived_at is null
      and is_bookable = true
    order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended(resource_row.id::text, 0));
    select count(distinct booking.id)::integer into overlap_count
    from public.booking_resource_allocations allocation
    join public.bookings booking on booking.id = allocation.booking_id
    left join public.booking_services existing_service on existing_service.id = booking.service_id
    where allocation.resource_id = resource_row.id
      and allocation.archived_at is null
      and booking.store_id = p_store_id
      and booking.archived_at is null
      and booking.status in ('pending', 'confirmed')
      and (p_excluded_booking_id is null or booking.id <> p_excluded_booking_id)
      and booking.starts_at - make_interval(mins => coalesce(existing_service.buffer_before_minutes, 0)) < p_ends_at
      and booking.ends_at + make_interval(mins => coalesce(existing_service.buffer_after_minutes, 0)) > p_starts_at;

    if overlap_count >= resource_row.capacity then
      raise exception '予約が重複しています: %', resource_row.name;
    end if;
  end loop;

  if (select count(*) from unnest(coalesce(p_resource_ids, '{}'::uuid[]))) <>
     (select count(*) from public.booking_resources
       where id = any(coalesce(p_resource_ids, '{}'::uuid[]))
         and store_id = p_store_id and archived_at is null and is_bookable = true) then
    raise exception '選択した担当者・設備を利用できません。';
  end if;
end;
$$;

create or replace function public.create_store_booking(
  p_organization_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_status text,
  p_source text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_service_name text,
  p_notes text,
  p_resource_ids uuid[],
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_booking_id uuid;
  actor_id uuid := coalesce(auth.uid(), p_actor_user_id);
  before_minutes integer := 0;
  after_minutes integer := 0;
begin
  if not public.may_write_store_booking(p_organization_id, p_store_id) then
    raise exception 'この店舗の予約を変更する権限がありません。';
  end if;
  if not exists (select 1 from public.stores where id = p_store_id and organization_id = p_organization_id and status = 'active' and archived_at is null) then
    raise exception '店舗を確認できません。';
  end if;
  if p_status not in ('pending','confirmed','completed','cancelled','no_show') or p_source not in ('aio_boost','manual','phone','line','external') then
    raise exception '予約の状態または受付経路を選び直してください。';
  end if;
  if nullif(btrim(p_customer_name), '') is null then
    raise exception 'お客様名を入力してください。';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and store_id = p_store_id and archived_at is null) then
    raise exception '選択した顧客を確認できません。';
  end if;
  if p_service_id is not null and not exists (select 1 from public.booking_services where id = p_service_id and store_id = p_store_id and archived_at is null and is_bookable = true) then
    raise exception '選択した予約内容を利用できません。';
  end if;
  if p_service_id is not null then
    select buffer_before_minutes, buffer_after_minutes into before_minutes, after_minutes
      from public.booking_services where id = p_service_id;
  end if;
  if p_status in ('pending','confirmed') then
    perform public.assert_booking_resources_available(
      p_store_id,
      p_starts_at - make_interval(mins => before_minutes),
      p_ends_at + make_interval(mins => after_minutes),
      p_resource_ids,
      null
    );
  end if;

  insert into public.bookings (
    organization_id, store_id, customer_id, service_id, status, source, starts_at, ends_at,
    customer_name, customer_phone, customer_email, service_name, notes, created_by, updated_by
  ) values (
    p_organization_id, p_store_id, p_customer_id, p_service_id, p_status, p_source, p_starts_at, p_ends_at,
    btrim(p_customer_name), nullif(btrim(p_customer_phone), ''), nullif(btrim(p_customer_email), ''),
    nullif(btrim(p_service_name), ''), nullif(btrim(p_notes), ''), actor_id, actor_id
  ) returning id into new_booking_id;

  insert into public.booking_resource_allocations (organization_id, store_id, booking_id, resource_id)
  select p_organization_id, p_store_id, new_booking_id, resource_id
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) as resource_id;

  insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message, metadata)
  values (p_organization_id, p_store_id, actor_id, 'booking_created', 'booking', new_booking_id,
    btrim(p_customer_name) || '様の予約を登録しました。', jsonb_build_object('status', p_status, 'source', p_source));
  return new_booking_id;
end;
$$;

create or replace function public.update_store_booking(
  p_booking_id uuid,
  p_organization_id uuid,
  p_store_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_status text,
  p_source text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_service_name text,
  p_notes text,
  p_resource_ids uuid[],
  p_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := coalesce(auth.uid(), p_actor_user_id);
  before_minutes integer := 0;
  after_minutes integer := 0;
begin
  if not public.may_write_store_booking(p_organization_id, p_store_id) then
    raise exception 'この店舗の予約を変更する権限がありません。';
  end if;
  if not exists (select 1 from public.bookings where id = p_booking_id and store_id = p_store_id and organization_id = p_organization_id and archived_at is null) then
    raise exception '予約を確認できません。';
  end if;
  if p_status not in ('pending','confirmed','completed','cancelled','no_show') or p_source not in ('aio_boost','manual','phone','line','external') then
    raise exception '予約の状態または受付経路を選び直してください。';
  end if;
  if nullif(btrim(p_customer_name), '') is null then
    raise exception 'お客様名を入力してください。';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and store_id = p_store_id and archived_at is null) then
    raise exception '選択した顧客を確認できません。';
  end if;
  if p_service_id is not null and not exists (select 1 from public.booking_services where id = p_service_id and store_id = p_store_id and archived_at is null and is_bookable = true) then
    raise exception '選択した予約内容を利用できません。';
  end if;
  if p_service_id is not null then
    select buffer_before_minutes, buffer_after_minutes into before_minutes, after_minutes
      from public.booking_services where id = p_service_id;
  end if;
  if p_status in ('pending','confirmed') then
    perform public.assert_booking_resources_available(
      p_store_id,
      p_starts_at - make_interval(mins => before_minutes),
      p_ends_at + make_interval(mins => after_minutes),
      p_resource_ids,
      p_booking_id
    );
  end if;

  update public.bookings set
    customer_id = p_customer_id, service_id = p_service_id, status = p_status, source = p_source,
    starts_at = p_starts_at, ends_at = p_ends_at, customer_name = btrim(p_customer_name),
    customer_phone = nullif(btrim(p_customer_phone), ''), customer_email = nullif(btrim(p_customer_email), ''),
    service_name = nullif(btrim(p_service_name), ''), notes = nullif(btrim(p_notes), ''),
    updated_by = actor_id, updated_at = now()
  where id = p_booking_id;

  update public.booking_resource_allocations
    set archived_at = now(), archived_by = actor_id
    where booking_id = p_booking_id and archived_at is null;
  insert into public.booking_resource_allocations (organization_id, store_id, booking_id, resource_id)
  select p_organization_id, p_store_id, p_booking_id, resource_id
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) as resource_id;

  insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message, metadata)
  values (p_organization_id, p_store_id, actor_id, 'booking_updated', 'booking', p_booking_id,
    btrim(p_customer_name) || '様の予約を更新しました。', jsonb_build_object('status', p_status, 'source', p_source));
  return p_booking_id;
end;
$$;

create or replace function public.archive_store_booking(
  p_booking_id uuid, p_organization_id uuid, p_store_id uuid, p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare actor_id uuid := coalesce(auth.uid(), p_actor_user_id); customer_label text;
begin
  if not public.may_write_store_booking(p_organization_id, p_store_id) then raise exception 'この店舗の予約を変更する権限がありません。'; end if;
  update public.bookings set archived_at = now(), archived_by = actor_id, updated_at = now(), updated_by = actor_id
    where id = p_booking_id and store_id = p_store_id and organization_id = p_organization_id and archived_at is null
    returning customer_name into customer_label;
  if customer_label is null then raise exception '予約を確認できません。'; end if;
  insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message)
  values (p_organization_id, p_store_id, actor_id, 'booking_archived', 'booking', p_booking_id, customer_label || '様の予約を削除しました。');
end;
$$;

create or replace function public.restore_store_booking(
  p_booking_id uuid, p_organization_id uuid, p_store_id uuid, p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := coalesce(auth.uid(), p_actor_user_id);
  target public.bookings%rowtype;
  resource_ids uuid[];
  before_minutes integer := 0;
  after_minutes integer := 0;
begin
  if not public.may_write_store_booking(p_organization_id, p_store_id) then raise exception 'この店舗の予約を変更する権限がありません。'; end if;
  select * into target from public.bookings where id = p_booking_id and store_id = p_store_id and organization_id = p_organization_id and archived_at is not null;
  if target.id is null then raise exception '削除済み予約を確認できません。'; end if;
  select coalesce(array_agg(resource_id order by resource_id), '{}'::uuid[]) into resource_ids
    from public.booking_resource_allocations where booking_id = p_booking_id and archived_at is null;
  if target.service_id is not null then
    select buffer_before_minutes, buffer_after_minutes into before_minutes, after_minutes
      from public.booking_services where id = target.service_id;
  end if;
  if target.status in ('pending','confirmed') then
    perform public.assert_booking_resources_available(
      p_store_id,
      target.starts_at - make_interval(mins => before_minutes),
      target.ends_at + make_interval(mins => after_minutes),
      resource_ids,
      p_booking_id
    );
  end if;
  update public.bookings set archived_at = null, archived_by = null, updated_at = now(), updated_by = actor_id where id = p_booking_id;
  insert into public.audit_logs (organization_id, store_id, actor_user_id, action_type, target_type, target_id, message)
  values (p_organization_id, p_store_id, actor_id, 'booking_restored', 'booking', p_booking_id, target.customer_name || '様の予約を元に戻しました。');
end;
$$;

revoke all on function public.may_write_store_booking(uuid, uuid) from public, anon;
revoke all on function public.assert_booking_resources_available(uuid, timestamptz, timestamptz, uuid[], uuid) from public, anon;
revoke all on function public.create_store_booking(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid[], uuid) from public, anon;
revoke all on function public.update_store_booking(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid[], uuid) from public, anon;
revoke all on function public.archive_store_booking(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.restore_store_booking(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.create_store_booking(uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid[], uuid) to authenticated, service_role;
grant execute on function public.update_store_booking(uuid, uuid, uuid, uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, uuid[], uuid) to authenticated, service_role;
grant execute on function public.archive_store_booking(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.restore_store_booking(uuid, uuid, uuid, uuid) to authenticated, service_role;
