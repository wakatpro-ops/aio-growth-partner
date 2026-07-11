export const publicIndustryOptions = [
  { key: "auto_repair", label: "自動車整備", internalIndustryType: "auto_repair" },
  { key: "beauty_salon", label: "美容室・サロン", internalIndustryType: "general_store" },
  { key: "clinic_bodycare", label: "クリニック・整体・治療院", internalIndustryType: "general_store" },
  { key: "restaurant", label: "飲食店", internalIndustryType: "general_store" },
  { key: "retail", label: "小売店", internalIndustryType: "general_store" },
  { key: "real_estate", label: "不動産", internalIndustryType: "general_store" },
  { key: "school", label: "スクール・教室", internalIndustryType: "general_store" },
  { key: "hotel_tourism", label: "宿泊・観光", internalIndustryType: "general_store" },
  { key: "professional_service", label: "士業・専門サービス", internalIndustryType: "general_store" },
  { key: "construction_renovation", label: "建設・リフォーム", internalIndustryType: "general_store" },
  { key: "other_service", label: "その他店舗・サービス業", internalIndustryType: "general_store" }
] as const;

export const currentToolOptions = [
  "レジ",
  "会計ソフト",
  "予約システム",
  "SNS",
  "Googleビジネスプロフィール",
  "顧客管理",
  "その他"
] as const;

export const improvementGoalOptions = [
  "集客",
  "請求・入金管理",
  "売上分析",
  "SNS投稿",
  "Google口コミ対応",
  "顧客フォロー",
  "在庫管理",
  "スタッフ業務効率化",
  "補助金・デジタル化対応"
] as const;

export function findPublicIndustryOption(key: string) {
  return publicIndustryOptions.find((option) => option.key === key) ?? publicIndustryOptions[publicIndustryOptions.length - 1];
}
