-- Run against staging only, as postgres. Synthetic rows and every permission/trigger change roll back.
begin;
do $$ begin
  perform set_config('test.ai_usage_admin',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_banned',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_archived',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_user',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_cross',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_current',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_previous',gen_random_uuid()::text,true);
  perform set_config('test.ai_usage_feature','test_'||gen_random_uuid()::text,true);
end $$;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',current_setting(setting)::uuid,'authenticated','authenticated',current_setting(setting)||'@example.invalid','',now(),'{}','{}',now(),now()
from unnest(array['test.ai_usage_admin','test.ai_usage_banned','test.ai_usage_archived','test.ai_usage_user']) setting;
insert into public.user_profiles(user_id,display_name,role,status,archived_at)
select current_setting(setting)::uuid,'AI usage synthetic audit',case when setting='test.ai_usage_user' then 'user' else 'platform_admin' end,'active',case when setting='test.ai_usage_archived' then now() else null end
from unnest(array['test.ai_usage_admin','test.ai_usage_banned','test.ai_usage_archived','test.ai_usage_user']) setting
on conflict(user_id) do update set role=excluded.role,status=excluded.status,archived_at=excluded.archived_at;
update auth.users set banned_until=now()+interval '1 day' where id=current_setting('test.ai_usage_banned')::uuid;

set local role anon;
do $$ declare denied boolean; target text; begin
  foreach target in array array['ai_usage_events','ai_usage_settings','ai_usage_monthly_settings'] loop
    denied:=false; begin execute format('select count(*) from public.%I',target); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'Anonymous direct read allowed: %',target; end if;
  end loop;
end $$;
reset role;
set local role authenticated;
do $$ declare denied boolean; target text; persona text; begin
  foreach persona in array array['test.ai_usage_user','test.ai_usage_admin','test.ai_usage_banned','test.ai_usage_archived'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting(persona),'role','authenticated')::text,true);
    foreach target in array array['ai_usage_events','ai_usage_settings','ai_usage_monthly_settings'] loop
      denied:=false; begin execute format('select count(*) from public.%I',target); exception when insufficient_privilege then denied:=true; end;
      if not denied then raise exception 'JWT direct read allowed: % / %',persona,target; end if;
      denied:=false; begin execute format('delete from public.%I where false',target); exception when insufficient_privilege then denied:=true; end;
      if not denied then raise exception 'JWT direct deletion allowed: % / %',persona,target; end if;
    end loop;
    denied:=false; begin perform public.ai_usage_dashboard_summary('2099-12-01','2099-12-05T03:00:00Z'); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'JWT summary RPC allowed'; end if;
    denied:=false; begin perform public.save_ai_usage_monthly_settings('2099-12-01',150,50000,current_setting('test.ai_usage_admin')::uuid); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'JWT settings RPC allowed'; end if;
    denied:=false; begin perform public.activate_ai_usage_metering(now()); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'JWT metering activation allowed'; end if;
    denied:=false; begin perform public.ai_usage_actor_is_active_admin(current_setting('test.ai_usage_admin')::uuid); exception when insufficient_privilege then denied:=true; end;
    if not denied then raise exception 'JWT private active-admin helper allowed'; end if;
  end loop;
end $$;
reset role;
set local role service_role;

-- A retry crossing midnight/month start remains a retry, not a new first attempt.
insert into public.ai_usage_events(operation_id,attempt,feature,endpoint,model,status,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,web_search_calls,token_cost_usd,tool_cost_usd,estimated_cost_usd,cost_status,duration_ms,created_at)
select current_setting('test.ai_usage_cross')::uuid,i,current_setting('test.ai_usage_feature'),'/test','synthetic','success',100,10,10,0,0,0.001,0,0.001,'estimated',1,
case when i=1 then '2099-11-30T14:59:59Z'::timestamptz else '2099-11-30T15:00:00Z'::timestamptz end from generate_series(1,2) i;
-- More than the default 1000-row API cap; aggregate must include every event.
insert into public.ai_usage_events(operation_id,attempt,feature,endpoint,model,status,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,web_search_calls,token_cost_usd,tool_cost_usd,estimated_cost_usd,cost_status,duration_ms,created_at)
select current_setting('test.ai_usage_current')::uuid,i,current_setting('test.ai_usage_feature'),'/test','synthetic',case when i=1005 then 'error' else 'success' end,
case when i=1005 then null else 100 end,case when i=1005 then null else 10 end,case when i=1005 then null else 10 end,case when i=1005 then null else 0 end,0,
case when i=1005 then null else 0.001 end,0,case when i=1005 then null else 0.001 end,case when i=1005 then 'usage_missing' else 'estimated' end,1,'2099-12-04T10:00:00Z'
from generate_series(1,1005) i;
insert into public.ai_usage_events(operation_id,attempt,feature,endpoint,model,status,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,web_search_calls,token_cost_usd,tool_cost_usd,estimated_cost_usd,cost_status,duration_ms,created_at)
select current_setting('test.ai_usage_previous')::uuid,i,current_setting('test.ai_usage_feature'),'/test','synthetic','success',100,10,10,0,0,0.001,0,0.001,'estimated',1,'2099-12-03T10:00:00Z' from generate_series(1,2) i;

