-- Run only in an empty disposable LOCAL PostgreSQL database as its owner.
\set ON_ERROR_STOP on
do $$begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.air_regi_connections (
  id uuid primary key, organization_id uuid,store_id uuid,data_source_id uuid,authorized_by uuid,
  status text, last_error_code text,failure_count integer default 0,interval_seconds integer default 300,
  next_sync_at timestamptz,lease_id uuid,lease_until timestamptz,updated_at timestamptz,archived_at timestamptz,encrypted_credentials text,cursor text,watermark timestamptz
);
create table public.external_data_sources (id uuid primary key,status text,updated_at timestamptz,connection_type text default 'api');
create table public.stores (id uuid primary key,organization_id uuid);
create table public.sales_transactions (id uuid default gen_random_uuid(),store_id uuid,organization_id uuid,data_source_id uuid,business_date date);
create table public.audit_logs (organization_id uuid,store_id uuid,actor_user_id uuid,action_type text,target_type text,target_id uuid,message text,metadata jsonb);
create table public.synthetic_retained_sales (amount numeric);
insert into public.synthetic_retained_sales values(1100);
\ir ../../supabase/migrations/202610280001_airregi_connection_errors.sql
\ir ../../supabase/migrations/202610280002_airregi_import_cutover_guard.sql
do $$
declare v_id uuid:=gen_random_uuid(); source uuid:=gen_random_uuid(); lease uuid:=gen_random_uuid(); c public.air_regi_connections; code text;
begin
  assert not has_function_privilege('anon','public.fail_air_regi_sync(uuid,uuid,text)','execute');
  assert not has_function_privilege('authenticated','public.fail_air_regi_sync(uuid,uuid,text)','execute');
  assert has_function_privilege('service_role','public.fail_air_regi_sync(uuid,uuid,text)','execute');
  insert into public.external_data_sources(id,status,updated_at) values(source,'active',now());
  insert into public.air_regi_connections(id,organization_id,store_id,data_source_id,authorized_by,status,lease_id)
    values(v_id,gen_random_uuid(),gen_random_uuid(),source,gen_random_uuid(),'active',lease);
  foreach code in array array['authentication_required','accounting_review_required','history_expired','store_mismatch'] loop
    update public.air_regi_connections set status='active',lease_id=lease where air_regi_connections.id=v_id;
    update public.external_data_sources set status='active' where external_data_sources.id=source;
    perform public.fail_air_regi_sync(v_id,lease,code);
    select * into c from public.air_regi_connections where air_regi_connections.id=v_id;
    assert c.status='paused' and c.last_error_code=code and c.lease_id is null;
    assert (select status='inactive' from public.external_data_sources where external_data_sources.id=source);
  end loop;
  update public.air_regi_connections set status='active',lease_id=lease where air_regi_connections.id=v_id;
  perform public.fail_air_regi_sync(v_id,gen_random_uuid(),'store_mismatch');
  assert (select status='active' and lease_id=lease from public.air_regi_connections where air_regi_connections.id=v_id),'stale worker must not stop a new lease';
  perform public.fail_air_regi_sync(v_id,lease,'private-provider-secret');
  select * into c from public.air_regi_connections where air_regi_connections.id=v_id;
  assert c.last_error_code='sync_failed' and c.status='error';
  assert c.next_sync_at>now()+interval '500 seconds';
  assert (select count(*)=4 from public.audit_logs where action_type='air_regi_sync_paused');
  assert not exists(select 1 from public.audit_logs where metadata::text like '%private-provider-secret%');
  assert (select sum(amount)=1100 from public.synthetic_retained_sales),'business evidence must remain unchanged';
end $$;
do $$
declare org uuid:=gen_random_uuid(); store uuid:=gen_random_uuid(); connection uuid:=gen_random_uuid(); file_source uuid:=gen_random_uuid(); api_source uuid:=gen_random_uuid();
begin
  insert into public.stores values(store,org);
  insert into public.external_data_sources(id,connection_type) values(file_source,'file_upload'),(api_source,'api');
  insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,file_source,current_date);
  begin
    insert into public.air_regi_connections(id,organization_id,store_id,data_source_id,status,encrypted_credentials) values(connection,org,store,api_source,'active','synthetic');
    raise exception 'test should have rejected overlapping file sales';
  exception when raise_exception then
    assert sqlerrm='air_regi_existing_sales_review_required';
  end;
  -- Change only this explicitly synthetic fixture's date to test old history.
  update public.sales_transactions set business_date=current_date-100 where store_id=store;
  insert into public.air_regi_connections(id,organization_id,store_id,data_source_id,status,encrypted_credentials) values(connection,org,store,api_source,'active','synthetic');
  begin
    insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,file_source,current_date);
    raise exception 'test should have rejected a later overlapping import';
  exception when raise_exception then
    assert sqlerrm='air_regi_existing_sales_review_required';
  end;
  insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,api_source,current_date);
  assert (select count(*)=2 from public.sales_transactions where store_id=store);
  begin
    insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,api_source,current_date-100);
    raise exception 'old business day API update must not duplicate a historical CSV';
  exception when raise_exception then assert sqlerrm='air_regi_existing_sales_review_required'; end;
  update public.air_regi_connections set status='paused' where id=connection;
  insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,api_source,current_date-90);
  begin
    insert into public.sales_transactions(store_id,organization_id,data_source_id,business_date) values(store,org,file_source,current_date-90);
    raise exception 'stopping sync does not erase historical duplicate risk';
  exception when raise_exception then assert sqlerrm='air_regi_existing_sales_review_required'; end;
  update public.air_regi_connections set cursor='synthetic-old-scope',watermark='2026-10-01T00:00:00Z' where id=connection;
  update public.air_regi_connections set encrypted_credentials='synthetic-rotated',status='active' where id=connection;
  assert (select cursor is null and watermark='2026-10-01T00:00:00Z'::timestamptz from public.air_regi_connections where id=connection),'key rotation must restart unfinished pages without losing the committed watermark';
end $$;
