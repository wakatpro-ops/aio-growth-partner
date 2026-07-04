insert into public.plans (key, name, description)
values ('starter', 'Starter', 'Phase 1 default plan')
on conflict (key) do nothing;

insert into public.industry_types (key, name, description, default_feature_flags, default_dashboard_layout, default_profile_schema)
values
  (
    'general_store',
    '汎用店舗',
    '飲食店、美容室、整体院などに転用できる基本業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":true,"repair_services":false,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":false,"monthly_report":false,"billing":false,"accounting":false}',
    '["store_profile_completion","ai_post_generation","review_reply","aio_score","instagram_post"]',
    '[{"key":"target_customer","label":"ターゲット顧客"},{"key":"brand_tone","label":"投稿トーン"},{"key":"opening_hours","label":"営業時間"},{"key":"strengths","label":"店舗の強み"}]'
  ),
  (
    'auto_repair',
    '自動車修理',
    '車検、点検、修理相談に対応する整備工場向け業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":false,"repair_services":true,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":false,"monthly_report":false,"billing":false,"accounting":false}',
    '["store_profile_completion","aio_score","review_reply","repair_service_visibility","ai_post_generation"]',
    '[{"key":"services","label":"対応サービス"},{"key":"supported_makers","label":"対応メーカー"},{"key":"has_replacement_car","label":"代車あり"},{"key":"emergency_support","label":"緊急対応可"},{"key":"reservation_method","label":"予約方法"},{"key":"brand_tone","label":"投稿トーン"}]'
  )
on conflict (key) do nothing;

insert into public.modules (key, name, description, category, is_core)
values
  ('store_profile', '店舗プロフィール', '店舗情報と業態別プロフィールを管理します。', 'core', true),
  ('multi_store', '複数店舗管理', '組織配下で複数店舗を管理します。', 'core', true),
  ('ai_post_generation', 'AI投稿文生成', '業態別プロンプトで投稿文を生成します。', 'ai', false),
  ('ai_review_reply', 'AIクチコミ返信', 'クチコミ本文から返信文を生成します。', 'ai', false),
  ('aio_diagnosis', 'AIO診断', 'AI検索時代に向けた店舗情報の診断を行います。', 'ai', false),
  ('instagram_post', 'Instagram投稿', '業態によって非表示にできる投稿機能です。', 'industry', false),
  ('repair_services', '修理サービス管理', '自動車修理向けのサービス可視化です。', 'industry', false),
  ('product_management', '商品・部品・サービス管理', '販売品、部品、提供サービスを業態別の文言で管理します。', 'industry', false),
  ('inventory_management', '在庫管理', '商品や部品の在庫数、入出庫、発注目安を管理します。', 'industry', false),
  ('customer_management', '顧客管理', '店舗ごとの顧客情報と業態別補足情報を管理します。', 'core', false),
  ('estimate_management', '見積書管理', '顧客向け見積書を作成・管理します。', 'core', false),
  ('invoice_management', '請求書管理', '顧客向け請求書を作成・管理します。', 'core', false),
  ('pdf_export', 'PDF出力', '見積書、請求書、レポートのPDF出力拡張ポイントです。', 'integration', false),
  ('monthly_report', '月次レポート', '売上、見積、請求、在庫の月次集計を確認します。', 'core', false),
  ('admin', '管理者画面', '運営者が全体を確認します。', 'admin', true),
  ('billing', '請求連携', '将来のStripe連携用拡張ポイントです。', 'integration', false),
  ('accounting', '会計連携', '将来のfreee連携用拡張ポイントです。', 'integration', false)
on conflict (key) do nothing;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('store_profile','multi_store','ai_post_generation','ai_review_reply','aio_diagnosis','admin','product_management','inventory_management','customer_management','estimate_management','invoice_management')
on conflict (industry_type_key, module_key) do nothing;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'instagram_post', true),
  ('auto_repair', 'instagram_post', false),
  ('auto_repair', 'repair_services', true),
  ('general_store', 'repair_services', false),
  ('general_store', 'billing', false),
  ('general_store', 'accounting', false),
  ('auto_repair', 'billing', false),
  ('auto_repair', 'accounting', false),
  ('general_store', 'pdf_export', false),
  ('auto_repair', 'pdf_export', false),
  ('general_store', 'monthly_report', false),
  ('auto_repair', 'monthly_report', false)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'ai_post_generation', 'post_generation', '汎用店舗 投稿文生成', 'あなたは地域店舗の集客支援に詳しいマーケターです。', '店舗情報と入力内容をもとに、投稿文、短縮版、ハッシュタグ案をJSONで返してください。'),
  ('auto_repair', 'ai_post_generation', 'post_generation', '自動車修理 投稿文生成', 'あなたは自動車整備工場の地域集客に詳しいマーケターです。信頼感、安全性、わかりやすさを重視してください。', '車検、整備、修理相談につながる投稿文、短縮版、ハッシュタグ案をJSONで返してください。'),
  ('general_store', 'ai_review_reply', 'review_reply', '汎用店舗 クチコミ返信', 'あなたは地域店舗のクチコミ返信を支援する編集者です。', '評価とクチコミ本文に対して丁寧な返信文をJSONで返してください。'),
  ('auto_repair', 'ai_review_reply', 'review_reply', '自動車修理 クチコミ返信', 'あなたは自動車整備工場の店長を支援する返信作成者です。安心感、技術力、説明の丁寧さが伝わる返信にしてください。', '評価とクチコミ本文に対して整備工場らしい返信文をJSONで返してください。'),
  ('general_store', 'aio_diagnosis', 'aio_diagnosis', '汎用店舗 AIO診断', 'あなたは地域店舗のAIO診断コンサルタントです。', '店舗プロフィールを診断し、score、summary、strengths、issues、recommendationsをJSONで返してください。'),
  ('auto_repair', 'aio_diagnosis', 'aio_diagnosis', '自動車修理 AIO診断', 'あなたは自動車修理・整備工場のAIO診断コンサルタントです。', '対応サービス、地域名、信頼性、予約導線を診断し、score、summary、strengths、issues、recommendationsをJSONで返してください。')
on conflict (industry_type_key, module_key, template_key) do nothing;

insert into public.role_permissions (role_key, permission_key, is_allowed)
values
  ('platform_admin', '*', true),
  ('org_owner', 'stores.read', true),
  ('org_owner', 'stores.write', true),
  ('org_owner', 'ai.generate_post', true),
  ('org_owner', 'ai.generate_review_reply', true),
  ('org_owner', 'ai.run_diagnosis', true),
  ('store_manager', 'stores.read', true),
  ('store_manager', 'stores.write', true),
  ('staff', 'stores.read', true),
  ('staff', 'ai.generate_post', true),
  ('viewer', 'stores.read', true)
on conflict (role_key, permission_key) do nothing;

insert into public.plan_limits (plan_key, limit_key, limit_value)
values
  ('starter', 'max_stores', '3'),
  ('starter', 'max_users', '5'),
  ('starter', 'ai_generations_per_month', '100'),
  ('starter', 'enabled_modules', '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management"]')
on conflict (plan_key, limit_key) do nothing;
