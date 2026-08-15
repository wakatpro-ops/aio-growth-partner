begin;

create temporary table aio_improvement_smoke_result (
  goal_saved boolean not null,
  task_completed boolean not null,
  publication_verified boolean not null,
  snapshot_saved boolean not null,
  archive_restorable boolean not null
);

do $$
declare
  target_store public.stores%rowtype;
  test_organization_id uuid;
  test_industry_key text;
  test_task_id uuid;
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
      values ('aio_improvement_smoke', 'AIO改善動作確認')
      returning key into test_industry_key;
    end if;

    insert into public.organizations (name)
    values ('AIO改善動作確認')
    returning id into test_organization_id;

    insert into public.stores (organization_id, industry_type_key, name)
    values (test_organization_id, test_industry_key, 'AIO改善動作確認')
    returning * into target_store;
  end if;

  insert into public.aio_goals (organization_id, store_id, target_questions)
  values (target_store.organization_id, target_store.id, array['地域で目的に合う店舗を探す質問'])
  on conflict (store_id) do update set target_questions = excluded.target_questions;

  insert into public.aio_improvement_tasks (
    organization_id,
    store_id,
    source_key,
    title,
    status,
    before_score,
    before_value,
    due_date
  ) values (
    target_store.organization_id,
    target_store.id,
    'smoke_profile',
    '店舗情報を分かりやすくする',
    'in_progress',
    40,
    '説明が不足',
    current_date + 14
  ) returning id into test_task_id;

  update public.aio_improvement_tasks
  set status = 'completed',
      change_summary = '対象のお客様と店舗の強みを追記',
      after_score = 60,
      after_value = '説明を追加済み',
      completed_at = now(),
      publication_target = 'website',
      publication_status = 'verified',
      publication_url = 'https://example.com/store',
      published_at = now(),
      verified_at = now(),
      next_review_at = now() + interval '90 days'
  where id = test_task_id;

  insert into public.aio_readiness_snapshots (
    organization_id,
    store_id,
    score,
    trigger_type,
    readiness_items,
    publication_status,
    target_questions,
    next_action_key,
    next_action_label
  ) values (
    target_store.organization_id,
    target_store.id,
    60,
    'task_completed',
    '[{"key":"smoke_profile","complete":true}]'::jsonb,
    '{"website":true}'::jsonb,
    array['地域で目的に合う店舗を探す質問'],
    'smoke_publish',
    '公開内容を確認する'
  );

  update public.aio_improvement_tasks set archived_at = now() where id = test_task_id;

  insert into aio_improvement_smoke_result
  select
    exists(select 1 from public.aio_goals where store_id = target_store.id and cardinality(target_questions) = 1),
    exists(select 1 from public.aio_improvement_tasks where id = test_task_id and status = 'completed' and before_score = 40 and after_score = 60),
    exists(select 1 from public.aio_improvement_tasks where id = test_task_id and publication_status = 'verified' and publication_url is not null),
    exists(select 1 from public.aio_readiness_snapshots where store_id = target_store.id and trigger_type = 'task_completed'),
    exists(select 1 from public.aio_improvement_tasks where id = test_task_id and archived_at is not null);
end $$;

select * from aio_improvement_smoke_result;

rollback;
