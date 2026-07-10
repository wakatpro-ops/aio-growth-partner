insert into public.google_business_profiles (
  organization_id,
  store_id,
  google_account_id,
  location_id,
  location_name,
  address,
  status,
  last_synced_at,
  metadata,
  updated_at
)
select
  stores.organization_id,
  stores.id,
  null,
  null,
  stores.name,
  stores.address,
  'manual_mode',
  now(),
  jsonb_build_object(
    'api_status', 'rejected',
    'api_application_result', 'rejected',
    'basic_api_access_case_id', '3-6455000041311',
    'rejection_reason', 'Google内部の品質チェックにより、現時点ではAPI利用申請を進められない状態',
    'manual_posting_mode', true,
    'review_note', 'Basic API Accessは承認されていないため、承認までは手動投稿支援モードで運用。再申請前に公式サイト、運営者情報、プライバシーポリシー、ユーザー承認フロー、投稿履歴・操作ログを整理する。',
    'next_actions', jsonb_build_array(
      '公式サイト情報を整備',
      'ビジネスプロフィール情報を整備',
      '申請主体とサービス内容の整合性を見直し',
      '再申請文面を準備',
      '承認までは手動投稿支援モードで運用'
    ),
    'retry_checklist', jsonb_build_array(
      '公式サイトにサービス概要がある',
      '運営者情報が明確',
      'プライバシーポリシーがある',
      'Google Business Profile APIの利用目的が明確',
      'スパム投稿・自動大量投稿をしない設計である',
      'ユーザー承認フローがある',
      '投稿履歴・操作ログが残る',
      '対象ビジネスプロフィールのオーナー/管理者権限がある'
    )
  ),
  now()
from public.stores
where stores.id = '00000000-0000-4000-8000-000000000102'
on conflict (store_id) do update set
  status = 'manual_mode',
  location_name = coalesce(public.google_business_profiles.location_name, excluded.location_name),
  address = coalesce(public.google_business_profiles.address, excluded.address),
  metadata = public.google_business_profiles.metadata || excluded.metadata,
  updated_at = now();

insert into public.external_integration_logs (
  organization_id,
  store_id,
  provider,
  action_type,
  status,
  message,
  metadata_json,
  created_at
)
select
  stores.organization_id,
  stores.id,
  'google',
  'gbp_basic_api_access_rejected',
  'warning',
  'Google Business Profile API Basic API Accessは承認されていないため、手動投稿支援モードで運用します。',
  jsonb_build_object(
    'case_id', '3-6455000041311',
    'api_status', 'rejected',
    'manual_posting_mode', true
  ),
  now()
from public.stores
where stores.id = '00000000-0000-4000-8000-000000000102'
  and not exists (
    select 1
    from public.external_integration_logs logs
    where logs.store_id = stores.id
      and logs.provider = 'google'
      and logs.action_type = 'gbp_basic_api_access_rejected'
      and logs.metadata_json ->> 'case_id' = '3-6455000041311'
  );
