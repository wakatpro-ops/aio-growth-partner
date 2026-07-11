import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { listBusinessItems, listCustomers } from "@/lib/phase2/business-data";
import { listSalesTransactions } from "@/lib/phase4/sales-import-data";
import type { Store } from "@/types/domain";

export type StoreAiReadinessItem = {
  key: string;
  label: string;
  value: string;
  complete: boolean;
  weight: number;
  href: string;
  priority: "最優先" | "重要" | "おすすめ" | "あとでOK";
  badge: "AI精度UP" | "売上分析に必要" | "集客提案に必要" | "請求業務に必要" | "基礎情報";
  benefit: string;
  learned: string;
};

export type StoreAiReadiness = {
  score: number;
  stage: string;
  headline: string;
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

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function profileScoreReady(store: Store) {
  const profile = store.profile_data ?? {};
  return Boolean(
    hasText(store.name) &&
    hasText(store.phone) &&
    (hasText(store.website_url) || hasText(store.google_business_url)) &&
    (hasText(profile.brand_tone) || hasText(profile.services) || Array.isArray(profile.services))
  );
}

function stageFor(score: number) {
  if (score >= 100) return "AI改善提案が本格稼働";
  if (score >= 80) return "売上データを理解";
  if (score >= 60) return "顧客傾向を理解";
  if (score >= 40) return "商品・サービスを理解";
  return "基本情報を理解";
}

function headlineFor(score: number) {
  if (score >= 80) return "店舗データが集まり、次の一手を具体的に出せる状態です。";
  if (score >= 60) return "顧客と商品情報が入り、集客・請求・フォローの提案が具体化しています。";
  if (score >= 40) return "商品・サービス情報が入り、投稿文や見積作成に反映しやすくなっています。";
  return "まずは店舗の基本情報を整えると、AIが店舗らしさを理解し始めます。";
}

async function countRows(table: string, storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId);
  return count ?? 0;
}

async function hasInvoiceSettings(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("invoice_number_sequences")
    .select("store_id, qualified_invoice_issuer_name, qualified_invoice_registration_number")
    .eq("store_id", storeId)
    .maybeSingle();
  return Boolean(data?.store_id && (data.qualified_invoice_issuer_name || data.qualified_invoice_registration_number));
}

async function hasGoogleConnection(store: Store) {
  if (hasText(store.google_business_url)) return true;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;
  const [{ data: google }, { data: businessProfile }] = await Promise.all([
    supabase.from("google_oauth_connections").select("id").eq("store_id", store.id).eq("status", "connected").limit(1).maybeSingle(),
    supabase.from("google_business_profiles").select("id, status").eq("store_id", store.id).limit(1).maybeSingle()
  ]);
  return Boolean(google?.id || businessProfile?.id);
}

export async function getStoreAiReadiness(store: Store): Promise<StoreAiReadiness> {
  const [items, customers, salesTransactions, invoiceSettings, googleReady, invoices, dataImports, growthActions] = await Promise.all([
    listBusinessItems(store.id),
    listCustomers(store.id),
    listSalesTransactions(store.id),
    hasInvoiceSettings(store.id),
    hasGoogleConnection(store),
    countRows("invoices", store.id),
    countRows("data_import_jobs", store.id),
    countRows("growth_actions", store.id)
  ]);

  const itemCount = items.length;
  const customerCount = customers.length;
  const salesCount = salesTransactions.length;
  const profileReady = profileScoreReady(store);
  const snsReady = hasText(store.website_url) || hasText(store.google_business_url) || googleReady;

  const readinessItems: StoreAiReadinessItem[] = [
    {
      key: "profile",
      label: "店舗プロフィール",
      value: profileReady ? "店舗らしさを理解済み" : "店舗の強みを理解する準備中",
      complete: profileReady,
      weight: 20,
      href: `/stores/${store.id}`,
      priority: "最優先",
      badge: "基礎情報",
      benefit: "店舗プロフィールを整えると、AIが業態・強み・投稿トーンを理解できます。",
      learned: "店舗の基本情報と強みを、投稿・診断・提案の土台にできます。"
    },
    {
      key: "items",
      label: "商品・サービス",
      value: itemCount > 0 ? `${itemCount}件を理解` : "未登録",
      complete: itemCount > 0,
      weight: 20,
      href: `/stores/${store.id}/items`,
      priority: "最優先",
      badge: "AI精度UP",
      benefit: "商品・サービスを登録すると、AIが売れ筋提案や投稿文に反映できます。",
      learned: "商品・サービス情報を、見積作成と集客提案に使えるようになります。"
    },
    {
      key: "customers",
      label: "顧客情報",
      value: customerCount > 0 ? `${customerCount}件を理解` : "未登録",
      complete: customerCount > 0,
      weight: 15,
      href: `/stores/${store.id}/customers`,
      priority: "重要",
      badge: "集客提案に必要",
      benefit: "顧客情報が入ると、再来店案内やフォロー文の精度が上がります。",
      learned: "顧客傾向を見ながら、案内文やフォローの優先度を考えられます。"
    },
    {
      key: "invoice",
      label: "請求書設定",
      value: invoiceSettings ? "請求の土台を確認済み" : "確認待ち",
      complete: invoiceSettings,
      weight: 15,
      href: `/stores/${store.id}/settings/invoice`,
      priority: "重要",
      badge: "請求業務に必要",
      benefit: "請求書設定を確認すると、見積・請求・入金管理を安心して使えます。",
      learned: "請求書番号や事業者情報を、請求書PDFと入金管理に反映できます。"
    },
    {
      key: "sales",
      label: "売上データ",
      value: salesCount > 0 ? `${salesCount}件を理解` : "未取込",
      complete: salesCount > 0,
      weight: 20,
      href: `/stores/${store.id}/data-imports`,
      priority: "おすすめ",
      badge: "売上分析に必要",
      benefit: "売上データを取り込むと、月次レポートと改善提案が具体化します。",
      learned: "売上傾向をもとに、月次レポートや需要予測を強化できます。"
    },
    {
      key: "channels",
      label: "Google・SNS情報",
      value: snsReady ? "集客導線を確認済み" : "確認待ち",
      complete: snsReady,
      weight: 10,
      href: `/stores/${store.id}/settings/integrations`,
      priority: "おすすめ",
      badge: "集客提案に必要",
      benefit: "GoogleやSNS情報を追加すると、投稿案や口コミ対応に店舗らしさが出ます。",
      learned: "店舗の集客導線を、投稿文・案内文・Google支援に反映できます。"
    }
  ];

  const score = Math.min(100, readinessItems.reduce((sum, item) => sum + (item.complete ? item.weight : 0), 0));
  const nextBestActions = readinessItems.filter((item) => !item.complete).slice(0, 4);
  const completedItems = readinessItems.filter((item) => item.complete);

  return {
    score,
    stage: stageFor(score),
    headline: headlineFor(score),
    nextBestActions,
    completedItems,
    items: readinessItems,
    counts: {
      items: itemCount,
      customers: customerCount,
      salesTransactions: salesCount,
      invoices,
      dataImports,
      growthActions
    }
  };
}
