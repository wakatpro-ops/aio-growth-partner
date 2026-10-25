-- STAGING ONLY. All synthetic users, businesses, versions and audit rows roll back.
begin;
do $$ declare k text; begin
  foreach k in array array['owner','manager','staff','admin','stranger','org','foreign_org','store','foreign_store'] loop
    perform set_config('test.square_'||k,gen_random_uuid()::text,true);
  end loop;
end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',current_setting('test.square_'||k)::uuid,'authenticated','authenticated',current_setting('test.square_'||k)||'@example.invalid','',now(),'{}','{}',now(),now()
from unnest(array['owner','manager','staff','admin','stranger']) k;
insert into public.user_profiles(user_id,display_name,role,status)
select current_setting('test.square_'||k)::uuid,'SQUARE SYNTHETIC',case when k='admin' then 'platform_admin' else 'user' end,'active'
from unnest(array['owner','manager','staff','admin','stranger']) k
on conflict(user_id) do update set role=excluded.role,status='active',archived_at=null;
insert into public.organizations(id,name,status) values(current_setting('test.square_org')::uuid,'SQUARE SYNTHETIC','active'),(current_setting('test.square_foreign_org')::uuid,'SQUARE SYNTHETIC FOREIGN','active');
insert into public.stores(id,organization_id,name,industry_type_key,status)
values(current_setting('test.square_store')::uuid,current_setting('test.square_org')::uuid,'Square架空店舗','restaurant','active'),
  (current_setting('test.square_foreign_store')::uuid,current_setting('test.square_foreign_org')::uuid,'Square架空他法人','restaurant','active');
insert into public.organization_members(organization_id,user_id,role_key,status)
values(current_setting('test.square_org')::uuid,current_setting('test.square_owner')::uuid,'org_owner','active');
insert into public.store_memberships(organization_id,store_id,user_id,email,role_key,status)
select current_setting('test.square_org')::uuid,current_setting('test.square_store')::uuid,current_setting('test.square_'||k)::uuid,k||'@example.invalid',case when k='manager' then 'store_manager' else 'staff' end,'active'
from unnest(array['manager','staff']) k;

set local role anon;
do $$ declare denied boolean; target text; begin
  foreach target in array array['square_pos_connections','square_pos_transaction_versions','square_pos_oauth_sessions'] loop
    denied:=false; begin execute format('select count(*) from public.%I',target); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Anonymous secret/history access allowed'; end if;
  end loop;
end $$;
reset role;
set local role authenticated;
do $$ declare denied boolean; target text; p record; begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.square_owner'),'role','authenticated')::text,true);
  for p in select x.oid from pg_proc x join pg_namespace n on n.oid=x.pronamespace where n.nspname='public' and x.proname like '%square_pos%' loop
    if has_function_privilege(current_user,p.oid,'EXECUTE') then raise exception 'Browser access to private Square function'; end if;
  end loop;
  foreach target in array array['square_pos_connections','square_pos_transaction_versions','square_pos_oauth_sessions'] loop
    denied:=false; begin execute format('select count(*) from public.%I',target); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Owner JWT direct secret/history access allowed'; end if;
  end loop;
  denied:=false; begin perform public.begin_square_pos_oauth(current_setting('test.square_owner')::uuid,current_setting('test.square_store')::uuid,repeat('a',64),'sandbox','https://staging.aioboost.jp/api/square/oauth/callback'); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Direct browser mutation RPC allowed'; end if;
end $$;
reset role;

create function pg_temp.square_sale(source text,revision text,kind text default 'sale',amount integer default 1100)
returns jsonb language sql as $$
select jsonb_build_object('sourceId',source,'revisionAt',revision,'occurredAt','2026-10-24T01:00:00+09:00','businessDate','2026-10-24','kind',kind,'amountMinor',amount,'taxMinor',case when kind='void' then 0 else 100 end,'discountMinor',0,'paymentMethod','現金','adjustmentMinor',0,'items','[]'::jsonb);
$$;
do $$
<<square_pos_authz>>
declare owner_id uuid:=current_setting('test.square_owner')::uuid; store_id uuid:=current_setting('test.square_store')::uuid;
  admin_id uuid:=current_setting('test.square_admin')::uuid; s uuid; c uuid; stale uuid; other_s uuid;
  merchant text:='synthetic-'||gen_random_uuid(); location text:='location-'||gen_random_uuid(); external_id text;
  state_hash text; consumed jsonb; locations jsonb; lease jsonb; result jsonb; denied boolean; actor text; revision integer; n bigint; amount numeric; v_source uuid;
