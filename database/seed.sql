insert into public.plans (key, name, description)
values ('starter', 'Starter', 'Phase 1 default plan')
on conflict (key) do nothing;

insert into public.industry_types (key, name, description, default_feature_flags, default_dashboard_layout, default_profile_schema)
values
  (
    'general_store',
    '汎用店舗',
    '飲食店、美容室、整体院などに転用できる基本業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":true,"repair_services":false,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"demand_forecast":true,"inventory_alerts":true,"recommended_actions":true,"growth_action_center":true,"google_business_profile_drafts":true,"instagram_drafts":true,"review_reply_drafts":true,"customer_message_drafts":true,"pop_copy_drafts":true,"line_message_drafts":true,"growth_calendar":true,"draft_approval_flow":true,"draft_editing":true,"channel_previews":true,"external_channel_accounts":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false,"billing":false,"accounting":false}',
    '["store_profile_completion","ai_post_generation","review_reply","aio_score","instagram_post"]',
    '[{"key":"target_customer","label":"ターゲット顧客"},{"key":"brand_tone","label":"投稿トーン"},{"key":"opening_hours","label":"営業時間"},{"key":"strengths","label":"店舗の強み"}]'
  ),
  (
    'auto_repair',
    '自動車修理',
    '車検、点検、修理相談に対応する整備工場向け業態。',
    '{"ai_post_generation":true,"ai_review_reply":true,"aio_diagnosis":true,"instagram_post":false,"repair_services":true,"product_management":true,"inventory_management":true,"customer_management":true,"estimate_management":true,"invoice_management":true,"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"demand_forecast":true,"inventory_alerts":true,"recommended_actions":true,"growth_action_center":true,"google_business_profile_drafts":true,"instagram_drafts":true,"review_reply_drafts":true,"customer_message_drafts":true,"pop_copy_drafts":true,"line_message_drafts":true,"growth_calendar":true,"draft_approval_flow":true,"draft_editing":true,"channel_previews":true,"external_channel_accounts":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false,"billing":false,"accounting":false}',
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
  ('demand_forecast', '需要予測', '売上傾向から来月伸びそうな商品・サービスを推定します。', 'ai', false),
  ('inventory_alerts', '在庫アラート', '売上傾向と在庫を照合し、在庫切れや過剰在庫を検出します。', 'data', false),
  ('recommended_actions', '次アクション提案', '需要予測と在庫アラートから投稿、販促、発注の打ち手を提案します。', 'ai', false),
  ('growth_action_center', '集客アクションセンター', 'AI提案を実行用の投稿、返信、案内、POP、配信用下書きに変換して管理します。', 'marketing', false),
  ('google_business_profile_drafts', 'Google投稿下書き', 'Googleビジネスプロフィール向け投稿案を管理します。', 'marketing', false),
  ('instagram_drafts', 'Instagram投稿下書き', 'Instagram向け投稿案を管理します。', 'marketing', false),
  ('review_reply_drafts', 'クチコミ返信下書き', 'クチコミ返信に使える文章案を管理します。', 'marketing', false),
  ('customer_message_drafts', '既存顧客案内下書き', '既存顧客への案内文を管理します。', 'marketing', false),
  ('pop_copy_drafts', '店頭POP下書き', '店頭POPに使える短文を管理します。', 'marketing', false),
  ('line_message_drafts', 'LINE配信下書き', 'LINE配信に使える文章を管理します。', 'marketing', false),
  ('growth_calendar', '集客カレンダー', '投稿、配信、返信、POP作成の予定を管理します。', 'marketing', false),
  ('draft_approval_flow', '下書き承認フロー', '承認待ち、承認済み、差し戻しを管理します。', 'marketing', false),
  ('draft_editing', '下書き編集', '投稿下書きの本文、CTA、ハッシュタグを編集します。', 'marketing', false),
  ('channel_previews', 'チャネル別プレビュー', 'Google、Instagram、LINE、POPなどの見え方を確認します。', 'marketing', false),
  ('external_channel_accounts', '外部チャネル設定', '将来の外部アカウント連携に備えた管理項目です。', 'integration', false),
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
where module.key in ('store_profile','multi_store','ai_post_generation','ai_review_reply','aio_diagnosis','admin','product_management','inventory_management','customer_management','estimate_management','invoice_management','pdf_export','monthly_report','marketing_drafts','instagram_draft_generation','google_business_profile_draft','ai_monthly_recommendations','demand_alerts','data_imports','csv_import','excel_import','column_mapping','sales_normalization','sales_reports','sales_ai_report','sales_anomaly_detection','demand_forecast','inventory_alerts','recommended_actions','growth_action_center','google_business_profile_drafts','instagram_drafts','review_reply_drafts','customer_message_drafts','pop_copy_drafts','line_message_drafts','growth_calendar','draft_approval_flow','draft_editing','channel_previews','external_channel_accounts','sales_report_pdf')
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
  ('general_store', 'demand_forecast', true),
  ('auto_repair', 'demand_forecast', true),
  ('general_store', 'inventory_alerts', true),
  ('auto_repair', 'inventory_alerts', true),
  ('general_store', 'recommended_actions', true),
  ('auto_repair', 'recommended_actions', true),
  ('general_store', 'growth_action_center', true),
  ('auto_repair', 'growth_action_center', true),
  ('general_store', 'google_business_profile_drafts', true),
  ('auto_repair', 'google_business_profile_drafts', true),
  ('general_store', 'instagram_drafts', true),
  ('auto_repair', 'instagram_drafts', true),
  ('general_store', 'review_reply_drafts', true),
  ('auto_repair', 'review_reply_drafts', true),
  ('general_store', 'customer_message_drafts', true),
  ('auto_repair', 'customer_message_drafts', true),
  ('general_store', 'pop_copy_drafts', true),
  ('auto_repair', 'pop_copy_drafts', true),
  ('general_store', 'line_message_drafts', true),
  ('auto_repair', 'line_message_drafts', true),
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

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'recommended_actions', 'demand_action_recommendations', '汎用店舗 需要予測・次アクション提案', 'あなたは店舗の需要予測、在庫確認、販促アクションを分かりやすく整理する業務改善アドバイザーです。', '需要予測、在庫アラート、業態情報をもとに、actions配列でInstagram投稿案、Google投稿案、店頭POP短文、既存顧客案内文、発注確認などをJSONで返してください。各actionはaction_type、title、body、item_name、priority、reasonを含めてください。'),
  ('auto_repair', 'recommended_actions', 'demand_action_recommendations', '自動車修理 需要予測・次アクション提案', 'あなたは自動車整備工場の需要予測、部品在庫、集客アクションに詳しい業務改善アドバイザーです。点検、オイル交換、タイヤ交換、車検前点検、部品交換、リピート来店の文脈で具体的に提案してください。', '需要予測、在庫アラート、業態情報をもとに、actions配列でInstagram投稿案、Google投稿案、店頭POP短文、既存顧客案内文、発注確認などをJSONで返してください。各actionはaction_type、title、body、item_name、priority、reasonを含めてください。')
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'growth_action_center', 'growth_action_draft_generation', '汎用店舗 集客アクション下書き生成', 'あなたは店舗の集客アクションを、すぐ使える投稿・案内・返信の下書きに変換する編集者です。来店促進、口コミ促進、既存顧客フォローを重視してください。', '売上データ、AI月次レポート、需要予測、次アクション提案、店舗プロフィールをもとに、actions配列でGoogle投稿案、Instagram投稿案、クチコミ返信案、既存顧客案内文、店頭POP文、LINE配信用文章をJSONで返してください。各actionはtarget_channel、title、summary、priority、reason、recommended_date、draftを含め、draftはtitle、body、short_body、hashtags、call_to_actionを含めてください。'),
  ('auto_repair', 'growth_action_center', 'growth_action_draft_generation', '自動車修理 集客アクション下書き生成', 'あなたは自動車整備工場の集客アクションを、すぐ使える下書きに変換する編集者です。点検、オイル交換、タイヤ交換、車検、部品交換、リピート来店の文脈で、信頼感と予約導線を重視してください。', '売上データ、AI月次レポート、需要予測、次アクション提案、店舗プロフィールをもとに、actions配列でGoogle投稿案、Instagram投稿案、クチコミ返信案、既存顧客案内文、店頭POP文、LINE配信用文章をJSONで返してください。各actionはtarget_channel、title、summary、priority、reason、recommended_date、draftを含め、draftはtitle、body、short_body、hashtags、call_to_actionを含めてください。')
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
  ('starter', 'enabled_modules', '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","demand_forecast","inventory_alerts","recommended_actions","growth_action_center","google_business_profile_drafts","instagram_drafts","review_reply_drafts","customer_message_drafts","pop_copy_drafts","line_message_drafts","growth_calendar","draft_approval_flow","draft_editing","channel_previews","external_channel_accounts","sales_report_pdf"]')
