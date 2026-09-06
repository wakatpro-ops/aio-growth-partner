-- Integration checks for booking authorization and overlap rules.
-- Run against staging with:
--   supabase db query --linked --file supabase/tests/booking_hub_authz.sql
-- The transaction is always rolled back, so no fixture data remains.

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'booking-owner@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'booking-viewer@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'booking-staff@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'booking-store-viewer@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'booking-outsider@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'booking-other-owner@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'booking-suspended@example.invalid', '', now(), '{}', '{}', now(), now());

insert into public.user_profiles (user_id, display_name, role, status) values
  ('10000000-0000-4000-8000-000000000001', 'Booking owner', 'user', 'active'),
  ('20000000-0000-4000-8000-000000000002', 'Booking viewer', 'user', 'active'),
  ('30000000-0000-4000-8000-000000000003', 'Booking staff', 'user', 'active'),
  ('40000000-0000-4000-8000-000000000004', 'Booking store viewer', 'user', 'active'),
  ('50000000-0000-4000-8000-000000000005', 'Booking outsider', 'user', 'active'),
  ('60000000-0000-4000-8000-000000000006', 'Booking other owner', 'user', 'active'),
  ('70000000-0000-4000-8000-000000000007', 'Booking suspended', 'user', 'suspended');

insert into public.organizations (id, name, owner_user_id, status) values
  ('a0000000-0000-4000-8000-000000000001', 'Booking test organization A', '10000000-0000-4000-8000-000000000001', 'active'),
  ('b0000000-0000-4000-8000-000000000002', 'Booking test organization B', '60000000-0000-4000-8000-000000000006', 'active');

insert into public.stores (id, organization_id, industry_type_key, name, status) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', (select key from public.industry_types where is_active order by key limit 1), 'Booking test store A', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', (select key from public.industry_types where is_active order by key limit 1), 'Booking test store B', 'active');

insert into public.organization_members (organization_id, user_id, role_key, status) values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'org_owner', 'active'),
  ('a0000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'viewer', 'active'),
  ('b0000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000006', 'org_owner', 'active'),
  ('a0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000007', 'org_owner', 'active');

insert into public.store_memberships (organization_id, store_id, user_id, email, role_key, status, invitation_status) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'booking-staff@example.invalid', 'staff', 'active', 'accepted'),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'booking-store-viewer@example.invalid', 'viewer', 'active', 'accepted');

insert into public.booking_services (
  id, organization_id, store_id, name, duration_minutes, created_by, updated_by
) values (
  'e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'Booking test service', 60,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
);

insert into public.booking_resources (
  id, organization_id, store_id, resource_type, name, capacity, created_by, updated_by
) values (
  'f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'staff', 'Booking test staff', 1,
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'
);

set local role authenticated;

-- Authenticated but unaffiliated: must read nothing and every RPC write must fail.
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare denied boolean := false;
begin
  if exists (select 1 from public.booking_services where store_id = 'c0000000-0000-4000-8000-000000000001') then
    raise exception 'Unaffiliated user could read booking settings';
  end if;
  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-01 10:00+09', '2026-10-01 11:00+09', 'Denied outsider', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '50000000-0000-4000-8000-000000000005'
    );
  exception when others then denied := sqlerrm like '%権限%';
  end;
  if not denied then raise exception 'Unaffiliated user RPC was not denied'; end if;
end $$;

-- A user belonging only to another organization cannot see or mutate store A.
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare denied boolean := false;
begin
  if exists (select 1 from public.booking_services where store_id = 'c0000000-0000-4000-8000-000000000001') then
    raise exception 'Other organization owner could read store A';
  end if;
  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-01 10:00+09', '2026-10-01 11:00+09', 'Denied other org', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '60000000-0000-4000-8000-000000000006'
    );
  exception when others then denied := sqlerrm like '%権限%';
  end;
  if not denied then raise exception 'Other organization owner RPC was not denied'; end if;
end $$;

