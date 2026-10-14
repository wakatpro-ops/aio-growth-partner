-- AIOb-side sync foundation only. No Airレジ endpoints or credentials are seeded.
begin;
create table if not exists public.air_regi_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  store_id uuid not null unique references public.stores(id),
  external_store_id text not null unique check(length(external_store_id) between 1 and 160),
  external_store_name text not null check(length(external_store_name) between 1 and 300),
  data_source_id uuid not null unique references public.external_data_sources(id),
  encrypted_credentials text,
  specification_version text not null,
  interval_seconds integer not null check(interval_seconds between 60 and 86400),
  status text not null default 'active' check(status in ('active','paused','error','archived')),
  authorized_by uuid not null references auth.users(id),
  cursor text,
  watermark timestamptz,
  next_sync_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error_code text,
  failure_count integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  check((status='archived')=(archived_at is not null))
);
create table if not exists public.air_regi_transaction_versions (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.air_regi_connections(id),
  source_id text not null,
  revision_at timestamptz not null,
  fingerprint text not null,
  canonical_payload jsonb not null,
  received_at timestamptz not null default now(),
  unique(connection_id,source_id,revision_at)
);
create index if not exists air_regi_versions_latest on public.air_regi_transaction_versions(connection_id,source_id,revision_at desc);
alter table public.air_regi_connections enable row level security;
alter table public.air_regi_transaction_versions enable row level security;
revoke all on public.air_regi_connections,public.air_regi_transaction_versions from public,anon,authenticated;
grant select,insert,update on public.air_regi_connections to service_role;
grant select,insert on public.air_regi_transaction_versions to service_role;

-- Owners (not store managers/staff) may authorize an external data connection.
create or replace function public.air_regi_owner_allowed(p_actor uuid,p_store uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_profiles p join auth.users u on u.id=p.user_id
    join public.stores s on s.id=p_store join public.organizations o on o.id=s.organization_id
    where p.user_id=p_actor and p.status='active' and p.archived_at is null
      and (u.banned_until is null or u.banned_until<now())
      and s.status='active' and s.archived_at is null and o.status='active' and o.archived_at is null
      and (p.role='platform_admin' or exists(select 1 from public.organization_members m
        where m.user_id=p_actor and m.organization_id=s.organization_id and m.role_key='org_owner'
          and m.status='active' and m.archived_at is null)));
$$;
revoke all on function public.air_regi_owner_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.air_regi_owner_allowed(uuid,uuid) to service_role;

-- Caller must first probe the verified official adapter and confirm its store.
-- external_store_id must be a globally scoped identity, not a guessed store number.
create or replace function public.save_air_regi_connection(p_actor uuid,p_store uuid,p_external text,p_name text,p_ciphertext text,p_spec text,p_interval integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare c public.air_regi_connections; v_org uuid; v_source uuid; v_id uuid;
begin
  if not public.air_regi_owner_allowed(p_actor,p_store) then raise exception 'forbidden'; end if;
  if p_external is null or length(p_external) not between 1 and 160 or p_name is null or length(p_name) not between 1 and 300
    or p_ciphertext is null or p_ciphertext not like 'v1.%' or length(p_ciphertext)>30000
    or p_spec is null or length(p_spec) not between 1 and 200 or p_interval is null or p_interval not between 60 and 86400 then raise exception 'invalid_connection'; end if;
  select organization_id into v_org from public.stores where id=p_store for update;
  select * into c from public.air_regi_connections where store_id=p_store for update;
  if found then
    if c.archived_at is not null then raise exception 'restore_required'; end if;
    if c.external_store_id<>p_external or c.organization_id<>v_org then raise exception 'store_mismatch'; end if;
    v_id:=c.id;
    update public.air_regi_connections set encrypted_credentials=p_ciphertext,external_store_name=p_name,
      specification_version=p_spec,interval_seconds=p_interval,authorized_by=p_actor,status='active',
      lease_id=null,lease_until=null,next_sync_at=greatest(next_sync_at,coalesce(last_success_at,'epoch')+make_interval(secs=>p_interval)),
      failure_count=0,last_error_code=null,revision=revision+1,updated_at=now() where id=v_id;
  else
    insert into public.external_data_sources(organization_id,store_id,provider_key,connection_type,name)
      values(v_org,p_store,'air_regi','api','Airレジ API') returning id into v_source;
    insert into public.air_regi_connections(organization_id,store_id,external_store_id,external_store_name,data_source_id,
      encrypted_credentials,specification_version,interval_seconds,authorized_by)
      values(v_org,p_store,p_external,p_name,v_source,p_ciphertext,p_spec,p_interval,p_actor) returning id into v_id;
  end if;
  update public.external_data_sources set status='active',updated_at=now() where id=(select data_source_id from public.air_regi_connections where id=v_id);
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message)
    values(v_org,p_store,p_actor,'air_regi_connected','air_regi_connection',v_id,'店舗を照合してAirレジ接続情報を更新');
  return v_id;
