import type { IndustryConfig } from "@/types/domain";

export const industries: Record<string, IndustryConfig> = {
  general_store: {
    key: "general_store",
    name: "汎用店舗",
    dashboardTitle: "店舗運営ダッシュボード",
    profileLabel: "店舗プロフィール",
    postLabel: "投稿文生成",
    reviewLabel: "クチコミ返信",
    diagnosisLabel: "AIO診断",
    businessLabels: {
      item: "商品・サービス",
      product: "商品",
      part: "備品・材料",
      service: "サービス",
      stock: "在庫",
      customer: "顧客",
      estimate: "見積書",
      invoice: "請求書"
    },
    defaultFeatureFlags: {
      ai_post_generation: true,
      ai_review_reply: true,
      aio_diagnosis: true,
      instagram_post: true,
      repair_services: false,
      product_management: true,
      inventory_management: true,
      customer_management: true,
      estimate_management: true,
      invoice_management: true,
      pdf_export: true,
      monthly_report: true,
      marketing_drafts: true,
      instagram_draft_generation: true,
      google_business_profile_draft: true,
      ai_monthly_recommendations: true,
      image_caption_generation: false,
      demand_alerts: true,
      data_imports: true,
      csv_import: true,
      excel_import: true,
      column_mapping: true,
      sales_normalization: true,
      sales_reports: true,
      sales_ai_report: true,
      sales_anomaly_detection: true,
      demand_forecast: true,
      inventory_alerts: true,
      recommended_actions: true,
      growth_action_center: true,
      google_business_profile_drafts: true,
      instagram_drafts: true,
      review_reply_drafts: true,
      customer_message_drafts: true,
      pop_copy_drafts: true,
      line_message_drafts: true,
      growth_calendar: true,
      draft_approval_flow: true,
      draft_editing: true,
      channel_previews: true,
      external_channel_accounts: true,
      google_integrations: true,
      google_oauth_connection: true,
      google_business_profile_integration: true,
      gmail_draft_integration: true,
      google_calendar_integration: true,
      external_publish_jobs: true,
      google_sheets_import: false,
      pos_api_integrations: false,
      sales_export: false,
      sales_report_pdf: true,
      ai_sales_insights: false,
      billing: false,
      accounting: false
    },
    dashboardCards: [
      "store_profile_completion",
      "ai_post_generation",
      "review_reply",
      "aio_score",
      "instagram_post"
    ],
    profileFields: [
      { key: "target_customer", label: "ターゲット顧客", type: "text", placeholder: "近隣住民、会社員、ファミリーなど" },
      { key: "brand_tone", label: "投稿トーン", type: "text", placeholder: "親しみやすい、上品、専門的など" },
      { key: "opening_hours", label: "営業時間", type: "textarea", placeholder: "月-金 10:00-19:00" },
      { key: "strengths", label: "店舗の強み", type: "textarea", placeholder: "接客、価格、専門性、アクセスなど" }
    ]
  },
  auto_repair: {
    key: "auto_repair",
    name: "自動車修理",
    dashboardTitle: "整備工場ダッシュボード",
    profileLabel: "整備工場プロフィール",
    postLabel: "整備・修理投稿文生成",
    reviewLabel: "整備クチコミ返信",
    diagnosisLabel: "地域集客診断",
    businessLabels: {
      item: "部品・作業",
      product: "用品",
      part: "部品",
      service: "作業メニュー",
      stock: "部品在庫",
      customer: "顧客・車両",
      estimate: "整備見積書",
      invoice: "整備請求書",
      vehicle: "車両情報"
    },
    defaultFeatureFlags: {
      ai_post_generation: true,
      ai_review_reply: true,
      aio_diagnosis: true,
      instagram_post: false,
      repair_services: true,
      product_management: true,
      inventory_management: true,
      customer_management: true,
      estimate_management: true,
      invoice_management: true,
      pdf_export: true,
      monthly_report: true,
      marketing_drafts: true,
      instagram_draft_generation: true,
      google_business_profile_draft: true,
      ai_monthly_recommendations: true,
      image_caption_generation: false,
      demand_alerts: true,
      data_imports: true,
      csv_import: true,
      excel_import: true,
      column_mapping: true,
      sales_normalization: true,
      sales_reports: true,
      sales_ai_report: true,
      sales_anomaly_detection: true,
      demand_forecast: true,
      inventory_alerts: true,
      recommended_actions: true,
      growth_action_center: true,
      google_business_profile_drafts: true,
      instagram_drafts: true,
      review_reply_drafts: true,
      customer_message_drafts: true,
      pop_copy_drafts: true,
      line_message_drafts: true,
      growth_calendar: true,
      draft_approval_flow: true,
      draft_editing: true,
      channel_previews: true,
      external_channel_accounts: true,
      google_integrations: true,
      google_oauth_connection: true,
      google_business_profile_integration: true,
      gmail_draft_integration: true,
      google_calendar_integration: true,
      external_publish_jobs: true,
      google_sheets_import: false,
      pos_api_integrations: false,
      sales_export: false,
      sales_report_pdf: true,
      ai_sales_insights: false,
      billing: false,
      accounting: false
    },
    dashboardCards: [
      "store_profile_completion",
      "aio_score",
      "review_reply",
      "repair_service_visibility",
      "ai_post_generation"
    ],
    profileFields: [
      { key: "services", label: "対応サービス", type: "list", placeholder: "車検、オイル交換、タイヤ交換" },
      { key: "supported_makers", label: "対応メーカー", type: "list", placeholder: "トヨタ、ホンダ、日産" },
      { key: "has_replacement_car", label: "代車あり", type: "boolean" },
      { key: "emergency_support", label: "緊急対応可", type: "boolean" },
      { key: "reservation_method", label: "予約方法", type: "text", placeholder: "電話、Web、LINEなど" },
      { key: "brand_tone", label: "投稿トーン", type: "text", placeholder: "信頼感があり丁寧" }
    ]
  }
};