on conflict (plan_key, limit_key) do nothing;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"demand_forecast":true,"inventory_alerts":true,"recommended_actions":true,"growth_action_center":true,"google_business_profile_drafts":true,"instagram_drafts":true,"review_reply_drafts":true,"customer_message_drafts":true,"pop_copy_drafts":true,"line_message_drafts":true,"growth_calendar":true,"draft_approval_flow":true,"draft_editing":true,"channel_previews":true,"external_channel_accounts":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"pdf_export":true,"monthly_report":true,"marketing_drafts":true,"instagram_draft_generation":true,"google_business_profile_draft":true,"ai_monthly_recommendations":true,"image_caption_generation":false,"demand_alerts":true,"data_imports":true,"csv_import":true,"excel_import":true,"column_mapping":true,"sales_normalization":true,"sales_reports":true,"sales_ai_report":true,"sales_anomaly_detection":true,"demand_forecast":true,"inventory_alerts":true,"recommended_actions":true,"growth_action_center":true,"google_business_profile_drafts":true,"instagram_drafts":true,"review_reply_drafts":true,"customer_message_drafts":true,"pop_copy_drafts":true,"line_message_drafts":true,"growth_calendar":true,"draft_approval_flow":true,"draft_editing":true,"channel_previews":true,"external_channel_accounts":true,"google_sheets_import":false,"pos_api_integrations":false,"sales_export":false,"sales_report_pdf":true,"ai_sales_insights":false}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

