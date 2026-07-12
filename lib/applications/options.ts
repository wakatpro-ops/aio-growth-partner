import type { IndustryTypeKey } from "@/types/domain";

export const publicIndustryOptions: Array<{ key: IndustryTypeKey; label: string; internalIndustryType: IndustryTypeKey }> = [
  { key: "auto_repair", label: "自動車整備", internalIndustryType: "auto_repair" },
  { key: "beauty_salon", label: "美容室・サロン", internalIndustryType: "beauty_salon" },
  { key: "clinic_bodycare", label: "クリニック・整体・治療院", internalIndustryType: "clinic_bodycare" },
  { key: "restaurant", label: "飲食店", internalIndustryType: "restaurant" },
  { key: "retail", label: "小売店", internalIndustryType: "retail" },
  { key: "real_estate", label: "不動産", internalIndustryType: "real_estate" },
  { key: "school", label: "スクール・教室", internalIndustryType: "school" },
  { key: "hotel_tourism", label: "宿泊・観光", internalIndustryType: "hotel_tourism" },
  { key: "professional_service", label: "士業・専門サービス", internalIndustryType: "professional_service" },
  { key: "construction_renovation", label: "建設・リフォーム", internalIndustryType: "construction_renovation" },
  { key: "other_service", label: "その他店舗・サービス業", internalIndustryType: "other_service" }
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

export function normalizeIndustryTypeKey(key: string | null | undefined): IndustryTypeKey {
  return publicIndustryOptions.find((option) => option.key === key || option.internalIndustryType === key)?.internalIndustryType ?? "general_store";
}
