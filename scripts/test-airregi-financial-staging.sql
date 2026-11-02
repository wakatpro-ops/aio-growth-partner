-- Synthetic acceptance only, called inside a transaction that is ALWAYS rolled
-- back by test-airregi-financial-staging.mjs. No provider credentials or traffic.
create function pg_temp.airregi_lease(p_id uuid) returns uuid language plpgsql as $$
declare lease uuid:=gen_random_uuid();
begin
  update public.air_regi_connections set lease_id=lease,lease_until=now()+interval '2 minutes',next_sync_at=now(),status='active' where id=p_id;
  return lease;
end; $$;
create function pg_temp.airregi_row(p_id text,p_revision text,p_amount integer,p_unknown boolean default false,p_kind text default 'sale')
returns jsonb language sql as $$
  select jsonb_build_object('sourceId',p_id,'revisionAt',p_revision,'businessDate','2026-11-01','occurredAt','2026-11-01T12:00:00Z',
    'kind',p_kind,'amountMinor',p_amount,'taxMinor',case when p_unknown then null else least(100,p_amount) end,
    'discountMinor',case when p_unknown then null else 0 end,'paymentMethod','架空現金','adjustmentMinor',0,'items','[]'::jsonb)
    ||case when p_unknown then jsonb_build_object('detailsStatus','unconfirmed','reviewReason','provider_financial_details_unavailable') else '{}'::jsonb end;
$$;
do $$
declare org uuid:=gen_random_uuid(); shop uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid(); c uuid; lease uuid;
  external_id text:='SYNTHETIC-ROLLBACK-'||gen_random_uuid(); result jsonb; known jsonb; unknown jsonb; corrected jsonb;
  row_before public.sales_transactions; row_after public.sales_transactions; checkpoint timestamptz; version_count integer;