begin
  external_id:='sandbox:'||merchant||':'||location;
  locations:=jsonb_build_array(jsonb_build_object('id',location,'merchant_id',merchant,'name','架空Square店舗','country','JP','currency','JPY','timezone','Asia/Tokyo','status','ACTIVE'));
  foreach actor in array array['manager','staff','stranger'] loop
    if public.square_pos_owner_allowed(current_setting('test.square_'||actor)::uuid,store_id) then raise exception 'Non-owner allowed'; end if;
    denied:=false; begin perform public.begin_square_pos_oauth(current_setting('test.square_'||actor)::uuid,store_id,repeat('b',64),'sandbox','https://staging.aioboost.jp/api/square/oauth/callback'); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'Non-owner OAuth allowed'; end if;
  end loop;
  if public.square_pos_owner_allowed(owner_id,current_setting('test.square_foreign_store')::uuid) then raise exception 'Cross-tenant owner allowed'; end if;
  state_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  s:=public.begin_square_pos_oauth(owner_id,store_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  denied:=false; begin perform public.consume_square_pos_oauth(admin_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'OAuth actor substitution allowed'; end if;
  denied:=false; begin perform public.consume_square_pos_oauth(owner_id,state_hash,'production','https://staging.aioboost.jp/api/square/oauth/callback'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'OAuth environment substitution allowed'; end if;
  consumed:=public.consume_square_pos_oauth(owner_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  if (consumed->>'id')::uuid<>s then raise exception 'OAuth session mismatch'; end if;
  denied:=false; begin perform public.consume_square_pos_oauth(owner_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'OAuth replay allowed'; end if;
  perform public.stage_square_pos_oauth(owner_id,s,'sp1.synthetic-not-a-credential',merchant,locations,now()+interval '30 days');
  denied:=false; begin perform public.confirm_square_pos_oauth(owner_id,store_id,s,'other-location'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Unprobed location allowed'; end if;
  c:=public.confirm_square_pos_oauth(owner_id,store_id,s,location);
  if exists(select 1 from public.square_pos_oauth_sessions where id=s and pending_ciphertext is not null) then raise exception 'Consumed token was retained'; end if;
  perform set_config('test.square_connection',c::text,true);
  denied:=false; begin perform public.confirm_square_pos_oauth(owner_id,store_id,s,location); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Connection confirmation replay allowed'; end if;

  state_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  other_s:=public.begin_square_pos_oauth(admin_id,current_setting('test.square_foreign_store')::uuid,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.consume_square_pos_oauth(admin_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.stage_square_pos_oauth(admin_id,other_s,'sp1.synthetic-not-a-credential',merchant,locations,now()+interval '30 days');
  denied:=false; begin perform public.confirm_square_pos_oauth(admin_id,current_setting('test.square_foreign_store')::uuid,other_s,location); exception when unique_violation then denied:=true; end;
  if not denied then raise exception 'One Square location bound to two AIOb stores'; end if;
  if exists(select 1 from public.square_pos_connections x where x.store_id=current_setting('test.square_foreign_store')::uuid) then raise exception 'Failed confirmation partially committed'; end if;

  -- A prior Square CSV must not silently overlap the initial API history.
  insert into public.external_data_sources(organization_id,store_id,provider_key,connection_type,name)
    values(current_setting('test.square_foreign_org')::uuid,current_setting('test.square_foreign_store')::uuid,'square','file_upload','SQUARE SYNTHETIC CSV') returning id into v_source;
  insert into public.sales_transactions(organization_id,store_id,data_source_id,source_row_hash,transaction_date,business_date,gross_amount,tax_amount,net_amount)
    values(current_setting('test.square_foreign_org')::uuid,current_setting('test.square_foreign_store')::uuid,v_source,'synthetic-csv:'||gen_random_uuid(),now(),(now() at time zone 'Asia/Tokyo')::date,1100,100,1000);
  state_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  other_s:=public.begin_square_pos_oauth(admin_id,current_setting('test.square_foreign_store')::uuid,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.consume_square_pos_oauth(admin_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.stage_square_pos_oauth(admin_id,other_s,'sp1.synthetic-not-a-credential',merchant,locations,now()+interval '30 days');
  denied:=false; begin perform public.confirm_square_pos_oauth(admin_id,current_setting('test.square_foreign_store')::uuid,other_s,location); exception when raise_exception then
    if sqlerrm<>'square_csv_overlap_review_required' then raise; end if; denied:=true;
  end;
  if not denied then raise exception 'Existing Square CSV overlap not held'; end if;

  state_hash:=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text);
  stale:=public.begin_square_pos_oauth(owner_id,store_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.consume_square_pos_oauth(owner_id,state_hash,'sandbox','https://staging.aioboost.jp/api/square/oauth/callback');
  perform public.stage_square_pos_oauth(owner_id,stale,'sp1.synthetic-stale',merchant,locations,now()+interval '30 days');
  select x.revision into revision from public.square_pos_connections x where x.id=c;
  perform public.transition_square_pos_connection(owner_id,store_id,c,'pause',revision);
  denied:=false; begin perform public.confirm_square_pos_oauth(owner_id,store_id,stale,location); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Stale OAuth overwrote newer settings'; end if;
  select x.revision into revision from public.square_pos_connections x where x.id=c;
  perform public.transition_square_pos_connection(owner_id,store_id,c,'resume',revision);
  if public.claim_square_pos_sync(c,'orders-2026-09-16-v1','production') is not null then raise exception 'Sandbox connection claimed in production'; end if;
  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  if lease is null or public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox') is not null then raise exception 'Lease exclusivity failed'; end if;
  denied:=false; begin perform public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,'other-store',jsonb_build_array(pg_temp.square_sale('sale','2026-10-24T02:00:00Z')),null,'2026-10-24T04:00:00Z'); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Cross-store page allowed'; end if;
  result:=public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('sale','2026-10-24T02:00:00Z')),null,'2026-10-24T04:00:00Z');
  if (result->>'changed')::int<>1 then raise exception 'Sale not applied'; end if;
  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  result:=public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('sale','2026-10-24T02:00:00Z')),null,'2026-10-24T04:00:00Z');
  if (result->>'changed')::int<>0 or (select count(*) from public.square_pos_transaction_versions where connection_id=c)<>1 then raise exception 'Replay duplicated financial records'; end if;
  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  perform public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('sale','2026-10-24T02:10:00Z','sale',2200)),null,'2026-10-24T04:00:00Z');
  select gross_amount into amount from public.normalized_sales_summaries where public.normalized_sales_summaries.store_id=square_pos_authz.store_id and summary_type='monthly';
  if amount<>2200 then raise exception 'Revision did not replace prior projection'; end if;
  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  denied:=false; begin perform public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('new','2026-10-24T02:20:00Z'),pg_temp.square_sale('sale','2026-10-24T02:10:00Z','sale',3300)),null,'2026-10-24T04:00:00Z'); exception when raise_exception then denied:=true; end;
  if not denied or exists(select 1 from public.square_pos_transaction_versions where connection_id=c and source_id='new') then raise exception 'Conflicting page did not roll back atomically'; end if;
  perform public.fail_square_pos_sync(c,(lease->>'lease_id')::uuid,'square_rate_limited');
  if not exists(select 1 from public.square_pos_connections where id=c and failure_count=1 and next_sync_at>now()+interval '1 minute') then raise exception 'Rate-limit backoff failed'; end if;

  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  perform public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('refund','2026-10-24T02:30:00Z','refund',1100)),null,'2026-10-24T04:00:00Z');
  if (select gross_amount from public.normalized_sales_summaries x where x.store_id=square_pos_authz.store_id and summary_type='monthly')<>1100 then raise exception 'Refund not deducted'; end if;
  update public.square_pos_connections set next_sync_at=now()-interval '1 minute' where id=c;
  lease:=public.claim_square_pos_sync(c,'orders-2026-09-16-v1','sandbox');
  perform public.apply_square_pos_page(c,(lease->>'lease_id')::uuid,external_id,jsonb_build_array(pg_temp.square_sale('sale','2026-10-24T02:40:00Z','void',0),pg_temp.square_sale('refund','2026-10-24T02:40:00Z','void',0)),null,'2026-10-24T04:00:00Z');
  if exists(select 1 from public.normalized_sales_summaries x where x.store_id=square_pos_authz.store_id) then raise exception 'Voids remained in revenue or transaction count'; end if;
  perform public.air_regi_rebuild_summaries(current_setting('test.square_org')::uuid,store_id);
  if exists(select 1 from public.normalized_sales_summaries x where x.store_id=square_pos_authz.store_id) then raise exception 'Other POS adapter re-counted Square voids'; end if;
  select count(*) into n from public.square_pos_transaction_versions where connection_id=c;
  select x.revision into revision from public.square_pos_connections x where x.id=c;
  perform public.transition_square_pos_connection(owner_id,store_id,c,'archive',revision);
  if exists(select 1 from public.square_pos_connections where id=c and encrypted_credentials is not null) then raise exception 'Archived credential retained'; end if;
  if (select count(*) from public.square_pos_transaction_versions where connection_id=c)<>n then raise exception 'History physically deleted'; end if;
  if exists(select 1 from public.square_pos_oauth_sessions x where x.store_id=square_pos_authz.store_id and pending_ciphertext is not null) then raise exception 'Pending credentials retained on disconnect'; end if;
  select x.revision into revision from public.square_pos_connections x where x.id=c;
  perform public.transition_square_pos_connection(owner_id,store_id,c,'restore',revision);
  select x.revision into revision from public.square_pos_connections x where x.id=c;
  denied:=false; begin perform public.transition_square_pos_connection(owner_id,store_id,c,'resume',revision); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Restore implicitly authorized a disconnected integration'; end if;
  if not exists(select 1 from public.audit_logs where target_id=c and action_type='square_pos_restore') then raise exception 'Lifecycle audit missing'; end if;
  update public.user_profiles set archived_at=now() where user_id=owner_id;
  if public.square_pos_owner_allowed(owner_id,store_id) then raise exception 'Archived owner allowed'; end if;
  update public.user_profiles set archived_at=null where user_id=owner_id;
  update auth.users set banned_until=now()+interval '1 day' where id=owner_id;
  if public.square_pos_owner_allowed(owner_id,store_id) then raise exception 'Banned owner allowed'; end if;
end square_pos_authz; $$;
rollback;
select 'PASS Square SQL: roles, tenant/environment/actor binding, one-use OAuth, stale settings, global identity, lease, replay, revision, atomic rollback, refund/void, backoff, archive/restore/audit; fixtures rolled back' as result;
