import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isDemoStore } from "@/lib/mvp/status";
import { listStores } from "@/lib/stores";
import type { Store } from "@/types/domain";

type AdminRow = Record<string, string | number | boolean | null | string[] | Record<string, unknown>>;

export const betaReadyFeatures = [
  "店舗管理",
  "顧客管理",
  "商品/サービス管理",
  "見積書",
  "請求書",
  "PDF出力",
  "入金管理",
  "Stripe決済URLの手動登録",
  "freee向けCSV出力",
  "売上CSV/Excel取込",
  "AI月次レポート",
  "AI集客アクション",
  "Gmail下書き作成",
  "Googleカレンダー予定作成",
  "SNS手動投稿支援"
];

export const betaManualOrPlannedFeatures = [
  "AIO利用料の自動Stripe課金",
  "Stripe Connect完全OAuth",
  "Stripe Webhook自動入金反映",
  "freee API自動送信",
  "Google Business Profile API自動投稿",
  "Instagram API自動投稿"
];

export const betaCautions = [
  "Google Business Profile APIはGoogle側の審査やquotaの都合により、現在は手動投稿支援モードです。",
  "Stripeは現時点では店舗ごとの決済URL手動登録モードです。",
  "freeeは現時点ではCSV出力モードです。",
  "AI生成文は必ず人間が確認してから使用してください。",
  "補助金やITツール登録の採択・登録を保証するものではありません。"
];

export const betaOnboardingSteps = [
  { label: "店舗作成", detail: "実店舗を作成し、デモ店舗と分けて管理します。", href: "/stores/new" },
  { label: "業態選択", detail: "汎用店舗または自動車修理を選び、文言と機能を切り替えます。", href: "/stores/new" },
  { label: "請求書設定", detail: "登録番号、発行事業者名、請求書番号を確認します。", href: (storeId: string) => `/stores/${storeId}/settings/invoice` },
  { label: "顧客登録", detail: "顧客または顧客・車両情報を登録します。", href: (storeId: string) => `/stores/${storeId}/customers` },
  { label: "商品/サービス登録", detail: "商品、部品、サービスを登録します。", href: (storeId: string) => `/stores/${storeId}/items` },
  { label: "見積/請求作成", detail: "見積書、請求書、PDF、入金まで確認します。", href: (storeId: string) => `/stores/${storeId}/invoices` },
  { label: "Stripe手動連携", detail: "店舗側Stripe情報と決済URL手動登録を確認します。", href: (storeId: string) => `/stores/${storeId}/settings/payments/stripe` },
  { label: "freee向けCSV出力", detail: "freee事業所情報とCSV出力を確認します。", href: (storeId: string) => `/stores/${storeId}/settings/accounting/freee` },
  { label: "Google連携", detail: "Gmail、Googleカレンダー、GBP手動投稿支援を確認します。", href: (storeId: string) => `/stores/${storeId}/settings/google` },
  { label: "SNS手動投稿支援", detail: "SNS向け下書きとコピー運用を確認します。", href: (storeId: string) => `/stores/${storeId}/growth-actions` }
];

export const betaChecklistLabels = [
  "店舗名が設定されている",
  "業態が設定されている",
  "請求書設定が入っている",
  "顧客が1件以上ある",
  "商品/サービスが1件以上ある",
  "見積書作成確認済み",
  "請求書作成確認済み",
  "PDF出力確認済み",
  "入金登録確認済み",
  "freee向けCSV出力確認済み",
  "Gmail接続確認済み",
  "Googleカレンダー接続確認済み",
  "Google Business Profileは手動投稿支援モードであることを説明済み",
  "Stripeは手動URL登録モードであることを説明済み"
];

async function countRows(table: string, storeId?: string, filter?: { column: string; value: string }) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (storeId) query = query.eq("store_id", storeId);
  if (filter) query = query.eq(filter.column, filter.value);
  const { count } = await query;
  return count ?? 0;
}

async function maybeRows(table: string, select = "*", limit = 20) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const { data } = await supabase.from(table).select(select).order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as AdminRow[];
}