begin
  assert not has_function_privilege('anon','public.apply_air_regi_page_v2(uuid,uuid,text,jsonb,text,timestamptz)','EXECUTE');
  assert not has_function_privilege('authenticated','public.apply_air_regi_page_v2(uuid,uuid,text,jsonb,text,timestamptz)','EXECUTE');
  assert has_function_privilege('service_role','public.apply_air_regi_page_v2(uuid,uuid,text,jsonb,text,timestamptz)','EXECUTE');
  assert not has_function_privilege('service_role','public.rebuild_pos_financial_summaries(uuid,uuid)','EXECUTE');
  insert into auth.users(id,email,role,aud) values(actor,'airregi-rollback-'||actor||'@example.invalid','authenticated','authenticated');
  insert into public.user_profiles(user_id,display_name,role,status) values(actor,'SYNTHETIC ROLLBACK','user','active')
    on conflict(user_id) do update set status='active',role='user';
  insert into public.organizations(id,name,status) values(org,'AIRREGI ROLLBACK ONLY','active');
  insert into public.stores(id,organization_id,name,industry_type_key,status) values(shop,org,'Airレジ架空検証・ロールバック専用','restaurant','active');
  insert into public.organization_members(organization_id,user_id,role_key,status) values(org,actor,'org_owner','active');
  c:=public.save_air_regi_connection(actor,shop,external_id,'SYNTHETIC','v1.synthetic-not-a-secret','SYNTHETIC-v2',300);
  known:=pg_temp.airregi_row('known','2026-11-01T12:01:00Z',1100);
  unknown:=pg_temp.airregi_row('unknown','2026-11-01T12:01:00Z',2200,true);
  lease:=pg_temp.airregi_lease(c);
  begin
    perform public.apply_air_regi_page_v2(c,null,external_id,jsonb_build_array(known),null,'2026-11-01T13:00:00Z');
    raise exception 'missing_lease_not_denied';
  exception when raise_exception then assert sqlerrm='lease_or_permission_invalid'; end;
  begin
    perform public.apply_air_regi_page_v2(c,lease,'another-store',jsonb_build_array(known),null,'2026-11-01T13:00:00Z');
    raise exception 'foreign_store_not_denied';
  exception when raise_exception then assert sqlerrm='store_mismatch'; end;
  result:=public.apply_air_regi_page_v2(c,lease,external_id,jsonb_build_array(known,unknown),null,'2026-11-01T13:00:00Z');
  assert (result->>'changed')::integer=2;
  assert (select count(*)=2 from public.sales_transactions where store_id=shop);
  select * into row_before from public.sales_transactions where store_id=shop and external_transaction_id='unknown';
  assert row_before.gross_amount=2200 and row_before.tax_amount is null and row_before.net_amount is null and row_before.discount_amount is null;
  assert (select gross_amount=3300 and tax_amount is null and net_amount is null and discount_amount is null
    and transaction_count=2 and (metadata->>'financial_details_unconfirmed_count')::integer=1
    from public.normalized_sales_summaries where store_id=shop and summary_type='monthly');
  assert (select watermark='2026-11-01T13:00:00Z' and lease_id is null from public.air_regi_connections where id=c);
  -- Replay and stale revisions retain identity/evidence without double counting.
  result:=public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,jsonb_build_array(unknown),null,'2026-11-01T13:00:00Z');
  assert (result->>'changed')::integer=0;
  result:=public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,
    jsonb_build_array(pg_temp.airregi_row('unknown','2026-11-01T12:00:00Z',1,true)),null,'2026-11-01T13:00:00Z');
  assert (result->>'changed')::integer=0;
  -- A conflicting unknown after a valid row rolls back row AND checkpoint.
  select watermark into checkpoint from public.air_regi_connections where id=c;
  select count(*) into version_count from public.air_regi_transaction_versions where connection_id=c;
  lease:=pg_temp.airregi_lease(c);
  begin
    perform public.apply_air_regi_page_v2(c,lease,external_id,
      jsonb_build_array(pg_temp.airregi_row('new-known','2026-11-01T12:01:00Z',1100),unknown||'{"amountMinor":3300}'::jsonb),null,'2026-11-01T14:00:00Z');
    raise exception 'revision_conflict_not_denied';
  exception when raise_exception then assert sqlerrm='conflicting_revision'; end;
  assert (select watermark=checkpoint and lease_id=lease from public.air_regi_connections where id=c);
  assert (select count(*)=version_count from public.air_regi_transaction_versions where connection_id=c);
  assert not exists(select 1 from public.sales_transactions where store_id=shop and external_transaction_id='new-known');
  -- Same amount, corrected-to-zero and later known revisions never imply zero tax.
  corrected:=pg_temp.airregi_row('known','2026-11-01T12:02:00Z',1100,true);
  perform public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,jsonb_build_array(corrected),null,checkpoint);
  assert (select tax_amount is null from public.sales_transactions where store_id=shop and external_transaction_id='known');
  corrected:=pg_temp.airregi_row('unknown','2026-11-01T12:03:00Z',0,true);
  perform public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,jsonb_build_array(corrected),null,checkpoint);
  select * into row_after from public.sales_transactions where store_id=shop and external_transaction_id='unknown';
  assert row_after.id=row_before.id and row_after.gross_amount=0 and row_after.tax_amount is null;
  assert (select count(*)=2 from public.air_regi_transaction_versions where connection_id=c and source_id='unknown');
  -- Known item projections are removed only on the corresponding new correction.
  known:=pg_temp.airregi_row('item-sale','2026-11-01T12:01:00Z',1100)||jsonb_build_object('items',jsonb_build_array(
    jsonb_build_object('sourceItemId','line-1','name','架空メニュー','category',null,'quantity',1,'unitPriceMinor',1100,'amountMinor',1100,'taxMinor',100,'discountMinor',0)));
  perform public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,jsonb_build_array(known),null,checkpoint);
  assert (select count(*)=1 from public.sales_transaction_items where store_id=shop);
  perform public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,
    jsonb_build_array(pg_temp.airregi_row('item-sale','2026-11-01T12:02:00Z',900,true)),null,checkpoint);
  assert not exists(select 1 from public.sales_transaction_items where store_id=shop);
  assert (select count(*)=2 from public.air_regi_transaction_versions where connection_id=c and source_id='item-sale');
  -- Square's next aggregation preserves AirRegi unknowns and excludes all voids.
  insert into public.sales_transactions(organization_id,store_id,source_row_hash,transaction_date,business_date,gross_amount,tax_amount,discount_amount,net_amount,channel,source_metadata)
    values(org,shop,'synthetic-square','2026-11-01T12:00:00Z','2026-11-01',550,50,0,500,'square_pos','{}'),
      (org,shop,'synthetic-square-void','2026-11-01T12:00:00Z','2026-11-01',0,0,0,0,'square_pos','{"square_pos_state":"void"}');
  perform public.square_pos_rebuild_summaries(org,shop);
  assert (select gross_amount=2550 and transaction_count=4 and tax_amount is null
    from public.normalized_sales_summaries where store_id=shop and summary_type='monthly');
  begin
    insert into public.sales_transactions(organization_id,store_id,source_row_hash,transaction_date,business_date,gross_amount,tax_amount,discount_amount,net_amount,channel,source_metadata)
      values(org,shop,'invalid-square-null','2026-11-01T12:00:00Z','2026-11-01',550,null,null,null,'square_pos','{"financial_details_status":"unconfirmed"}');
    raise exception 'square_null_not_denied';
  exception when check_violation then null; end;
  -- Removing a claimed row's permission invalidates the application as well.
  lease:=pg_temp.airregi_lease(c);
  update public.organization_members set status='inactive' where organization_id=org and user_id=actor;
  begin
    perform public.apply_air_regi_page_v2(c,lease,external_id,jsonb_build_array(unknown),null,checkpoint);
    raise exception 'revoked_owner_not_denied';
  exception when raise_exception then assert sqlerrm='lease_or_permission_invalid'; end;
  update public.organization_members set status='active' where organization_id=org and user_id=actor;
  -- A provider-confirmed later version resolves the uncertainty; voids disappear.
  perform public.apply_air_regi_page_v2(c,pg_temp.airregi_lease(c),external_id,jsonb_build_array(
    pg_temp.airregi_row('known','2026-11-01T12:05:00Z',1100),
    pg_temp.airregi_row('unknown','2026-11-01T12:05:00Z',0,false,'void'),
    pg_temp.airregi_row('item-sale','2026-11-01T12:05:00Z',900)),null,checkpoint);
  assert (select gross_amount=2550 and transaction_count=3 and tax_amount=250 and net_amount=2300
    and (metadata->>'financial_details_unconfirmed_count')::integer=0
    from public.normalized_sales_summaries where store_id=shop and summary_type='monthly');
end; $$;
select 'PASS: partial financial facts, replay, corrections, atomic rollback, mixed Square aggregation, permission and strict NULL isolation; all fixtures rolled back' as result;
