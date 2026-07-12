insert into public.industry_types (
  key,
  name,
  description,
  default_feature_flags,
  default_dashboard_layout,
  default_profile_schema,
  is_active
)
values
  ('beauty_salon', '美容室・サロン', '美容室、サロン、リラクゼーション向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('clinic_bodycare', 'クリニック・整体・治療院', 'クリニック、整体、治療院向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('restaurant', '飲食店', '飲食店、カフェ、テイクアウト向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('retail', '小売店', '小売店、物販店舗向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('real_estate', '不動産', '不動産店舗、仲介、管理業向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('school', 'スクール・教室', 'スクール、教室、レッスン業向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('hotel_tourism', '宿泊・観光', '宿泊、観光、体験サービス向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('professional_service', '士業・専門サービス', '士業、専門サービス、相談業向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('construction_renovation', '建設・リフォーム', '建設、リフォーム、工事業向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true),
  ('other_service', 'その他店舗・サービス業', 'その他店舗、地域サービス業向けの業態。', '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

update public.industry_types target
set
  default_feature_flags = source.default_feature_flags,
  default_dashboard_layout = source.default_dashboard_layout,
  default_profile_schema = source.default_profile_schema,
  updated_at = now()
from public.industry_types source
where source.key = 'general_store'
  and target.key in (
    'beauty_salon',
    'clinic_bodycare',
    'restaurant',
    'retail',
    'real_estate',
    'school',
    'hotel_tourism',
    'professional_service',
    'construction_renovation',
    'other_service'
  );

insert into public.industry_modules (industry_type_key, module_key, is_enabled, config)
select industry.key, module.module_key, module.is_enabled, module.config
from (
  values
    ('beauty_salon'),
    ('clinic_bodycare'),
    ('restaurant'),
    ('retail'),
    ('real_estate'),
    ('school'),
    ('hotel_tourism'),
    ('professional_service'),
    ('construction_renovation'),
    ('other_service')
) as industry(key)
cross join (
  select module_key, is_enabled, config
  from public.industry_modules
  where industry_type_key = 'general_store'
) as module
on conflict (industry_type_key, module_key) do update set
  is_enabled = excluded.is_enabled,
  config = excluded.config;

insert into public.dashboard_layouts (industry_type_key, layout_key, name, cards, is_default)
select industry.key, layout.layout_key, layout.name, layout.cards, layout.is_default
from (
  values
    ('beauty_salon'),
    ('clinic_bodycare'),
    ('restaurant'),
    ('retail'),
    ('real_estate'),
    ('school'),
    ('hotel_tourism'),
    ('professional_service'),
    ('construction_renovation'),
    ('other_service')
) as industry(key)
cross join (
  select layout_key, name, cards, is_default
  from public.dashboard_layouts
  where industry_type_key = 'general_store'
) as layout
on conflict (industry_type_key, layout_key) do update set
  name = excluded.name,
  cards = excluded.cards,
  is_default = excluded.is_default;

update public.applications
set
  industry_type_key = 'beauty_salon',
  industry_label = coalesce(industry_label, '美容室・サロン'),
  updated_at = now()
where lower(email) = 'sanjihan0330@gmail.com'
  and lower(store_name) = lower('cozysakura');

do $$
declare
  target_application record;
  target_user_id uuid;
  target_organization_id uuid;
  target_store_id uuid;
  general_flags jsonb;
begin
  select *
  into target_application
  from public.applications
  where lower(email) = 'sanjihan0330@gmail.com'
    and lower(store_name) = lower('cozysakura')
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if not found then
    raise notice 'cozysakura application was not found.';
    return;
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(email) = 'sanjihan0330@gmail.com'
  order by created_at desc
  limit 1;

  target_organization_id := coalesce(target_application.organization_id, target_application.approved_organization_id, gen_random_uuid());
  target_store_id := coalesce(target_application.store_id, target_application.approved_store_id, gen_random_uuid());

  select default_feature_flags
  into general_flags
  from public.industry_types
  where key = 'beauty_salon';

  insert into public.organizations (id, name, owner_user_id, plan_key)
  values (target_organization_id, 'cozysakura 運用組織', target_user_id, 'starter')
  on conflict (id) do update set
    name = coalesce(public.organizations.name, excluded.name),
    owner_user_id = coalesce(public.organizations.owner_user_id, excluded.owner_user_id),
    updated_at = now();

  insert into public.stores (
    id,
    organization_id,
    source_application_id,
    industry_type_key,
    name,
    phone,
    website_url,
    google_business_url,
    description,
    profile_data,
    feature_flags,
    status
  )
  values (
    target_store_id,
    target_organization_id,
    target_application.id,
    'beauty_salon',
    'cozysakura',
    target_application.phone,
    target_application.website_url,
    target_application.google_maps_url,
    target_application.pain_points,
    jsonb_build_object(
      'data_mode', 'production',
      'onboarding_status', coalesce(target_application.onboarding_status, 'not_started'),
      'created_from_application_id', target_application.id,
      'contact_name', target_application.contact_name,
      'contact_email', target_application.email,
      'contact_phone', target_application.phone,
      'industry_label', '美容室・サロン',
      'application_intake', jsonb_build_object(
        'industry_label', '美容室・サロン',
        'website_url', target_application.website_url,
        'google_maps_url', target_application.google_maps_url,
        'social_urls', target_application.social_urls,
        'reference_urls', target_application.reference_urls,
        'current_tools', target_application.current_tools,
        'improvement_goals', target_application.improvement_goals,
        'ai_business_summary', target_application.ai_business_summary,
        'ai_recommended_setup_steps', target_application.ai_recommended_setup_steps,
        'ai_growth_opportunities', target_application.ai_growth_opportunities,
        'ai_first_meeting_points', target_application.ai_first_meeting_points
      )
    ),
    coalesce(general_flags, '{}'::jsonb),
    'active'
  )
  on conflict (id) do update set
    organization_id = excluded.organization_id,
    source_application_id = excluded.source_application_id,
    industry_type_key = 'beauty_salon',
    name = 'cozysakura',
    phone = excluded.phone,
    website_url = excluded.website_url,
    google_business_url = excluded.google_business_url,
    description = excluded.description,
    profile_data = coalesce(public.stores.profile_data, '{}'::jsonb) || excluded.profile_data,
    feature_flags = case
      when public.stores.feature_flags = '{}'::jsonb then excluded.feature_flags
      else public.stores.feature_flags
    end,
    status = 'active',
    updated_at = now();

  insert into public.onboarding_snapshots (
    organization_id,
    store_id,
    application_id,
    snapshot_type,
    title,
    content,
    status
  )
  values (
    target_organization_id,
    target_store_id,
    target_application.id,
    'application_intake',
    '申込内容から作成した初期設定下書き',
    jsonb_build_object(
      'industry_label', '美容室・サロン',
      'website_url', target_application.website_url,
      'google_maps_url', target_application.google_maps_url,
      'social_urls', target_application.social_urls,
      'reference_urls', target_application.reference_urls,
      'current_tools', target_application.current_tools,
      'improvement_goals', target_application.improvement_goals,
      'ai_business_summary', target_application.ai_business_summary,
      'ai_recommended_setup_steps', target_application.ai_recommended_setup_steps,
      'ai_growth_opportunities', target_application.ai_growth_opportunities,
      'ai_first_meeting_points', target_application.ai_first_meeting_points
    ),
    'active'
  )
  on conflict (store_id, snapshot_type) do update set
    application_id = excluded.application_id,
    content = excluded.content,
    status = 'active',
    updated_at = now();

  if target_user_id is not null then
    insert into public.user_profiles (user_id, display_name, role)
    values (target_user_id, coalesce(target_application.contact_name, 'cozysakura'), 'user')
    on conflict (user_id) do update set
      display_name = coalesce(public.user_profiles.display_name, excluded.display_name),
      role = case when public.user_profiles.role = 'platform_admin' then public.user_profiles.role else 'user' end,
      updated_at = now();

    insert into public.organization_members (organization_id, user_id, role_key)
    values (target_organization_id, target_user_id, 'org_owner')
    on conflict (organization_id, user_id) do update set
      role_key = excluded.role_key;
  end if;

  update public.applications
  set
    industry_type_key = 'beauty_salon',
    industry_label = coalesce(industry_label, '美容室・サロン'),
    organization_id = target_organization_id,
    store_id = target_store_id,
    approved_organization_id = target_organization_id,
    approved_store_id = target_store_id,
    approved_user_id = coalesce(target_user_id, approved_user_id),
    invited_user_id = coalesce(target_user_id, invited_user_id),
    invitation_status = case when target_user_id is null then invitation_status else 'invite_generated' end,
    account_status = case when target_user_id is null then account_status else 'invited' end,
    updated_at = now()
  where id = target_application.id;
end $$;
