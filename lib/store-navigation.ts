import { getIndustryConfig } from "@/config/industries";

const productHubLabels: Record<string, string> = {
  auto_repair: "部品・在庫",
  beauty_salon: "メニュー・店販",
  clinic_bodycare: "施術・備品",
  restaurant: "メニュー・仕入",
  retail: "商品・在庫",
  real_estate: "サービス・資料",
  school: "講座・教材",
  hotel_tourism: "プラン・備品",
  professional_service: "サービス・資料",
  construction_renovation: "サービス・資材",
  other_service: "商品・サービス",
  general_store: "商品・在庫"
};

export function getStoreNavigationLabels(industryTypeKey: string | null | undefined) {
  const industry = getIndustryConfig(industryTypeKey);
  return {
    customer: industry.businessLabels.customer,
    product: productHubLabels[industry.key] ?? "商品・在庫"
  };
}
