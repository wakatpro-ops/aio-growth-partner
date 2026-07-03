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
    defaultFeatureFlags: {
      ai_post_generation: true,
      ai_review_reply: true,
      aio_diagnosis: true,
      instagram_post: true,
      repair_services: false,
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
    defaultFeatureFlags: {
      ai_post_generation: true,
      ai_review_reply: true,
      aio_diagnosis: true,
      instagram_post: false,
      repair_services: true,
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

export function getIndustryConfig(key: string | null | undefined): IndustryConfig {
  return industries[key ?? ""] ?? industries.general_store;
}
