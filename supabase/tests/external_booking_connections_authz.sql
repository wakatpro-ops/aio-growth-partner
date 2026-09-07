-- Authorization and tenant-boundary checks for Issue #136. Always rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','authenticated','authenticated','external-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','82000000-0000-4000-8000-000000000002','authenticated','authenticated','external-other@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','83000000-0000-4000-8000-000000000003','authenticated','authenticated','external-unaffiliated@example.invalid','',now(),'{}','{}',now(),now());

insert into public.user_profiles (user_id,display_name,role,status) values
  ('81000000-0000-4000-8000-000000000001','External owner','user','active'),
  ('82000000-0000-4000-8000-000000000002','External other owner','user','active'),
  ('83000000-0000-4000-8000-000000000003','External unaffiliated','user','active');

insert into public.organizations (id,name,owner_user_id,status) values
  ('8a000000-0000-4000-8000-000000000001','External organization A','81000000-0000-4000-8000-000000000001','active'),
  ('8b000000-0000-4000-8000-000000000002','External organization B','82000000-0000-4000-8000-000000000002','active');
insert into public.stores (id,organization_id,industry_type_key,name,status) values
  ('8c000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001',(select key from public.industry_types where is_active order by key limit 1),'External store A','active'),
  ('8d000000-0000-4000-8000-000000000002','8b000000-0000-4000-8000-000000000002',(select key from public.industry_types where is_active order by key limit 1),'External store B','active');
insert into public.organization_members (organization_id,user_id,role_key,status) values
  ('8a000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','org_owner','active'),
  ('8b000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','org_owner','active');

insert into public.external_booking_connections (
  id,organization_id,store_id,provider_key,connection_mode,status,owner_authorized_at,owner_authorized_by
) values (
  '8e000000-0000-4000-8000-000000000001','8a000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001',
  'stores_reservation','official_read_api','preparing',now(),'81000000-0000-4000-8000-000000000001'
);

set local role authenticated;

-- Even the owner must use the authorized server boundary; direct table access is denied.
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare read_denied boolean := false; write_denied boolean := false;
begin
  begin perform id from public.external_booking_connections; exception when insufficient_privilege then read_denied := true; end;
  begin update public.external_booking_connections set notes = 'bypass'; exception when insufficient_privilege then write_denied := true; end;
  if not read_denied then raise exception 'Owner direct read was not denied'; end if;
  if not write_denied then raise exception 'Owner direct update was not denied'; end if;
end $$;

-- Authenticated but unaffiliated and other-organization users have the same hard denial.
select set_config('request.jwt.claims','{"sub":"83000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin perform id from public.external_booking_connections; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unaffiliated direct read was not denied'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ declare denied boolean := false; begin
  begin insert into public.external_booking_connections (organization_id,store_id,provider_key,connection_mode,owner_authorized_at) values ('8a000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','reserva','contract_api',now()); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Other organization direct insert was not denied'; end if;
end $$;

reset role;
set local role service_role;

do $$
declare duplicate_denied boolean := false; cross_org_denied boolean := false; writable_denied boolean := false;
begin
  begin insert into public.external_booking_connections (organization_id,store_id,provider_key,connection_mode,owner_authorized_at) values ('8a000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','stores_reservation','official_read_api',now()); exception when unique_violation then duplicate_denied := true; end;
  begin insert into public.external_booking_connections (organization_id,store_id,provider_key,connection_mode,owner_authorized_at) values ('8b000000-0000-4000-8000-000000000002','8c000000-0000-4000-8000-000000000001','reserva','contract_api',now()); exception when foreign_key_violation then cross_org_denied := true; end;
  begin insert into public.external_booking_connections (organization_id,store_id,provider_key,connection_mode,owner_authorized_at,read_only) values ('8a000000-0000-4000-8000-000000000001','8c000000-0000-4000-8000-000000000001','minimo','partner_inquiry',now(),false); exception when check_violation then writable_denied := true; end;
  if not duplicate_denied then raise exception 'Duplicate active provider was not denied'; end if;
  if not cross_org_denied then raise exception 'Cross-organization store mismatch was not denied'; end if;
  if not writable_denied then raise exception 'Writable connection was not denied'; end if;
end $$;

rollback;
