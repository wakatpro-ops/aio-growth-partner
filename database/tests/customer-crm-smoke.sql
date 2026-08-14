begin;

create temporary table customer_crm_smoke_result (
  customer_created boolean not null,
  note_created boolean not null,
  import_job_created boolean not null,
  message_draft_created boolean not null
);

do $$
declare
  target_store public.stores%rowtype;
  test_organization_id uuid;
  test_industry_key text;
  test_customer_id uuid;
begin
  select * into target_store
  from public.stores
  where archived_at is null
  order by created_at
  limit 1;

  if target_store.id is null then
    select key into test_industry_key
    from public.industry_types
    where is_active = true
    order by created_at
    limit 1;

    if test_industry_key is null then
      insert into public.industry_types (key, name)
      values ('customer_crm_smoke', 'CRM動作確認')
      returning key into test_industry_key;
    end if;

    insert into public.organizations (name)
    values ('CRM動作確認')
    returning id into test_organization_id;

    insert into public.stores (organization_id, industry_type_key, name)
    values (test_organization_id, test_industry_key, 'CRM動作確認')
    returning * into target_store;
  end if;

  insert into public.customers (
    organization_id,
    store_id,
    name,
    phone,
    phone_normalized,
    birth_date,
    last_visit_date,
    visit_count,
    line_account,
    line_opt_in,
    tags,
    import_source
  ) values (
    target_store.organization_id,
    target_store.id,
    'CRM動作確認',
    '050-0000-0000',
    '05000000000',
    date '1990-08-15',
    current_date - 100,
    10,
    'crm-smoke-test',
    true,
    array['動作確認'],
    'smoke_test'
  ) returning id into test_customer_id;

  insert into public.customer_notes (organization_id, store_id, customer_id, body)
  values (target_store.organization_id, target_store.id, test_customer_id, '動作確認用メモ');

  insert into public.customer_import_jobs (
    organization_id,
    store_id,
    original_filename,
    file_type,
    status,
    row_count,
    success_count
  ) values (
    target_store.organization_id,
    target_store.id,
    'customer-crm-smoke.csv',
    'csv',
    'completed',
    1,
    1
  );

  insert into public.customer_message_drafts (
    organization_id,
    store_id,
    customer_id,
    segment_key,
    channel,
    title,
    body,
    audience_count
  ) values (
    target_store.organization_id,
    target_store.id,
    test_customer_id,
    'inactive_90',
    'line',
    '動作確認',
    '{{名前}}様への動作確認です。',
    1
  );

  insert into customer_crm_smoke_result
  select
    exists(select 1 from public.customers where id = test_customer_id),
    exists(select 1 from public.customer_notes where customer_id = test_customer_id),
    exists(select 1 from public.customer_import_jobs where original_filename = 'customer-crm-smoke.csv'),
    exists(select 1 from public.customer_message_drafts where customer_id = test_customer_id);
end $$;

select * from customer_crm_smoke_result;

rollback;