async function maybeCount(table: string, filter?: { column: string; value: string }) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count } = await query;
  return count ?? 0;
}

export async function getStoreBetaChecklist(store: Store) {
  const storeId = store.id;
  const [
    customers,
    items,
    estimates,
    invoices,
    payments,
    pdfIssues,
    freeeExports,
    gmailConnections,
    calendarSettings,
    stripeIntegrations
  ] = await Promise.all([
    countRows("customers", storeId),
    countRows("items", storeId),
    countRows("estimates", storeId),
    countRows("invoices", storeId),
    countRows("payments", storeId),
    countRows("invoice_pdf_issues", storeId),
    countRows("accounting_export_jobs", storeId, { column: "provider", value: "freee" }),
    countRows("google_oauth_connections", storeId, { column: "status", value: "connected" }),
    countRows("google_calendar_settings", storeId),
    countRows("store_payment_integrations", storeId, { column: "provider", value: "stripe" })
  ]);

  return [
    { label: "店舗名が設定されている", done: Boolean(store.name) },
    { label: "業態が設定されている", done: Boolean(store.industry_type_key) },
    { label: "請求書設定が入っている", done: invoices > 0 || Boolean(store.name) },
    { label: "顧客が1件以上ある", done: customers > 0 },
    { label: "商品/サービスが1件以上ある", done: items > 0 },
    { label: "見積書作成確認済み", done: estimates > 0 },
    { label: "請求書作成確認済み", done: invoices > 0 },
    { label: "PDF出力確認済み", done: pdfIssues > 0 },
    { label: "入金登録確認済み", done: payments > 0 },
    { label: "freee向けCSV出力確認済み", done: freeeExports > 0 },
    { label: "Gmail接続確認済み", done: gmailConnections > 0 },
    { label: "Googleカレンダー接続確認済み", done: calendarSettings > 0 || gmailConnections > 0 },
    { label: "Google Business Profileは手動投稿支援モードであることを説明済み", done: true },
    { label: "Stripeは手動URL登録モードであることを説明済み", done: stripeIntegrations > 0 }
  ];
}

export async function getBetaAdminSummary() {
  const stores = await listStores();
  const productionStores = stores.filter((store) => !isDemoStore(store));
  const demoStores = stores.filter((store) => isDemoStore(store));
  const supabase = createSupabaseAdminClient();

  const [
    organizations,
    userProfiles,
    aiLogs,
    aiErrors,
    imports,
    importErrors,
    externalErrors,
    auditLogs,
    paymentIntegrations,
    accountingIntegrations,
    googleConnections
  ] = await Promise.all([
    maybeCount("organizations"),
    maybeCount("user_profiles"),
    maybeCount("ai_generation_logs"),
    maybeCount("ai_generation_logs", { column: "status", value: "error" }),
    maybeCount("data_import_jobs"),
    maybeCount("import_error_rows"),
    maybeCount("external_integration_logs", { column: "status", value: "error" }),
    maybeRows("audit_logs", "id, store_id, action_type, target_type, message, created_at", 12),
    supabase ? supabase.from("store_payment_integrations").select("store_id, provider, status, external_account_id, account_name").limit(100) : Promise.resolve({ data: [] }),
    supabase ? supabase.from("store_accounting_integrations").select("store_id, provider, status, external_company_id, office_name").limit(100) : Promise.resolve({ data: [] }),
    supabase ? supabase.from("google_oauth_connections").select("store_id, email, status, scopes, connected_at, expires_at").limit(100) : Promise.resolve({ data: [] })
  ]);

  return {
    stores,
    productionStores,
    demoStores,
    counts: {
      organizations,
      userProfiles,
      stores: stores.length,
      productionStores: productionStores.length,
      demoStores: demoStores.length,
      aiLogs,
      aiErrors,
      imports,
      importErrors,
      externalErrors
    },
    auditLogs,
    paymentIntegrations: (paymentIntegrations.data ?? []) as unknown as AdminRow[],
    accountingIntegrations: (accountingIntegrations.data ?? []) as unknown as AdminRow[],
    googleConnections: (googleConnections.data ?? []) as unknown as AdminRow[]
  };
}
