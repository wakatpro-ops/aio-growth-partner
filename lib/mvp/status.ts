import type { Store } from "@/types/domain";

export const demoStoreIds = new Set(["store-general-demo", "store-auto-demo"]);

export function isDemoStore(store: Pick<Store, "id" | "profile_data" | "organization_id">) {
  return demoStoreIds.has(store.id) || store.profile_data?.data_mode === "demo" || store.organization_id === "org-demo";
}

export function storeDataModeLabel(store: Pick<Store, "id" | "profile_data" | "organization_id">) {
  return isDemoStore(store) ? "デモ" : "本番";
}

export function storeDataModeDescription(store: Pick<Store, "id" | "profile_data" | "organization_id">) {
  return isDemoStore(store)
    ? "検証用のデモ店舗です。実店舗の請求・顧客・Google連携データとは分けて扱います。"
    : "実店舗データです。顧客、請求、入金、Google連携情報を本番運用として扱います。";
}

export type MvpPlanKey = "free" | "starter" | "pro";

export const mvpPlans: Record<MvpPlanKey, {
  name: string;
  monthlyPriceLabel: string;
  limits: {
    stores: number;
    aiGenerations: number;
    csvImports: number;
    google: string;
    pdf: string;
  };
}> = {
  free: {
    name: "Free",
    monthlyPriceLabel: "無料検証",
    limits: {
      stores: 1,
      aiGenerations: 20,
      csvImports: 3,
      google: "手動投稿支援のみ",
      pdf: "プレビュー"
    }
  },
  starter: {
    name: "Starter",
    monthlyPriceLabel: "小規模店舗向け",
    limits: {
      stores: 3,
      aiGenerations: 100,
      csvImports: 20,
      google: "Gmail / Calendar / GBP手動投稿支援",
      pdf: "見積・請求PDF"
    }
  },
  pro: {
    name: "Pro",
    monthlyPriceLabel: "複数店舗運用向け",
    limits: {
      stores: 10,
      aiGenerations: 500,
      csvImports: 100,
      google: "Gmail / Calendar / GBP手動投稿支援",
      pdf: "見積・請求・月次資料"
    }
  }
};

export function planForKey(value: string | null | undefined) {
  const key = value === "pro" || value === "free" || value === "starter" ? value : "starter";
  return { key, ...mvpPlans[key] };
}