update public.plan_limits
set limit_value = '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","demand_forecast","inventory_alerts","recommended_actions","growth_action_center","google_business_profile_drafts","instagram_drafts","review_reply_drafts","customer_message_drafts","pop_copy_drafts","line_message_drafts","growth_calendar","draft_approval_flow","draft_editing","channel_previews","external_channel_accounts","sales_report_pdf"]'
where plan_key = 'starter' and limit_key = 'enabled_modules';

insert into public.modules (key, name, description, category, is_core)
values
  ('google_integrations', 'Google連携', 'Googleビジネスプロフィール、Gmail、Googleカレンダー連携の共通基盤です。', 'integration', false),
  ('google_oauth_connection', 'Google OAuth接続', 'Google OAuth接続状態とトークン保存の基盤です。', 'integration', false),
  ('google_business_profile_integration', 'Googleビジネスプロフィール連携', 'Google検索・マップ向け投稿とロケーション管理の準備です。', 'integration', false),
  ('gmail_draft_integration', 'Gmail下書き連携', '既存顧客案内メールをGmail下書きへ連携する準備です。', 'integration', false),
  ('google_calendar_integration', 'Googleカレンダー連携', '投稿・配信・案内予定をGoogleカレンダーへ連携する準備です。', 'integration', false),
  ('external_publish_jobs', '外部送信準備ログ', '外部サービスに送る前の確認内容、予約日時、結果ログを保存します。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
values
  ('general_store', 'google_integrations', true),
  ('auto_repair', 'google_integrations', true),
  ('general_store', 'google_oauth_connection', true),
  ('auto_repair', 'google_oauth_connection', true),
  ('general_store', 'google_business_profile_integration', true),
  ('auto_repair', 'google_business_profile_integration', true),
  ('general_store', 'gmail_draft_integration', true),
  ('auto_repair', 'gmail_draft_integration', true),
  ('general_store', 'google_calendar_integration', true),
  ('auto_repair', 'google_calendar_integration', true),
  ('general_store', 'external_publish_jobs', true),
  ('auto_repair', 'external_publish_jobs', true)
on conflict (industry_type_key, module_key) do update set is_enabled = excluded.is_enabled;

insert into public.ai_prompt_templates (industry_type_key, module_key, template_key, name, system_prompt, user_prompt_template)
values
  ('general_store', 'google_integrations', 'google_send_preparation', '汎用店舗 Google送信前確認', 'あなたは地域店舗のGoogle連携前チェックを支援する運用担当です。外部送信前に、本文、送信先、注意点を簡潔に整理してください。', '集客アクション、下書き、送信先、予約日時をもとに、確認ポイント、リスク、次の手順をJSONで返してください。'),
  ('auto_repair', 'google_integrations', 'google_send_preparation', '自動車修理 Google送信前確認', 'あなたは整備工場のGoogle連携前チェックを支援する運用担当です。車検、点検、修理、予約導線の表現が正しいか確認してください。', '集客アクション、下書き、送信先、予約日時をもとに、確認ポイント、リスク、次の手順をJSONで返してください。')
on conflict (industry_type_key, module_key, template_key) do update set
  name = excluded.name,
  system_prompt = excluded.system_prompt,
  user_prompt_template = excluded.user_prompt_template,
  is_active = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"google_integrations":true,"google_oauth_connection":true,"google_business_profile_integration":true,"gmail_draft_integration":true,"google_calendar_integration":true,"external_publish_jobs":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"google_integrations":true,"google_oauth_connection":true,"google_business_profile_integration":true,"gmail_draft_integration":true,"google_calendar_integration":true,"external_publish_jobs":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

update public.plan_limits
set limit_value = '["store_profile","multi_store","ai_post_generation","ai_review_reply","aio_diagnosis","product_management","inventory_management","customer_management","estimate_management","invoice_management","pdf_export","monthly_report","marketing_drafts","instagram_draft_generation","google_business_profile_draft","ai_monthly_recommendations","demand_alerts","data_imports","csv_import","excel_import","column_mapping","sales_normalization","sales_reports","sales_ai_report","sales_anomaly_detection","demand_forecast","inventory_alerts","recommended_actions","growth_action_center","google_business_profile_drafts","instagram_drafts","review_reply_drafts","customer_message_drafts","pop_copy_drafts","line_message_drafts","growth_calendar","draft_approval_flow","draft_editing","channel_previews","external_channel_accounts","google_integrations","google_oauth_connection","google_business_profile_integration","gmail_draft_integration","google_calendar_integration","external_publish_jobs","sales_report_pdf"]'
where plan_key = 'starter' and limit_key = 'enabled_modules';

insert into public.modules (key, name, description, category, is_core)
values
  ('invoice_compliance', 'インボイス対応請求書', '登録番号、税率別内訳、取引年月日を含む請求書管理です。', 'accounting', false),
  ('invoice_numbering', '請求書番号連番管理', '店舗ごとに請求書番号を連番管理します。', 'accounting', false),
  ('tax_rate_breakdown', '税率別内訳', '10%と8%の対象額、消費税額を管理します。', 'accounting', false),
  ('order_workflow', '受注・作業フロー', '見積、受注、作業完了、請求、入金の流れを管理します。', 'operations', false),
  ('order_management', '受注管理', '見積から受注、作業完了、請求化までを管理します。', 'operations', false),
  ('payment_management', '入金管理', '入金状態と支払方法を管理します。', 'payment', false),
  ('accounting_csv_export', '会計CSV出力', '請求・税額・入金状態をCSV出力します。', 'accounting', false),
  ('accounting_export', '会計・売上CSV出力', '売上日、税率、入金状態を含む汎用CSVを出力します。', 'accounting', false),
  ('pdf_issue_logs', 'PDF発行履歴', '請求書PDFの発行、再発行履歴を残します。', 'audit', false),
  ('audit_logs', '操作ログ', '請求、入金、CSV出力などの操作証跡を残します。', 'audit', false),
  ('audit_log', '証跡管理', '重要操作、ステータス変更、出力履歴を確認します。', 'audit', false),
  ('subsidy_impact_report', '導入効果レポート', '電子化、売上管理、入金管理、AI活用件数を可視化します。', 'report', false),
  ('invoice_tool_map', '補助金対応機能マップ', '会計・受発注・決済・データ連携・AI活用・証跡を説明しやすく整理します。', 'report', false),
  ('future_accounting_integrations', '将来の会計・決済連携', 'freee、マネーフォワード、Stripeへの将来拡張枠です。', 'integration', false)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_core = excluded.is_core;

insert into public.industry_modules (industry_type_key, module_key, is_enabled)
select industry.key, module.key, true
from public.industry_types industry
cross join public.modules module
where module.key in ('invoice_compliance','invoice_numbering','tax_rate_breakdown','order_workflow','order_management','payment_management','accounting_csv_export','accounting_export','pdf_issue_logs','audit_logs','audit_log','subsidy_impact_report','invoice_tool_map','future_accounting_integrations')
on conflict (industry_type_key, module_key) do update set is_enabled = true;

update public.industry_types
set default_feature_flags = default_feature_flags || '{"invoice_compliance":true,"invoice_numbering":true,"tax_rate_breakdown":true,"order_workflow":true,"order_management":true,"payment_management":true,"accounting_csv_export":true,"accounting_export":true,"pdf_issue_logs":true,"audit_logs":true,"audit_log":true,"subsidy_impact_report":true,"invoice_tool_map":true,"future_accounting_integrations":true}'::jsonb
where key in ('general_store', 'auto_repair');

update public.stores
set feature_flags = feature_flags || '{"invoice_compliance":true,"invoice_numbering":true,"tax_rate_breakdown":true,"order_workflow":true,"order_management":true,"payment_management":true,"accounting_csv_export":true,"accounting_export":true,"pdf_issue_logs":true,"audit_logs":true,"audit_log":true,"subsidy_impact_report":true,"invoice_tool_map":true,"future_accounting_integrations":true}'::jsonb
where industry_type_key in ('general_store', 'auto_repair');

insert into public.plan_limits (plan_key, limit_key, limit_value)
values ('starter', 'phase6a_invoice_ready_modules', '["invoice_compliance","invoice_numbering","tax_rate_breakdown","order_workflow","order_management","payment_management","accounting_csv_export","accounting_export","pdf_issue_logs","audit_logs","audit_log","subsidy_impact_report","invoice_tool_map","future_accounting_integrations"]')
on conflict (plan_key, limit_key) do update set limit_value = excluded.limit_value;

insert into public.invoice_number_sequences (organization_id, store_id, prefix, next_number, registration_number, qualified_invoice_issuer_name)
select
  stores.organization_id,
  stores.id,
  case when stores.industry_type_key = 'auto_repair' then 'INV-AUTO' else 'INV' end,
  1,
  null,
  stores.name
from public.stores
where stores.status = 'active'
on conflict (store_id) do update set
  prefix = coalesce(public.invoice_number_sequences.prefix, excluded.prefix),
  qualified_invoice_issuer_name = coalesce(public.invoice_number_sequences.qualified_invoice_issuer_name, excluded.qualified_invoice_issuer_name),
  updated_at = now();
