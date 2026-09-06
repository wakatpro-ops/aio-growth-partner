-- Integration checks for Issue #135. Always rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','11000000-0000-4000-8000-000000000001','authenticated','authenticated','line-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','12000000-0000-4000-8000-000000000002','authenticated','authenticated','line-viewer@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','13000000-0000-4000-8000-000000000003','authenticated','authenticated','line-outsider@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','14000000-0000-4000-8000-000000000004','authenticated','authenticated','line-other@example.invalid','',now(),'{}','{}',now(),now());

insert into public.user_profiles (user_id,display_name,role,status) values
  ('11000000-0000-4000-8000-000000000001','Line owner','user','active'),
  ('12000000-0000-4000-8000-000000000002','Line viewer','user','active'),
  ('13000000-0000-4000-8000-000000000003','Line unaffiliated','user','active'),
  ('14000000-0000-4000-8000-000000000004','Line other store owner','user','active');

insert into public.organizations (id,name,owner_user_id,status) values
  ('aa000000-0000-4000-8000-000000000001','Line organization A','11000000-0000-4000-8000-000000000001','active'),
  ('bb000000-0000-4000-8000-000000000002','Line organization B','14000000-0000-4000-8000-000000000004','active');
insert into public.stores (id,organization_id,industry_type_key,name,status) values
  ('cc000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',(select key from public.industry_types where is_active order by key limit 1),'Line store A','active'),
  ('dd000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002',(select key from public.industry_types where is_active order by key limit 1),'Line store B','active');
insert into public.organization_members (organization_id,user_id,role_key,status) values
  ('aa000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','org_owner','active'),
  ('aa000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','viewer','active'),
  ('bb000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000004','org_owner','active');

insert into public.booking_services (id,organization_id,store_id,name,duration_minutes,created_by,updated_by) values
  ('ee000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','LINE施術',60,'11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
  ('ee000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000002','他店施術',60,'14000000-0000-4000-8000-000000000004','14000000-0000-4000-8000-000000000004');
insert into public.booking_resources (id,organization_id,store_id,resource_type,name,capacity,created_by,updated_by) values
  ('ff000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','staff','LINE担当',1,'11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001');
insert into public.line_store_integrations (id,organization_id,store_id,channel_id,display_name,auto_confirm_bookings) values
  ('1a000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','test-channel','Line store A',false),
  ('1b000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000002','test-channel','Line store B',false);
insert into public.line_booking_contacts (id,integration_id,organization_id,store_id,line_user_hash,line_user_ciphertext,consent_version,consented_at) values
  ('2a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','user-a','cipher-a','2026-09-06',now()),
  ('2a000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','user-unconsented','cipher-b',null,null),
  ('2b000000-0000-4000-8000-000000000003','1b000000-0000-4000-8000-000000000002','bb000000-0000-4000-8000-000000000002','dd000000-0000-4000-8000-000000000002','user-b','cipher-c','2026-09-06',now());

set local role authenticated;

-- Unaffiliated authenticated users cannot see LINE data, insert directly, or call the service-only RPC.
select set_config('request.jwt.claims','{"sub":"13000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare rpc_denied boolean := false; insert_denied boolean := false;
begin
  if exists (select 1 from public.line_store_integrations where store_id = 'cc000000-0000-4000-8000-000000000001') then raise exception 'Unaffiliated user read LINE integration'; end if;
  begin insert into public.line_store_integrations (organization_id,store_id,channel_id) values ('aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','bypass'); exception when insufficient_privilege then insert_denied := true; end;
  begin perform public.create_line_store_booking('1a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001',null,'2030-10-01 10:00+09','Denied','evt-denied'); exception when insufficient_privilege then rpc_denied := true; when others then rpc_denied := sqlerrm like '%権限%'; end;
  if not insert_denied then raise exception 'Direct insert by unaffiliated user was not denied'; end if;
  if not rpc_denied then raise exception 'Unaffiliated user RPC was not denied'; end if;
end $$;

-- A user from another organization cannot see this store.
select set_config('request.jwt.claims','{"sub":"14000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  if exists (select 1 from public.line_store_integrations where store_id = 'cc000000-0000-4000-8000-000000000001') then raise exception 'Other store owner read LINE integration'; end if;
  if exists (select 1 from public.line_booking_contacts where store_id = 'cc000000-0000-4000-8000-000000000001') then raise exception 'Other store owner read LINE contacts'; end if;
end $$;

-- Viewer may see connection status but not contact identifiers and cannot write.
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare insert_denied boolean := false;
begin
  if not exists (select 1 from public.line_store_integrations where id = '1a000000-0000-4000-8000-000000000001') then raise exception 'Viewer could not read status'; end if;
  if exists (select 1 from public.line_booking_contacts where store_id = 'cc000000-0000-4000-8000-000000000001') then raise exception 'Viewer read private LINE contacts'; end if;
  begin insert into public.line_store_link_codes (integration_id,organization_id,store_id,code_hash,code_hint,expires_at) values ('1a000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','bypass','xx',now()+interval '1 hour'); exception when insufficient_privilege then insert_denied := true; end;
  if not insert_denied then raise exception 'Direct insert by Viewer was not denied'; end if;
end $$;

reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

-- Unconsented and wrong-store contacts are rejected even to service role.
do $$
declare denied boolean := false;
begin
  begin perform public.create_line_store_booking('1a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000002','ee000000-0000-4000-8000-000000000001',null,'2030-10-01 10:00+09','Unconsented','evt-unconsented'); exception when others then denied := sqlerrm like '%同意%'; end;
  if not denied then raise exception 'Unconsented contact was accepted'; end if;
  denied := false;
  begin perform public.create_line_store_booking('1a000000-0000-4000-8000-000000000001','2b000000-0000-4000-8000-000000000003','ee000000-0000-4000-8000-000000000001',null,'2030-10-01 10:00+09','Wrong contact','evt-wrong'); exception when others then denied := sqlerrm like '%同意%'; end;
  if not denied then raise exception 'Wrong contact/store combination was accepted'; end if;
end $$;

-- Valid booking is pending by default and reuses the Phase 1 overlap lock.
do $$
declare first_id uuid; overlap_denied boolean := false;
begin
  first_id := public.create_line_store_booking('1a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','2030-10-01 10:00+09','正常LINE予約','evt-ok');
  if not exists (select 1 from public.bookings where id = first_id and status = 'pending' and source = 'line' and line_contact_id = '2a000000-0000-4000-8000-000000000001') then raise exception 'Valid LINE booking was not pending'; end if;
  if not exists (select 1 from public.line_booking_reminders where booking_id = first_id and status = 'scheduled') then raise exception 'LINE reminder was not scheduled'; end if;
  begin perform public.create_line_store_booking('1a000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','ee000000-0000-4000-8000-000000000001','ff000000-0000-4000-8000-000000000001','2030-10-01 10:30+09','Overlap','evt-overlap'); exception when others then overlap_denied := sqlerrm like '%重複%'; end;
  if not overlap_denied then raise exception 'Overlap LINE booking was not denied'; end if;
end $$;

rollback;

