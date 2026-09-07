-- Authorization checks for Issue #141. Always rolled back.
begin;

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','21000000-0000-4000-8000-000000000001','authenticated','authenticated','migration-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-8000-000000000000','22000000-0000-4000-8000-000000000002','authenticated','authenticated','migration-viewer@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','23000000-0000-4000-8000-000000000003','authenticated','authenticated','migration-unaffiliated@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','24000000-0000-4000-8000-000000000004','authenticated','authenticated','migration-other@example.invalid','',now(),'{}','{}',now(),now());

insert into public.user_profiles (user_id,display_name,role,status) values
  ('21000000-0000-4000-8000-000000000001','Migration owner','user','active'),
  ('22000000-0000-4000-8000-000000000002','Migration viewer','user','active'),
  ('23000000-0000-4000-8000-000000000003','Migration unaffiliated','user','active'),
  ('24000000-0000-4000-8000-000000000004','Migration other owner','user','active');

insert into public.organizations (id,name,owner_user_id,status) values
  ('2a000000-0000-4000-8000-000000000001','Migration organization A','21000000-0000-4000-8000-000000000001','active'),
  ('2b000000-0000-4000-8000-000000000002','Migration organization B','24000000-0000-4000-8000-000000000004','active');
insert into public.stores (id,organization_id,industry_type_key,name,status) values
  ('2c000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001',(select key from public.industry_types where is_active order by key limit 1),'Migration store A','active'),
  ('2c000000-0000-4000-8000-000000000003','2a000000-0000-4000-8000-000000000001',(select key from public.industry_types where is_active order by key limit 1),'Migration store A2','active'),
  ('2d000000-0000-4000-8000-000000000002','2b000000-0000-4000-8000-000000000002',(select key from public.industry_types where is_active order by key limit 1),'Migration store B','active');
insert into public.organization_members (organization_id,user_id,role_key,status) values
  ('2a000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','org_owner','active'),
  ('2a000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','viewer','active'),
  ('2b000000-0000-4000-8000-000000000002','24000000-0000-4000-8000-000000000004','org_owner','active');

insert into public.line_booking_migrations (id,organization_id,store_id,current_provider_name,stage) values
  ('2e000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','Provider A','data_preparation'),
  ('2f000000-0000-4000-8000-000000000002','2b000000-0000-4000-8000-000000000002','2d000000-0000-4000-8000-000000000002','Provider B','assessment');
insert into public.line_booking_migration_import_rows (migration_id,organization_id,store_id,import_batch_id,row_number,row_status,normalized_data) values
  ('2e000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','29900000-0000-4000-8000-000000000001',2,'preview','{"customerName":"Private customer"}'::jsonb);

set local role authenticated;

-- Authenticated but unaffiliated users must not read or mutate a migration.
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare write_denied boolean := false;
begin
  if exists (select 1 from public.line_booking_migrations) then raise exception 'Unaffiliated user read LINE migration'; end if;
  if exists (select 1 from public.line_booking_migration_import_rows) then raise exception 'Unaffiliated user read LINE migration rows'; end if;
  begin update public.line_booking_migrations set notes = 'bypass' where id = '2e000000-0000-4000-8000-000000000001'; exception when insufficient_privilege then write_denied := true; end;
  if not write_denied then raise exception 'Unaffiliated direct update was not denied'; end if;
end $$;

-- A different organization cannot infer another store's migration.
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
do $$ begin
  if exists (select 1 from public.line_booking_migrations where store_id = '2c000000-0000-4000-8000-000000000001') then raise exception 'Other organization owner read LINE migration'; end if;
  if exists (select 1 from public.line_booking_migration_import_rows where store_id = '2c000000-0000-4000-8000-000000000001') then raise exception 'Other organization owner read LINE migration rows'; end if;
  if not exists (select 1 from public.line_booking_migrations where store_id = '2d000000-0000-4000-8000-000000000002') then raise exception 'Other organization owner could not read own LINE migration'; end if;
end $$;

-- A viewer cannot see migration operational details.
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$ begin
  if exists (select 1 from public.line_booking_migrations) then raise exception 'Viewer read LINE migration'; end if;
  if exists (select 1 from public.line_booking_migration_import_rows) then raise exception 'Viewer read LINE migration rows'; end if;
end $$;

-- The organization owner can read only its own store, but direct writes remain denied.
select set_config('request.jwt.claims','{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare insert_denied boolean := false; row_insert_denied boolean := false;
begin
  if not exists (select 1 from public.line_booking_migrations where id = '2e000000-0000-4000-8000-000000000001') then raise exception 'Owner could not read own LINE migration'; end if;
  if exists (select 1 from public.line_booking_migrations where id = '2f000000-0000-4000-8000-000000000002') then raise exception 'Owner read other LINE migration'; end if;
  if not exists (select 1 from public.line_booking_migration_import_rows where migration_id = '2e000000-0000-4000-8000-000000000001') then raise exception 'Owner could not read own LINE migration rows'; end if;
  begin insert into public.line_booking_migrations (organization_id,store_id,current_provider_name) values ('2a000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','bypass'); exception when insufficient_privilege then insert_denied := true; end;
  begin insert into public.line_booking_migration_import_rows (migration_id,organization_id,store_id,import_batch_id,row_number,row_status,normalized_data) values ('2e000000-0000-4000-8000-000000000001','2a000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','29900000-0000-4000-8000-000000000002',3,'preview','{}'::jsonb); exception when insufficient_privilege then row_insert_denied := true; end;
  if not insert_denied then raise exception 'Owner direct insert was not denied'; end if;
  if not row_insert_denied then raise exception 'Owner direct import-row insert was not denied'; end if;
end $$;

reset role;
set local role service_role;

-- Database constraints reject cross-store organization mismatches and a second active plan.
do $$
declare wrong_org_denied boolean := false; duplicate_denied boolean := false;
begin
  begin insert into public.line_booking_migrations (organization_id,store_id,current_provider_name) values ('2b000000-0000-4000-8000-000000000002','2c000000-0000-4000-8000-000000000003','Wrong organization'); exception when foreign_key_violation then wrong_org_denied := true; end;
  begin insert into public.line_booking_migrations (organization_id,store_id,current_provider_name) values ('2a000000-0000-4000-8000-000000000001','2c000000-0000-4000-8000-000000000001','Duplicate active plan'); exception when unique_violation then duplicate_denied := true; end;
  if not wrong_org_denied then raise exception 'Cross-organization store mismatch was not denied'; end if;
  if not duplicate_denied then raise exception 'Duplicate active migration was not denied'; end if;
end $$;

rollback;