const serviceIndustryLabels = {
  beauty_salon: {
    name: "美容室・サロン",
    dashboardTitle: "サロン運営ダッシュボード",
    profileLabel: "サロンプロフィール",
    postLabel: "サロン投稿文生成",
    reviewLabel: "クチコミ返信",
    diagnosisLabel: "集客導線診断",
    businessLabels: {
      item: "メニュー・商品",
      product: "店販商品",
      part: "材料・備品",
      service: "施術メニュー",
      stock: "店販・材料在庫",
      customer: "顧客",
      estimate: "見積書",
      invoice: "請求書"
    },
    profileFields: [
      { key: "services", label: "施術メニュー", type: "list" as const, placeholder: "カット、カラー、トリートメント" },
      { key: "target_customer", label: "主なお客様", type: "text" as const, placeholder: "近隣女性、親子、メンズなど" },
      { key: "reservation_method", label: "予約方法", type: "text" as const, placeholder: "電話、LINE、予約サイトなど" },
      { key: "brand_tone", label: "投稿トーン", type: "text" as const, placeholder: "やわらかい、上品、親しみやすいなど" }
    ]
  },
  clinic_bodycare: { name: "クリニック・整体・治療院", dashboardTitle: "来院管理ダッシュボード" },
  restaurant: { name: "飲食店", dashboardTitle: "飲食店運営ダッシュボード" },
  retail: { name: "小売店", dashboardTitle: "小売店運営ダッシュボード" },
  real_estate: { name: "不動産", dashboardTitle: "不動産業務ダッシュボード" },
  school: { name: "スクール・教室", dashboardTitle: "教室運営ダッシュボード" },
  hotel_tourism: { name: "宿泊・観光", dashboardTitle: "宿泊・観光ダッシュボード" },
  professional_service: { name: "士業・専門サービス", dashboardTitle: "専門サービスダッシュボード" },
  construction_renovation: { name: "建設・リフォーム", dashboardTitle: "工事・リフォームダッシュボード" },
  other_service: { name: "その他店舗・サービス業", dashboardTitle: "店舗運営ダッシュボード" }
} satisfies Record<string, Partial<IndustryConfig>>;

Object.entries(serviceIndustryLabels).forEach(([key, overrides]) => {
  const industryOverrides = overrides as Partial<IndustryConfig>;
  industries[key] = {
    ...industries.general_store,
    ...industryOverrides,
    key: key as IndustryConfig["key"],
    businessLabels: {
      ...industries.general_store.businessLabels,
      ...industryOverrides.businessLabels
    },
    profileFields: industryOverrides.profileFields ?? industries.general_store.profileFields
  };
});

export function getIndustryConfig(key: string | null | undefined): IndustryConfig {
  return industries[key ?? ""] ?? industries.general_store;
}
