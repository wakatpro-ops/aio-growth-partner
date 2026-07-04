import type { Store } from "@/types/domain";

export const demoStores: Store[] = [
  {
    id: "store-general-demo",
    organization_id: "org-demo",
    industry_type_key: "general_store",
    name: "AIOサンプル店舗",
    address: "東京都渋谷区",
    phone: "03-0000-0000",
    website_url: "https://example.com",
    google_business_url: "https://example.com/google-business",
    description: "地域のお客様に向けた汎用店舗のサンプルです。",
    profile_data: {
      target_customer: "近隣住民と会社員",
      brand_tone: "親しみやすい",
      opening_hours: "10:00-19:00",
      strengths: "丁寧な接客と通いやすい価格"
    },
    feature_flags: {
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
      google_sheets_import: false,
      pos_api_integrations: false,
      sales_export: false,
      sales_report_pdf: false,
      ai_sales_insights: false
    },
    status: "active"
  },
  {
    id: "store-auto-demo",
    organization_id: "org-demo",
    industry_type_key: "auto_repair",
    name: "AIOオート整備",
    address: "神奈川県横浜市",
    phone: "045-000-0000",
    website_url: "https://example.com/auto",
    google_business_url: "https://example.com/auto-google-business",
    description: "車検、点検、修理相談に対応する地域密着の整備工場です。",
    profile_data: {
      services: ["車検", "オイル交換", "タイヤ交換"],
      supported_makers: ["トヨタ", "ホンダ", "日産"],
      has_replacement_car: true,
      emergency_support: false,
      reservation_method: "電話とWeb",
      brand_tone: "信頼感があり丁寧"
    },
    feature_flags: {
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
      google_sheets_import: false,
      pos_api_integrations: false,
      sales_export: false,
      sales_report_pdf: false,
      ai_sales_insights: false
    },
    status: "active"
  }
];

export function getDemoStore(storeId?: string): Store {
  return demoStores.find((store) => store.id === storeId) ?? demoStores[0];
}
