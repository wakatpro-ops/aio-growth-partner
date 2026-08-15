begin;

create temporary table inventory_sales_sync_result (
  receipt_idempotent boolean not null,
  order_flow_balanced boolean not null,
  movement_history_complete boolean not null,
  unknown_item_pending boolean not null
);

do $$
declare
  target_store public.stores%rowtype;
  test_organization_id uuid;
  test_industry_key text;
  test_item_id uuid;
  first_receipt_id uuid;
  repeated_receipt_id uuid;
  test_job_id uuid;
begin
  select * into target_store from public.stores where archived_at is null order by created_at limit 1;
  if target_store.id is null then
    select key into test_industry_key from public.industry_types where is_active = true order by created_at limit 1;
    if test_industry_key is null then
      insert into public.industry_types (key, name) values ('inventory_sync_smoke', '在庫連動動作確認') returning key into test_industry_key;
    end if;
    insert into public.organizations (name) values ('在庫連動動作確認') returning id into test_organization_id;
    insert into public.stores (organization_id, industry_type_key, name) values (test_organization_id, test_industry_key, '在庫連動動作確認') returning * into target_store;
  end if;

  insert into public.items (organization_id, store_id, industry_type_key, item_type, name, sku, unit, is_stock_managed)
  values (target_store.organization_id, target_store.id, target_store.industry_type_key, 'product', '在庫連動テスト商品', 'SYNC-SMOKE', '個', true)
  returning id into test_item_id;

  first_receipt_id := public.apply_inventory_movement(target_store.id, test_item_id, 'receipt', 10, 0, '入荷', 'smoke', null, 'smoke:receipt', null);
  repeated_receipt_id := public.apply_inventory_movement(target_store.id, test_item_id, 'receipt', 10, 0, '重複入荷', 'smoke', null, 'smoke:receipt', null);
  perform public.apply_inventory_movement(target_store.id, test_item_id, 'order_reserve', 0, 2, '受注引当', 'smoke', null, 'smoke:reserve', null);
  perform public.apply_inventory_movement(target_store.id, test_item_id, 'order_fulfill', -2, -2, '受注完了', 'smoke', null, 'smoke:fulfill', null);
  perform public.apply_inventory_movement(target_store.id, test_item_id, 'order_return', 2, 0, '受注取消', 'smoke', null, 'smoke:return', null);

  insert into public.data_import_jobs (organization_id, store_id, status, import_type, original_filename)
  values (target_store.organization_id, target_store.id, 'preview_ready', 'csv', 'inventory-sync-smoke.csv') returning id into test_job_id;
  insert into public.import_item_matches (organization_id, store_id, import_job_id, source_item_key, source_item_name, status)
  values (target_store.organization_id, target_store.id, test_job_id, 'unknown-smoke', '未登録商品', 'pending');

  insert into inventory_sales_sync_result
  select
    first_receipt_id = repeated_receipt_id,
    exists(select 1 from public.inventory_stocks where item_id = test_item_id and quantity = 10 and reserved_quantity = 0),
    (select count(*) = 4 from public.inventory_movements where item_id = test_item_id),
    exists(select 1 from public.import_item_matches where import_job_id = test_job_id and status = 'pending' and confirmed_item_id is null);
end $$;

select * from inventory_sales_sync_result;

rollback;