do $$ declare summary jsonb; feature jsonb; recent jsonb; denied boolean; persona text; begin
  summary:=public.ai_usage_dashboard_summary('2099-12-01','2099-12-05T03:00:00Z');
  select value into feature from jsonb_array_elements(summary->'features') where value->>'key'=current_setting('test.ai_usage_feature');
  if feature is null or (feature->>'requests')::int<>1008 or (feature->>'operations')::int<>3 or (feature->>'retries')::int<>1006 then raise exception 'Aggregate request/operation/retry or row-cap mismatch'; end if;
  if (feature->>'knownCostRequests')::int<>1007 or (feature->>'usageMissingCount')::int<>1 or (feature->>'estimatedCostUsd')::numeric<>1.007 or (feature->>'inputTokens')::bigint<>100700 then raise exception 'Aggregate token/cost mismatch'; end if;
  select value into recent from jsonb_array_elements(summary->'recent'->'groups') where value->>'scope'='feature' and value->>'key'=current_setting('test.ai_usage_feature');
  if recent is null or (recent->'current'->>'requests')::int<>1005 or (recent->'previous'->>'requests')::int<>2 then raise exception 'Rolling 24-hour window mismatch'; end if;
  denied:=false; begin update public.ai_usage_events set model='changed' where operation_id=current_setting('test.ai_usage_cross')::uuid; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Service-role request evidence update allowed'; end if;
  denied:=false; begin delete from public.ai_usage_events where operation_id=current_setting('test.ai_usage_cross')::uuid; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'Service-role request evidence deletion allowed'; end if;
  foreach persona in array array['test.ai_usage_user','test.ai_usage_banned','test.ai_usage_archived'] loop
    denied:=false; begin perform public.save_ai_usage_monthly_settings('2099-12-01',150,50000,current_setting(persona)::uuid); exception when raise_exception then denied:=true; end;
    if not denied then raise exception 'Ineligible actor settings save allowed: %',persona; end if;
  end loop;
  perform public.save_ai_usage_monthly_settings('2099-12-01',150,50000,current_setting('test.ai_usage_admin')::uuid);
  if not exists(select 1 from public.ai_usage_monthly_settings where month='2099-12-01' and usd_jpy=150 and service_revenue_jpy=50000) then raise exception 'Settings not saved'; end if;
  if not exists(select 1 from public.audit_logs where actor_user_id=current_setting('test.ai_usage_admin')::uuid and action_type='ai_usage_monthly_settings_updated' and metadata->'next'->>'usd_jpy'='150') then raise exception 'Settings audit missing'; end if;
end $$;
reset role;

-- Force audit failure only for this fixture to prove settings cannot commit without their audit.
create function pg_temp.reject_ai_usage_fixture_audit() returns trigger language plpgsql as $$ begin
  if new.actor_user_id=current_setting('test.ai_usage_admin')::uuid and new.action_type='ai_usage_monthly_settings_updated' then raise exception 'Synthetic audit failure'; end if;
  return new;
end $$;
do $$ begin
  execute format('create trigger %I before insert on public.audit_logs for each row execute function pg_temp.reject_ai_usage_fixture_audit()', 'test_ai_usage_'||replace(current_setting('test.ai_usage_admin'),'-',''));
end $$;
set local role service_role;
do $$ declare denied boolean:=false; begin
  begin perform public.save_ai_usage_monthly_settings('2099-12-01',160,60000,current_setting('test.ai_usage_admin')::uuid); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'Synthetic audit failure did not abort save'; end if;
  if not exists(select 1 from public.ai_usage_monthly_settings where month='2099-12-01' and usd_jpy=150 and service_revenue_jpy=50000) then raise exception 'Settings changed despite audit failure'; end if;
end $$;
reset role;
do $$ begin execute format('drop trigger %I on public.audit_logs','test_ai_usage_'||replace(current_setting('test.ai_usage_admin'),'-','')); end $$;
set local role service_role;
do $$ begin
  perform public.save_ai_usage_monthly_settings('2099-12-01',null,null,current_setting('test.ai_usage_admin')::uuid);
  if not exists(select 1 from public.ai_usage_monthly_settings where month='2099-12-01' and usd_jpy is null and service_revenue_jpy is null) then raise exception 'Configuration clearing failed'; end if;
  if (select count(*) from public.audit_logs where actor_user_id=current_setting('test.ai_usage_admin')::uuid and action_type='ai_usage_monthly_settings_updated')<>2 then raise exception 'Configuration revisions not retained'; end if;
end $$;
reset role;
rollback;
select 'PASS: AI usage permissions, 1000+ aggregate, cross-month retry, rolling windows, active-admin checks, atomic audit, reversible config; all fixtures rolled back' as result;
