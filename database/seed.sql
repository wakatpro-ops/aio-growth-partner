insert into public.plans (key, name, description)
values ('starter', 'Starter', 'Phase 1 default plan')
on conflict (key) do nothing;

insert into public.industry_types (key, name, description, default_feature_flags, default_dashboard_layout, default_profile_schema)
values
  (
    'general_store',
    '汎用店舗',
    '飲食店、美容室、整体院などに転用できる基本業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":true,"repair_services":false,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false,"billing":false,"accounting":false}',
    '["store_profile_completion","ai_post_generation","review_reply","aio_score","instagram_post"]',
    '[{"key":"target_customer","label":"ターゲット顧客"},{"key":"brand_tone","label":"投稿トーン"},{"key":"opening_hours","label":"営業時間"},{"key":"strengths","label":"店舗の強み"}]'
  ),
  (
    'auto_repair',
    '自動車修理',
    '車検、点検、修理相談に対応する整備工場向け業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":false,"repair_services":true,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false,"billing":false,"accounting":false}',
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
  ('marketing_drafts', '投稿下書き管理', 'AIで生成した投稿下書きを保存・承認・管理します。', 'marketing', false),
  ('instagram_draft_generation', 'Instagram下書き生成', '業務データをもとにInstagram向け投稿案を生成します。', 'marketing', false),
  ('google_business_profile_draft', 'Googleビジネスプロフィール下書き', 'Google投稿向けの最新情報、キャンペーン、サービス紹介文を生成します。', 'marketing', false),
  ('ai_monthly_recommendations', 'AI月次改善提案', '月次レポートから集客改善提案を生成します。', 'marketing', false),
  ('image_caption_generation', '画像キャプション生成', '将来の画像アップロードからのキャプション生成拡張です。', 'marketing', false),
  ('demand_alerts', '需要予測・在庫アラート', '在庫と業務データから需要や発注注意を提案します。', 'marketing', false),
  ('data_imports', '外部売上データ取り込み', 'CSVやExcelから外部売上データを取り込みます。', 'data', false),
  ('csv_import', 'CSV取り込み', 'CSVファイルから売上データを取り込みます。', 'data', false),
  ('excel_import', 'Excel取り込み', 'Excelファイルから売上データを取り込みます。', 'data', false),
  ('column_mapping', '列マッピング', '外部データ列をAIO標準項目に対応付けます。', 'data', false),
  ('sales_normalization', '売上データ正規化', '取り込んだ売上データを共通形式に整えます。', 'data', false),
  ('sales_reports', '売上レポート', '外部売上データの簡易集計を表示します。', 'data', false),
  ('sales_ai_report', 'AI月次売上レポート', '外部売上データから月次AI分析と改善提案を作成します。', 'ai', false),
  ('sales_anomaly_detection', '売上異常値検出', '売上の急増減、極端な単価、数量、重複候補を検出します。', 'data', false),
  ('google_sheets_import', 'Googleスプレッドシート取り込み', '将来のGoogleスプレッドシート取り込み拡張です。', 'data', false),
  ('pos_api_integrations', 'POS API連携', '将来のレジ・販売管理API連携拡張です。', 'integration', false),
  ('sales_export', '売上CSV出力', '将来の整形済みCSV出力拡張です。', 'data', false),
  ('sales_report_pdf', '売上レポートPDF', '将来の月次資料PDF出力拡張です。', 'data', false),
  ('ai_sales_insights', 'AI売上分析', '将来のAI月次コメント・需要予測拡張です。', 'ai', false),
  ('admin', '管理者画面', '運営者が全体を確認します。', 'admin', true),
  ('billing', '請求連携', '将来のStripe連携用拡張ポイントです。', 'integration', false),
  ('accounting', '会計連携', '将来のfreee連携用拡張ポイントです。', 'integration', false)
on conflict (key) do nothing;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('store_profile','multi_store','ai_post_generation','ai_review_reply','aio_diagnosis','admin','product_management','inventory_management','customer_management','estimate_management','invoice_management','pdf_export','monthly_report','marketing_drafts','instagram_draft_generation','google_business_profile_draft','ai_monthly_recommendations','demand_alerts','data_imports','csv_import','excel_import','column_mapping','sales_normalization','sales_reports','sales_ai_report','sales_anomaly_detection','sales_report_pdf')
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
  ('general_store', 'pdf_export', true),
  ('auto_repair', 'pdf_export', true),
  ('general_store', 'monthly_report', true),
  ('auto_repair', 'monthly_report', true)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'image_caption_generation', false),
  ('auto_repair', 'image_caption_generation', false),
  ('general_store', 'google_sheets_import', false),
  ('auto_repair', 'google_sheets_import', false),
  ('general_store', 'pos_api_integrations', false),
  ('auto_repair', 'pos_api_integrations', false),
  ('general_store', 'sales_export', false),
  ('auto_repair', 'sales_export', false),
  ('general_store', 'sales_report_pdf', true),
  ('auto_repair', 'sales_report_pdf', true),
  ('general_store', 'sales_ai_report', true),
  ('auto_repair', 'sales_ai_report', true),
  ('general_store', 'sales_anomaly_detection', true),
  ('auto_repair', 'sales_anomaly_detection', true),
  ('general_store', 'ai_sales_insights', false),
  ('auto_repair', 'ai_sales_insights', false)
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

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'instagram_draft_generation', 'instagram_draft_generation', '汎用店舗 Instagram下書き生成', 'あなたは地域店舗のInstagram運用に詳しいマーケターです。来店促進と口コミ促進につながる自然な文章を作成してください。', '店舗プロフィール、商品、在庫、月次レポートをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。'),
  ('auto_repair', 'instagram_draft_generation', 'instagram_draft_generation', '自動車修理 Instagram下書き生成', 'あなたは自動車整備工場の集客に詳しいマーケターです。整備、点検、部品、安全性、予約導線を重視してください。', '店舗プロフィール、部品、在庫、月次レポートをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。'),
  ('general_store', 'google_business_profile_draft', 'google_business_profile_draft', '汎用店舗 Google投稿下書き生成', 'あなたはGoogleビジネスプロフィール投稿に詳しいローカルSEO編集者です。検索されやすい語句を自然に含めてください。', '投稿種別、店舗プロフィール、商品、月次レポートをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。'),
  ('auto_repair', 'google_business_profile_draft', 'google_business_profile_draft', '自動車修理 Google投稿下書き生成', 'あなたは整備工場向けGoogleビジネスプロフィール投稿に詳しいローカルSEO編集者です。車検、点検、修理、地域名、予約導線を自然に含めてください。', '投稿種別、店舗プロフィール、部品、整備メニュー、月次レポートをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。'),
  ('general_store', 'ai_monthly_recommendations', 'ai_monthly_recommendations', '汎用店舗 月次AI改善提案', 'あなたは地域店舗の売上改善と集客施策に詳しいコンサルタントです。', '月次レポート、商品、在庫、顧客情報をもとに、title、good_points、cautions、next_actions、posting_themes、inventory_suggestions、customer_priorities、ai_reasoningをJSONで返してください。'),
  ('auto_repair', 'ai_monthly_recommendations', 'ai_monthly_recommendations', '自動車修理 月次AI改善提案', 'あなたは自動車整備工場の業務改善と地域集客に詳しいコンサルタントです。安全性、点検需要、部品在庫、予約導線を重視してください。', '月次レポート、部品、在庫、顧客・車両情報をもとに、title、good_points、cautions、next_actions、posting_themes、inventory_suggestions、customer_priorities、ai_reasoningをJSONで返してください。')
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'sales_ai_report', 'sales_ai_monthly_report', '汎用店舗 AI月次売上レポート', 'あなたは店舗オーナー向けに売上分析と販促改善を分かりやすく整理するコンサルタントです。', '対象月の売上集計、商品ランキング、支払方法、異常値候補をもとに、title、good_points、cautions、growth_items、promotion_ideas、inventory_notes、next_actions、industry_advice、ai_reasoningをJSONで返してください。'),
  ('auto_repair', 'sales_ai_report', 'sales_ai_monthly_report', '自動車修理 AI月次売上レポート', 'あなたは自動車整備工場の売上分析と集客改善に詳しいコンサルタントです。オイル交換、タイヤ交換、車検、点検、部品在庫、リピート来店の観点で具体的に提案してください。', '対象月の売上集計、整備メニューランキング、支払方法、異常値候補をもとに、title、good_points、cautions、growth_items、promotion_ideas、inventory_notes、next_actions、industry_advice、ai_reasoningをJSONで返してください。')
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

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
  ('starter', 'enabled_modules', '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","sales_report_pdf"]')
on conflict (plan_key, limit_key) do nothing;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

update public.plan_limits
set limit_value = '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","sales_report_pdf"]'
where plan_key = 'starter' and limit_key = 'enabled_modules';
