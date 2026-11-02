-- A provider-confirmed gross amount does not imply a known tax/net allocation.
-- Unknowns are NULL and explicitly labelled, never represented as zero tax.
begin;
alter table public.sales_transactions alter column tax_amount drop not null,
  alter column net_amount drop not null, alter column discount_amount drop not null;
alter table public.sales_transactions add constraint sales_financial_details_known_or_explicitly_unconfirmed check (
  (tax_amount is not null and net_amount is not null and discount_amount is not null
    and coalesce(source_metadata->>'financial_details_status','')<>'unconfirmed')
  or (coalesce(channel,'')='air_regi' and coalesce(source_metadata->>'financial_details_status','')='unconfirmed'
    and tax_amount is null and net_amount is null and discount_amount is null)
);
alter table public.normalized_sales_summaries alter column tax_amount drop not null,
  alter column net_amount drop not null, alter column discount_amount drop not null;

create or replace function public.rebuild_pos_financial_summaries(p_org uuid,p_store uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.normalized_sales_summaries where organization_id=p_org and store_id=p_store;
  insert into public.normalized_sales_summaries(organization_id,store_id,summary_type,summary_date,summary_month,payment_method,transaction_count,gross_amount,discount_amount,tax_amount,net_amount,metadata)
    select p_org,p_store,g.kind,case when g.kind='daily' then g.label::date end,
      case when g.kind='monthly' then g.label end,case when g.kind='payment_method' then g.label end,
      count(*),sum(t.gross_amount),
      case when bool_or(t.discount_amount is null) then null else sum(t.discount_amount) end,
      case when bool_or(t.tax_amount is null) then null else sum(t.tax_amount) end,
      case when bool_or(t.net_amount is null) then null else sum(t.net_amount) end,
      jsonb_build_object('financial_details_unconfirmed_count',count(*) filter(where t.tax_amount is null))
    from public.sales_transactions t cross join lateral (values('daily',t.business_date::text),('monthly',to_char(t.business_date,'YYYY-MM')),('payment_method',coalesce(t.payment_method,'未設定'))) g(kind,label)
    where t.organization_id=p_org and t.store_id=p_store
      and coalesce(t.source_metadata->>'air_regi_state','')<>'void'
      and coalesce(t.source_metadata->>'square_pos_state','')<>'void'
    group by g.kind,g.label;
  insert into public.normalized_sales_summaries(organization_id,store_id,summary_type,item_name,category_name,transaction_count,quantity,gross_amount,discount_amount,tax_amount,net_amount)
    select p_org,p_store,'item',i.item_name,min(i.category_name),count(*),sum(i.quantity),sum(i.total_amount),sum(i.discount_amount),sum(i.tax_amount),sum(i.total_amount-i.tax_amount)
    from public.sales_transaction_items i join public.sales_transactions t on t.id=i.sales_transaction_id and t.store_id=i.store_id and t.organization_id=i.organization_id
    where i.organization_id=p_org and i.store_id=p_store
      and coalesce(t.source_metadata->>'air_regi_state','')<>'void'
      and coalesce(t.source_metadata->>'square_pos_state','')<>'void' group by i.item_name;
end; $$;
revoke all on function public.rebuild_pos_financial_summaries(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.air_regi_rebuild_summaries(p_org uuid,p_store uuid)
returns void language sql security definer set search_path=public as $$ select public.rebuild_pos_financial_summaries(p_org,p_store); $$;
create or replace function public.square_pos_rebuild_summaries(p_org uuid,p_store uuid)
returns void language sql security definer set search_path=public as $$ select public.rebuild_pos_financial_summaries(p_org,p_store); $$;
revoke all on function public.air_regi_rebuild_summaries(uuid,uuid),public.square_pos_rebuild_summaries(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.apply_air_regi_page_v2(p_id uuid,p_lease uuid,p_external text,p_transactions jsonb,p_cursor text,p_watermark timestamptz)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c public.air_regi_connections; t jsonb; v_known jsonb:='[]'; v_unknown jsonb:='[]'; v_result jsonb;
  v_old public.air_regi_transaction_versions; v_hash text; v_revision timestamptz; v_sign integer; v_transaction uuid; v_changed integer:=0;
begin
  select * into c from public.air_regi_connections where id=p_id for update;
  if not found or p_lease is null or c.lease_id is distinct from p_lease or c.lease_until is null or c.lease_until<=now()
    or c.archived_at is not null or c.status not in ('active','error')
    or not public.air_regi_owner_allowed(c.authorized_by,c.store_id) then raise exception 'lease_or_permission_invalid'; end if;
  if p_external is distinct from c.external_store_id then raise exception 'store_mismatch'; end if;
  if jsonb_typeof(p_transactions) is distinct from 'array' or jsonb_array_length(p_transactions)>1000 then raise exception 'invalid_page'; end if;
  if (select count(distinct x->>'sourceId') from jsonb_array_elements(p_transactions) x)<>jsonb_array_length(p_transactions) then raise exception 'duplicate_source_id'; end if;
  for t in select * from jsonb_array_elements(p_transactions) loop
    if t->>'detailsStatus'='unconfirmed' then
      if jsonb_typeof(t) is distinct from 'object' or t->>'sourceId' is null or length(t->>'sourceId') not between 1 and 160
        or t->>'kind' is null or t->>'kind' not in ('sale','refund')
        or t->>'revisionAt' is null or t->>'occurredAt' is null or t->>'businessDate' is null
        or t->'taxMinor' is distinct from 'null'::jsonb or t->'discountMinor' is distinct from 'null'::jsonb
        or t->>'reviewReason' is distinct from 'provider_financial_details_unavailable'
        or t->'items' is distinct from '[]'::jsonb or t->'adjustmentMinor' is distinct from '0'::jsonb
        or jsonb_typeof(t->'amountMinor') is distinct from 'number' or (t->>'amountMinor')::numeric not between 0 and 999999999999
        or (t->>'amountMinor')::numeric<>trunc((t->>'amountMinor')::numeric)
        or jsonb_typeof(t->'paymentMethod') is distinct from 'string' or length(t->>'paymentMethod')>100
        or exists(select 1 from jsonb_object_keys(t) k where k not in ('sourceId','revisionAt','occurredAt','businessDate','kind','amountMinor','taxMinor','discountMinor','paymentMethod','adjustmentMinor','items','detailsStatus','reviewReason')) then raise exception 'invalid_unconfirmed_transaction'; end if;
      v_unknown:=v_unknown||jsonb_build_array(t);
    else v_known:=v_known||jsonb_build_array(t); end if;
  end loop;
  -- Existing v1 validates ownership/lease, checkpoint and known rows. The entire
  -- wrapper is one transaction: a later failure rolls back its checkpoint too.
  v_result:=public.apply_air_regi_page(p_id,p_lease,p_external,v_known,p_cursor,p_watermark);
  for t in select * from jsonb_array_elements(v_unknown) loop
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
    v_sign:=case t->>'kind' when 'refund' then -1 else 1 end;
    insert into public.sales_transactions(organization_id,store_id,data_source_id,external_transaction_id,source_row_hash,transaction_date,business_date,payment_method,gross_amount,tax_amount,discount_amount,net_amount,channel,source_metadata)
      values(c.organization_id,c.store_id,c.data_source_id,t->>'sourceId','air_regi:'||c.id||':'||encode(digest(t->>'sourceId','sha256'),'hex'),
        (t->>'occurredAt')::timestamptz,(t->>'businessDate')::date,t->>'paymentMethod',(t->>'amountMinor')::numeric*v_sign,null,null,null,'air_regi',
        jsonb_build_object('air_regi_state',t->>'kind','source_revision_at',v_revision,'air_regi_connection_id',c.id,'financial_details_status','unconfirmed','financial_review_reason',t->>'reviewReason'))
      on conflict(store_id,source_row_hash) do update set transaction_date=excluded.transaction_date,business_date=excluded.business_date,payment_method=excluded.payment_method,
        gross_amount=excluded.gross_amount,tax_amount=null,discount_amount=null,net_amount=null,source_metadata=excluded.source_metadata,updated_at=now()
      returning id into v_transaction;
    delete from public.sales_transaction_items where sales_transaction_id=v_transaction and store_id=c.store_id and organization_id=c.organization_id;
    insert into public.air_regi_transaction_versions(connection_id,source_id,revision_at,fingerprint,canonical_payload) values(c.id,t->>'sourceId',v_revision,v_hash,t);
    v_changed:=v_changed+1;
  end loop;
  if v_changed>0 then
    perform public.rebuild_pos_financial_summaries(c.organization_id,c.store_id);
    insert into public.audit_logs(organization_id,store_id,actor_user_id,action_type,target_type,target_id,message,metadata)
      values(c.organization_id,c.store_id,c.authorized_by,'air_regi_financial_details_unconfirmed','air_regi_connection',c.id,'税込売上を反映。未確認の税額・税抜・値引きは推測せず保持',jsonb_build_object('changed',v_changed));
  end if;
  return v_result||jsonb_build_object('changed',coalesce((v_result->>'changed')::integer,0)+v_changed,'unconfirmed_changed',v_changed);
end; $$;
revoke all on function public.apply_air_regi_page_v2(uuid,uuid,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_air_regi_page_v2(uuid,uuid,text,jsonb,text,timestamptz) to service_role;
commit;