end; $$;
revoke all on function public.save_air_regi_connection(uuid,uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_air_regi_connection(uuid,uuid,text,text,text,text,integer) to service_role;

create or replace function public.transition_air_regi_connection(p_actor uuid,p_store uuid,p_id uuid,p_action text,p_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare c public.air_regi_connections;
begin
  if not public.air_regi_owner_allowed(p_actor,p_store) then raise exception 'forbidden'; end if;
  select * into c from public.air_regi_connections where id=p_id and store_id=p_store for update;
  if not found then raise exception 'connection_not_found'; end if;
  if p_revision is null or c.revision<>p_revision then raise exception 'revision_conflict'; end if;
  if p_action='archive' and c.archived_at is null then
    update public.air_regi_connections set status='archived',archived_at=now(),archived_by=p_actor,
      encrypted_credentials=null,lease_id=null,lease_until=null,revision=revision+1,updated_at=now() where id=c.id;
  elsif p_action='restore' and c.archived_at is not null then
    -- No automatic restart: credentials were erased and must be re-authorized.
    update public.air_regi_connections set status='paused',archived_at=null,archived_by=null,
      revision=revision+1,updated_at=now() where id=c.id;
  elsif p_action in ('pause','resume') and c.archived_at is null then
    if p_action='resume' and (c.encrypted_credentials is null or not public.air_regi_owner_allowed(c.authorized_by,p_store)) then raise exception 'reconnect_required'; end if;
    update public.air_regi_connections set status=case when p_action='pause' then 'paused' else 'active' end,
      lease_id=null,lease_until=null,revision=revision+1,updated_at=now() where id=c.id;
  else raise exception 'invalid_transition'; end if;
  update public.external_data_sources set status=case when p_action in ('archive','pause','restore') then 'inactive' else 'active' end,updated_at=now() where id=c.data_source_id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message)
    values(c.organization_id,p_store,p_actor,'air_regi_'||p_action,'air_regi_connection',c.id,'Airレジ接続の状態を変更。取引履歴は保持');
end; $$;
revoke all on function public.transition_air_regi_connection(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.transition_air_regi_connection(uuid,uuid,uuid,text,integer) to service_role;

create or replace function public.claim_air_regi_sync(p_id uuid,p_spec text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.air_regi_connections; v_lease uuid:=gen_random_uuid();
begin
  select * into c from public.air_regi_connections where id=p_id for update skip locked;
  if found and c.archived_at is null and c.status in ('active','error') and (
    not public.air_regi_owner_allowed(c.authorized_by,c.store_id)
    or not exists(select 1 from public.stores s where s.id=c.store_id and s.organization_id=c.organization_id)) then
    update public.air_regi_connections set status='paused',last_error_code='authorization_revoked',lease_id=null,lease_until=null,updated_at=now() where id=c.id;
    update public.external_data_sources set status='inactive',updated_at=now() where id=c.data_source_id;
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message)
      values(c.organization_id,c.store_id,c.authorized_by,'air_regi_authorization_revoked','air_regi_connection',c.id,'接続を許可したアカウントの権限変更により同期を停止');
    return null;
  end if;
  if not found or c.archived_at is not null or c.status not in ('active','error') or c.encrypted_credentials is null
    or p_spec is null or c.specification_version<>p_spec or c.next_sync_at>now() or c.lease_until>now()
    or not public.air_regi_owner_allowed(c.authorized_by,c.store_id)
    or not exists(select 1 from public.stores s where s.id=c.store_id and s.organization_id=c.organization_id) then return null; end if;
  update public.air_regi_connections set lease_id=v_lease,lease_until=now()+interval '3 minutes',
    next_sync_at=now()+make_interval(secs=>interval_seconds),updated_at=now() where id=c.id;
  return to_jsonb(c)||jsonb_build_object('lease_id',v_lease);
end; $$;
revoke all on function public.claim_air_regi_sync(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_air_regi_sync(uuid,text) to service_role;

-- Rebuild replaceable report projections in the SAME transaction as the page.
-- Retained versions, not these cache rows, are the immutable source evidence.
create or replace function public.air_regi_rebuild_summaries(p_org uuid,p_store uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.normalized_sales_summaries where organization_id=p_org and store_id=p_store;
  insert into public.normalized_sales_summaries(organization_id,store_id,summary_type,summary_date,summary_month,payment_method,transaction_count,gross_amount,discount_amount,tax_amount,net_amount)
    select p_org,p_store,g.kind,case when g.kind='daily' then g.label::date end,
      case when g.kind='monthly' then g.label end,case when g.kind='payment_method' then g.label end,
      count(*),sum(t.gross_amount),sum(t.discount_amount),sum(t.tax_amount),sum(t.net_amount)
    from public.sales_transactions t cross join lateral (values('daily',t.business_date::text),('monthly',to_char(t.business_date,'YYYY-MM')),('payment_method',coalesce(t.payment_method,'未設定'))) g(kind,label)
    where t.organization_id=p_org and t.store_id=p_store and coalesce(t.source_metadata->>'air_regi_state','')<>'void'
    group by g.kind,g.label;
  insert into public.normalized_sales_summaries(organization_id,store_id,summary_type,item_name,category_name,transaction_count,quantity,gross_amount,discount_amount,tax_amount,net_amount)
    select p_org,p_store,'item',i.item_name,min(i.category_name),count(*),sum(i.quantity),sum(i.total_amount),sum(i.discount_amount),sum(i.tax_amount),sum(i.total_amount-i.tax_amount)
    from public.sales_transaction_items i join public.sales_transactions t on t.id=i.sales_transaction_id and t.store_id=i.store_id and t.organization_id=i.organization_id
    where i.organization_id=p_org and i.store_id=p_store and coalesce(t.source_metadata->>'air_regi_state','')<>'void' group by i.item_name;
end; $$;
revoke all on function public.air_regi_rebuild_summaries(uuid,uuid) from public,anon,authenticated;
-- Only the page RPC calls this helper; no service role direct execution grant.

create or replace function public.apply_air_regi_page(p_id uuid,p_lease uuid,p_external text,p_transactions jsonb,p_cursor text,p_watermark timestamptz)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c public.air_regi_connections; t jsonb; i jsonb; v_old public.air_regi_transaction_versions;
  v_hash text; v_revision timestamptz; v_transaction uuid; v_sign integer; v_changed integer:=0; v_key text;
begin
  select * into c from public.air_regi_connections where id=p_id for update;
  if not found or p_lease is null or c.lease_id is null or c.lease_until is null or c.archived_at is not null or c.status not in ('active','error') or c.lease_id is distinct from p_lease or c.lease_until<=now()
    or not public.air_regi_owner_allowed(c.authorized_by,c.store_id) then raise exception 'lease_or_permission_invalid'; end if;
  if p_external is distinct from c.external_store_id then raise exception 'store_mismatch'; end if;
  if jsonb_typeof(p_transactions) is distinct from 'array' or jsonb_array_length(p_transactions)>1000
    or (p_cursor is not null and (length(p_cursor) not between 1 and 2000 or p_cursor=c.cursor))
    or (p_cursor is not null and p_watermark is distinct from c.watermark)
    or (c.watermark is not null and (p_watermark is null or p_watermark<c.watermark)) then raise exception 'invalid_page'; end if;
  if (select count(distinct x->>'sourceId') from jsonb_array_elements(p_transactions) x)<>jsonb_array_length(p_transactions) then raise exception 'duplicate_source_id'; end if;
  perform 1 from public.stores where id=c.store_id and organization_id=c.organization_id for update;
  if not found then raise exception 'store_mismatch'; end if;
  for t in select * from jsonb_array_elements(p_transactions) loop
    if t->>'sourceId' is null or length(t->>'sourceId') not between 1 and 160 or t->>'kind' is null or t->>'kind' not in ('sale','refund','void')
      or t->>'revisionAt' is null or t->>'occurredAt' is null or t->>'businessDate' is null
      or jsonb_typeof(t->'items') is distinct from 'array' or jsonb_array_length(t->'items')>500
      or (t->>'amountMinor')::numeric is null or (t->>'amountMinor')::numeric not between 0 and 999999999999
      or (t->>'taxMinor')::numeric is null or (t->>'taxMinor')::numeric not between 0 and (t->>'amountMinor')::numeric
      or (t->>'discountMinor')::numeric is null or (t->>'discountMinor')::numeric not between 0 and 999999999999 then raise exception 'invalid_transaction'; end if;
    if exists(select 1 from (values('amountMinor'),('taxMinor'),('discountMinor'),('adjustmentMinor')) f(key)
      where (t->>f.key)::numeric is null or (t->>f.key)::numeric<>trunc((t->>f.key)::numeric))
      or (t->>'adjustmentMinor')::numeric not between -999999999999 and 999999999999
      or t->>'paymentMethod' is null or length(t->>'paymentMethod')>100
      or exists(select 1 from jsonb_object_keys(t) k where k not in ('sourceId','revisionAt','businessDate','occurredAt','kind','amountMinor','taxMinor','discountMinor','paymentMethod','adjustmentMinor','items')) then raise exception 'invalid_transaction'; end if;
    if (select count(distinct x->>'sourceItemId') from jsonb_array_elements(t->'items') x)<>jsonb_array_length(t->'items') then raise exception 'duplicate_item_identity'; end if;
    if jsonb_array_length(t->'items')>0 and (select sum((x->>'amountMinor')::numeric) from jsonb_array_elements(t->'items') x)+coalesce((t->>'adjustmentMinor')::numeric,0)<>(t->>'amountMinor')::numeric then raise exception 'totals_do_not_reconcile'; end if;
    v_revision:=(t->>'revisionAt')::timestamptz;
    v_hash:=encode(digest(t::text,'sha256'),'hex');
    select * into v_old from public.air_regi_transaction_versions where connection_id=c.id and source_id=t->>'sourceId' order by revision_at desc limit 1;
    if found then
      if v_revision<v_old.revision_at then continue; end if;
      if v_revision=v_old.revision_at then
        if v_hash<>v_old.fingerprint then raise exception 'conflicting_revision'; end if;
        continue;
      end if;
    end if;
    v_sign:=case t->>'kind' when 'refund' then -1 when 'void' then 0 else 1 end;
    v_key:='air_regi:'||c.id||':'||encode(digest(t->>'sourceId','sha256'),'hex');
    insert into public.sales_transactions(organization_id,store_id,data_source_id,external_transaction_id,source_row_hash,transaction_date,business_date,payment_method,gross_amount,tax_amount,discount_amount,net_amount,channel,source_metadata)
      values(c.organization_id,c.store_id,c.data_source_id,t->>'sourceId',v_key,(t->>'occurredAt')::timestamptz,(t->>'businessDate')::date,t->>'paymentMethod',
        (t->>'amountMinor')::numeric*v_sign,(t->>'taxMinor')::numeric*v_sign,(t->>'discountMinor')::numeric*v_sign,
        ((t->>'amountMinor')::numeric-(t->>'taxMinor')::numeric)*v_sign,'air_regi',jsonb_build_object('air_regi_state',t->>'kind','source_revision_at',v_revision,'air_regi_connection_id',c.id))
      on conflict(store_id,source_row_hash) do update set transaction_date=excluded.transaction_date,business_date=excluded.business_date,payment_method=excluded.payment_method,
        gross_amount=excluded.gross_amount,tax_amount=excluded.tax_amount,discount_amount=excluded.discount_amount,net_amount=excluded.net_amount,source_metadata=excluded.source_metadata,updated_at=now()
      returning id into v_transaction;
    -- Replaceable current item projection; every source version is retained below.
    delete from public.sales_transaction_items where sales_transaction_id=v_transaction and store_id=c.store_id and organization_id=c.organization_id;
    for i in select * from jsonb_array_elements(t->'items') loop
      if i->>'sourceItemId' is null or i->>'name' is null or length(i->>'name') not between 1 and 300
        or (i->>'quantity')::numeric is null or (i->>'quantity')::numeric not between 0.001 and 100000
        or (i->>'unitPriceMinor')::numeric is null or (i->>'unitPriceMinor')::numeric not between 0 and 999999999999
        or (i->>'amountMinor')::numeric is null or (i->>'amountMinor')::numeric not between 0 and 999999999999
        or (i->>'taxMinor')::numeric is null or (i->>'taxMinor')::numeric not between 0 and (i->>'amountMinor')::numeric
        or (i->>'discountMinor')::numeric is null or (i->>'discountMinor')::numeric not between 0 and 999999999999 then raise exception 'invalid_item'; end if;
      if length(i->>'sourceItemId') not between 1 and 160 or length(i->>'category')>150
        or round((i->>'quantity')::numeric,3)<>(i->>'quantity')::numeric
        or exists(select 1 from (values('unitPriceMinor'),('amountMinor'),('taxMinor'),('discountMinor')) f(key) where (i->>f.key)::numeric<>trunc((i->>f.key)::numeric))
        or exists(select 1 from jsonb_object_keys(i) k where k not in ('sourceItemId','name','category','quantity','unitPriceMinor','amountMinor','taxMinor','discountMinor')) then raise exception 'invalid_item'; end if;
      insert into public.sales_transaction_items(organization_id,store_id,sales_transaction_id,external_item_id,item_name,category_name,quantity,unit_price,total_amount,tax_amount,discount_amount,source_metadata)
        values(c.organization_id,c.store_id,v_transaction,i->>'sourceItemId',i->>'name',i->>'category',(i->>'quantity')::numeric*v_sign,
          (i->>'unitPriceMinor')::numeric,(i->>'amountMinor')::numeric*v_sign,(i->>'taxMinor')::numeric*v_sign,(i->>'discountMinor')::numeric*v_sign,jsonb_build_object('air_regi_state',t->>'kind'));
    end loop;
    insert into public.air_regi_transaction_versions(connection_id,source_id,revision_at,fingerprint,canonical_payload) values(c.id,t->>'sourceId',v_revision,v_hash,t);
    v_changed:=v_changed+1;
  end loop;
  if v_changed>0 then perform public.air_regi_rebuild_summaries(c.organization_id,c.store_id); end if;
  update public.air_regi_connections set cursor=p_cursor,watermark=p_watermark,status='active',last_success_at=now(),last_error_code=null,failure_count=0,lease_id=null,lease_until=null,updated_at=now() where id=c.id;
  update public.external_data_sources set status='active',last_synced_at=now(),updated_at=now() where id=c.data_source_id;
  insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
    values(c.organization_id,c.store_id,c.authorized_by,'air_regi_synced','air_regi_connection',c.id,'Airレジの差分と売上集計を反映',jsonb_build_object('changed',v_changed,'has_more',p_cursor is not null));
  return jsonb_build_object('changed',v_changed,'has_more',p_cursor is not null);
end; $$;
revoke all on function public.apply_air_regi_page(uuid,uuid,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_air_regi_page(uuid,uuid,text,jsonb,text,timestamptz) to service_role;

create or replace function public.fail_air_regi_sync(p_id uuid,p_lease uuid,p_code text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_code is null or p_code not in ('provider_unavailable','invalid_provider_data','store_mismatch','sync_failed') then p_code:='sync_failed'; end if;
  update public.air_regi_connections set status='error',last_error_code=p_code,failure_count=failure_count+1,
    next_sync_at=now()+make_interval(secs=>least(86400,interval_seconds*power(2,least(failure_count+1,8))::integer)),
    lease_id=null,lease_until=null,updated_at=now() where id=p_id and lease_id=p_lease and archived_at is null;
end; $$;
revoke all on function public.fail_air_regi_sync(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_air_regi_sync(uuid,uuid,text) to service_role;
commit;
