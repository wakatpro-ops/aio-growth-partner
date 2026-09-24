-- Read-only post-deployment health checks, no business rows returned.
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='items' and column_name='availability') as availability_present,
  to_regclass('public.stock_documents') is not null as stock_documents_present,
  exists(select 1 from pg_class where oid='public.stock_documents'::regclass and relrowsecurity) as documents_rls_enabled,
  not has_table_privilege('authenticated','public.stock_documents','select') as direct_document_read_denied,
  not has_function_privilege('authenticated','public.save_stock_document(uuid,uuid,uuid,text,text,date,jsonb,text,integer,uuid)','execute') as direct_document_write_denied,
  not has_function_privilege('anon','public.set_menu_availability(uuid,uuid,uuid,text)','execute') as anonymous_write_denied,
  has_function_privilege('service_role','public.transition_stock_document(uuid,uuid,uuid,text,integer)','execute') as server_transition_enabled,
  exists(select 1 from storage.buckets where id='menu-images' and public and file_size_limit=3145728) as photo_storage_ready;
