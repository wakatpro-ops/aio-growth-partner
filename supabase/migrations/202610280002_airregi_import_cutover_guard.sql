begin;
create index if not exists air_regi_cutover_sales_store_day on public.sales_transactions(store_id,business_date,data_source_id);
-- No automatic matching between a CSV row and a POS receipt. Require an
-- explicit cutover plan rather than silently counting both representations.
create or replace function public.guard_air_regi_import_cutover()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_file boolean; v_air boolean;
begin
  if tg_table_name='air_regi_connections' then
    if tg_op='UPDATE' and new.encrypted_credentials is distinct from old.encrypted_credentials then
      -- Cursor signatures are credential-scoped. Keep the committed watermark,
      -- but safely re-read the unfinished window after a key rotation.
      new.cursor:=null;
    end if;
    if new.status<>'active' or new.encrypted_credentials is null then return new; end if;
    perform 1 from public.stores where id=new.store_id and organization_id=new.organization_id for update;
    if not found then raise exception 'store_mismatch'; end if;
    if exists(select 1 from public.sales_transactions t join public.external_data_sources d on d.id=t.data_source_id
      where t.store_id=new.store_id and t.organization_id=new.organization_id and d.connection_type='file_upload'
        and t.business_date>=(now() at time zone 'Asia/Tokyo')::date-62) then
      raise exception 'air_regi_existing_sales_review_required';
    end if;
  else
    v_file:=exists(select 1 from public.external_data_sources d where d.id=new.data_source_id and d.connection_type='file_upload');
    v_air:=exists(select 1 from public.air_regi_connections c where c.data_source_id=new.data_source_id and c.store_id=new.store_id and c.organization_id=new.organization_id);
    if not v_file and not v_air then return new; end if;
    perform 1 from public.stores where id=new.store_id and organization_id=new.organization_id for update;
    if not found then raise exception 'store_mismatch'; end if;
    if v_air and exists(select 1 from public.sales_transactions t join public.external_data_sources d on d.id=t.data_source_id
      where t.store_id=new.store_id and t.organization_id=new.organization_id and t.business_date=new.business_date and d.connection_type='file_upload') then
      raise exception 'air_regi_existing_sales_review_required';
    end if;
    if v_file and ((new.business_date>=(now() at time zone 'Asia/Tokyo')::date-62 and exists(select 1 from public.air_regi_connections c
      where c.store_id=new.store_id and c.organization_id=new.organization_id and c.archived_at is null and c.status in ('active','error') and c.encrypted_credentials is not null))
      or exists(select 1 from public.sales_transactions t join public.air_regi_connections c on c.data_source_id=t.data_source_id
        where t.store_id=new.store_id and t.organization_id=new.organization_id and t.business_date=new.business_date)) then
      raise exception 'air_regi_existing_sales_review_required';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_air_regi_import_cutover() from public,anon,authenticated;
create trigger air_regi_connection_cutover before insert or update of encrypted_credentials,status
  on public.air_regi_connections for each row execute function public.guard_air_regi_import_cutover();
create trigger air_regi_sales_cutover before insert or update of data_source_id,business_date,store_id,organization_id
  on public.sales_transactions for each row execute function public.guard_air_regi_import_cutover();
commit;
