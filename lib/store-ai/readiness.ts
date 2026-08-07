import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/types/domain";

export type StoreAiReadinessItem = {
  key: string;
  label: string;
  value: string;
  complete: boolean;
  weight: number;
  href: string;
  priority: "最優先" | "重要" | "おすすめ" | "あとでOK";
  badge: "AIおすすめの土台" | "店舗の特徴" | "地域情報" | "信頼情報" | "外部への反映";
  benefit: string;
  learned: string;
};

export type StoreAiReadiness = {
  score: number;
  stage: string;
  headline: string;
  targetQuestions: string[];
  publicationStatus: {
    googleConnected: boolean;
    contentCreated: boolean;
  };
  nextBestActions: StoreAiReadinessItem[];
  completedItems: StoreAiReadinessItem[];
  items: StoreAiReadinessItem[];
  counts: {
    items: number;
    customers: number;
    salesTransactions: number;
    invoices: number;
    dataImports: number;
    growthActions: number;
  };
};

const demoStorePersistenceIds: Record<string, string> = {
  "store-general-demo": "00000000-0000-4000-8000-000000000101",
  "store-auto-demo": "00000000-0000-4000-8000-000000000102"
};

function readStoreId(storeId: string) {
  return demoStorePersistenceIds[storeId] ?? storeId;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasList(value: unknown) {
  return Array.isArray(value) ? value.some(hasText) : hasText(value);
}

function stageFor(score: number) {
  if (score >= 85) return "公開・再確認へ進めます";
  if (score >= 60) return "おすすめ理由が伝わる準備中";
  if (score >= 35) return "店舗の特徴を整理中";
  return "基本情報から確認中";
}

function headlineFor(score: number) {
  if (score >= 85) return "AIが参照しやすい店舗情報の土台が整っています。外部への反映状況を確認しましょう。";
  if (score >= 60) return "店舗の特徴が見えてきました。次の1件を整えると、おすすめ理由がさらに明確になります。";
  if (score >= 35) return "まずは店舗の特徴と提供サービスを、具体的な言葉にしていきましょう。";
  return "最初の改善は1つだけです。店舗の基本情報から一緒に整えます。";
}

function targetQuestionsFor(store: Store) {
  const profile = store.profile_data ?? {};
  const area = store.address?.split(/[都道府県市区町村]/).filter(Boolean).at(-1)?.trim() || "この地域";
  const serviceValue = profile.services;
  const service = Array.isArray(serviceValue)
    ? serviceValue.find(hasText)
    : hasText(serviceValue) ? serviceValue : null;
  const category = service ? String(service) : store.industry_type_key === "beauty_salon" ? "サロン" : "お店";

  return [
    `${area}で${category}を探すなら、どこがおすすめ？`,
    `${area}で安心して相談できる${category}は？`,
    `${store.name}はどんな人におすすめ？`
  ];
}

async function countRows(table: string, storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("store_id", readStoreId(storeId));
  if (["items", "customers", "invoices", "data_import_jobs", "growth_actions"].includes(table)) {
    query = query.is("archived_at", null);
  }
  const { count } = await query;
  return count ?? 0;
}

async function hasGoogleConnection(store: Store) {
  if (hasText(store.google_business_url)) return true;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const [{ data: google }, { data: businessProfile }] = await Promise.all([
    supabase.from("google_oauth_connections").select("id").eq("store_id", readStoreId(store.id)).eq("status", "connected").limit(1).maybeSingle(),
    supabase.from("google_business_profiles").select("id, status").eq("store_id", readStoreId(store.id)).limit(1).maybeSingle()
  ]);
  return Boolean(google?.id || businessProfile?.id);
}

export async function getStoreAiReadiness(store: Store): Promise<StoreAiReadiness> {
  const [itemCount, customerCount, salesCount, googleReady, invoices, dataImports, growthActions] = await Promise.all([
    countRows("items", store.id),
    countRows("customers", store.id),
    countRows("sales_transactions", store.id),
    hasGoogleConnection(store),
    countRows("invoices", store.id),
    countRows("data_import_jobs", store.id),
    countRows("growth_actions", store.id)
  ]);

  const profile = store.profile_data ?? {};
  const identityReady = hasText(store.name) && hasText(store.address) && hasText(store.phone);
  const offeringReady = hasText(store.description) || hasList(profile.services) || itemCount > 0;
  const localReady = hasText(store.address) && (hasText(profile.strengths) || hasText(profile.target_customer));
  const trustReady = hasText(store.website_url) || hasText(store.google_business_url);
  const publishReady = googleReady || growthActions > 0;
  const profileHref = `/stores/${store.id}/settings/profile`;

  const readinessItems: StoreAiReadinessItem[] = [
    {
      key: "identity",
      label: "店舗の基本情報",
      value: identityReady ? "名称・地域・連絡先を確認済み" : "不足している項目があります",
      complete: identityReady,
      weight: 20,
      href: profileHref,
      priority: "最優先",
      badge: "AIおすすめの土台",
      benefit: "店舗名・住所・連絡先を揃えると、同じ店舗の情報だと判断されやすくなります。",
      learned: "店舗の名称、場所、連絡方法を1つの店舗情報として扱えます。"
    },
    {
      key: "offering",
      label: "サービスとおすすめ理由",
      value: offeringReady ? "提供内容を確認済み" : "具体的な説明が必要です",
      complete: offeringReady,
      weight: 25,
      href: profileHref,
      priority: "最優先",
      badge: "店舗の特徴",
      benefit: "何ができて、誰に向いているかを書くと、質問に対するおすすめ理由が明確になります。",
      learned: "提供サービスと、利用者にとっての価値を説明できます。"
    },
    {
      key: "local",
      label: "地域と得意なお客様",
      value: localReady ? "地域性を確認済み" : "地域・対象のお客様を追加できます",
      complete: localReady,
      weight: 20,
      href: profileHref,
      priority: "重要",
      badge: "地域情報",
      benefit: "地域名と得意なお客様を具体化すると、地域を含む質問との結び付きが強くなります。",
      learned: "どの地域の、どんなお客様に合う店舗かを説明できます。"
    },
    {
      key: "trust",
      label: "公式情報と信頼材料",
      value: trustReady ? "公式URLを確認済み" : "公式サイトまたはGoogle情報が必要です",
      complete: trustReady,
      weight: 20,
      href: `/stores/${store.id}/settings/google`,
      priority: "重要",
      badge: "信頼情報",
      benefit: "公式サイトやGoogle情報を結び付けると、内容を確認できる根拠が増えます。",
      learned: "店舗情報を確認できる公式な参照先を示せます。"
    },
    {
      key: "publish",
      label: "外部への反映",
      value: publishReady ? "反映先または下書きあり" : "まだ外部には反映されていません",
      complete: publishReady,
      weight: 15,
      href: `/stores/${store.id}/acquisition`,
      priority: "おすすめ",
      badge: "外部への反映",
      benefit: "整えた内容をGoogle・Web・SNSに反映して、外部から参照できる状態にします。",
      learned: "改善内容を外部へ届ける準備状況を追跡できます。"
    }
  ];

  const score = Math.min(100, readinessItems.reduce((sum, item) => sum + (item.complete ? item.weight : 0), 0));
  const nextBestActions = readinessItems.filter((item) => !item.complete).slice(0, 3);
  const completedItems = readinessItems.filter((item) => item.complete);

  return {
    score,
    stage: stageFor(score),
    headline: headlineFor(score),
    targetQuestions: targetQuestionsFor(store),
    publicationStatus: { googleConnected: googleReady, contentCreated: growthActions > 0 },
    nextBestActions,
    completedItems,
    items: readinessItems,
    counts: { items: itemCount, customers: customerCount, salesTransactions: salesCount, invoices, dataImports, growthActions }
  };
}