-- Viewer can read the assigned store, but cannot write by REST or RPC.
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare denied_rpc boolean := false; denied_rest boolean := false;
begin
  if not exists (select 1 from public.booking_services where id = 'e0000000-0000-4000-8000-000000000001') then
    raise exception 'Organization viewer could not read assigned store';
  end if;
  begin
    insert into public.bookings (organization_id, store_id, status, source, starts_at, ends_at, customer_name)
    values ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'confirmed', 'manual', now(), now() + interval '1 hour', 'REST bypass');
  exception when insufficient_privilege then denied_rest := true;
  end;
  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-01 10:00+09', '2026-10-01 11:00+09', 'Denied viewer', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '20000000-0000-4000-8000-000000000002'
    );
  exception when others then denied_rpc := sqlerrm like '%権限%';
  end;
  if not denied_rest then raise exception 'Viewer could bypass guarded RPC with a direct INSERT'; end if;
  if not denied_rpc then raise exception 'Viewer RPC was not denied'; end if;
end $$;

-- Suspended profile must be denied despite an otherwise valid owner membership.
select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
do $$
declare denied boolean := false;
begin
  if exists (select 1 from public.booking_services where store_id = 'c0000000-0000-4000-8000-000000000001') then
    raise exception 'Suspended user could read booking settings';
  end if;
  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-01 10:00+09', '2026-10-01 11:00+09', 'Denied suspended', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '70000000-0000-4000-8000-000000000007'
    );
  exception when others then denied := sqlerrm like '%権限%';
  end;
  if not denied then raise exception 'Suspended user RPC was not denied'; end if;
end $$;

-- Owner can create. The same staff/resource cannot overlap, but adjacent slots are valid.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare first_id uuid; adjacent_id uuid; overlap_denied boolean := false; direct_denied boolean := false;
begin
  begin
    insert into public.bookings (organization_id, store_id, status, source, starts_at, ends_at, customer_name)
    values ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'confirmed', 'manual', now(), now() + interval '1 hour', 'REST bypass');
  exception when insufficient_privilege then direct_denied := true;
  end;
  if not direct_denied then raise exception 'Owner could bypass guarded RPC with a direct INSERT'; end if;

  first_id := public.create_store_booking(
    'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
    'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
    '2026-10-01 10:00+09', '2026-10-01 11:00+09', 'Owner booking', '', '', 'Booking test service', '',
    array['f0000000-0000-4000-8000-000000000001']::uuid[], '10000000-0000-4000-8000-000000000001'
  );
  if first_id is null then raise exception 'Owner booking was not created'; end if;

  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-01 10:30+09', '2026-10-01 11:30+09', 'Overlap booking', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '10000000-0000-4000-8000-000000000001'
    );
  exception when others then overlap_denied := sqlerrm like '%重複%';
  end;
  if not overlap_denied then raise exception 'Overlapping booking was not denied'; end if;

  adjacent_id := public.create_store_booking(
    'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
    'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
    '2026-10-01 11:00+09', '2026-10-01 12:00+09', 'Adjacent booking', '', '', 'Booking test service', '',
    array['f0000000-0000-4000-8000-000000000001']::uuid[], '10000000-0000-4000-8000-000000000001'
  );
  if adjacent_id is null then raise exception 'Adjacent booking was not created'; end if;
end $$;

-- Store staff can edit its assigned store. Store viewer can only read it.
select set_config('request.jwt.claims', '{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare created_id uuid;
begin
  created_id := public.create_store_booking(
    'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
    'e0000000-0000-4000-8000-000000000001', 'confirmed', 'phone',
    '2026-10-02 10:00+09', '2026-10-02 11:00+09', 'Staff booking', '', '', 'Booking test service', '',
    array['f0000000-0000-4000-8000-000000000001']::uuid[], '30000000-0000-4000-8000-000000000003'
  );
  if created_id is null then raise exception 'Store staff booking was not created'; end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare denied boolean := false;
begin
  if not exists (select 1 from public.bookings where customer_name = 'Staff booking') then
    raise exception 'Store viewer could not read its assigned store';
  end if;
  begin
    perform public.create_store_booking(
      'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', null,
      'e0000000-0000-4000-8000-000000000001', 'confirmed', 'manual',
      '2026-10-03 10:00+09', '2026-10-03 11:00+09', 'Denied store viewer', '', '', 'Booking test service', '',
      array['f0000000-0000-4000-8000-000000000001']::uuid[], '40000000-0000-4000-8000-000000000004'
    );
  exception when others then denied := sqlerrm like '%権限%';
  end;
  if not denied then raise exception 'Store viewer RPC was not denied'; end if;
end $$;

reset role;
rollback;

select 'booking hub authorization integration checks passed' as result;
