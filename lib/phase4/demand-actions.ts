import "server-only";
import { generateWithAi } from "@/lib/openai/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type { DemandForecast, InventoryAlert, RecommendedAction } from "@/types/phase4";

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
} as const;

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type SalesItemRow = {
  item_name: string;
  category_name: string | null;
  quantity: number;
  total_amount: number;
  sales_transaction?: { business_date: string } | null;
};
type SalesTransactionWithItems = {
  business_date: string;
  items?: Array<{
    item_name: string;
    category_name: string | null;
    quantity: number;
    total_amount: number;
  }>;
};
type StockRow = {
  quantity: number;
  reorder_point: number;
  item?: { name: string; item_type: string | null; unit: string | null } | null;
};

function persistenceFor(store: Store) {
  const demo = demoPersistence[store.id as keyof typeof demoPersistence];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id
  };
}

async function ensureDemoPersistence(supabase: SupabaseClient, store: Store) {
  const resolved = persistenceFor(store);
  if (!demoPersistence[store.id as keyof typeof demoPersistence]) return resolved;

  await supabase.from("organizations").upsert({
    id: resolved.organizationId,
    name: "AIOデモ組織",
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: resolved.storeId,
    organization_id: resolved.organizationId,
    industry_type_key: store.industry_type_key,
    name: store.name,
    address: store.address,
    phone: store.phone,
    status: "active",
    feature_flags: {
      ...(store.feature_flags ?? {}),
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
      external_publish_jobs: true
    },
    profile_data: store.profile_data ?? {},
    updated_at: new Date().toISOString()
  });

  return resolved;
}

function nextMonthFromNow() {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function previousMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function currentMonthForTarget(targetMonth: string) {
  return previousMonth(targetMonth);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function bucketItems(rows: SalesItemRow[], month: string) {
  const bucket = new Map<string, { item_name: string; amount: number; quantity: number; count: number }>();
  for (const row of rows) {
    const date = row.sales_transaction?.business_date ?? "";
    if (!date.startsWith(month)) continue;
    const name = row.item_name || "未設定";
    const current = bucket.get(name) ?? { item_name: name, amount: 0, quantity: 0, count: 0 };
    current.amount += Number(row.total_amount ?? 0);
    current.quantity += Number(row.quantity ?? 0);
    current.count += 1;
    bucket.set(name, current);
  }
  return Array.from(bucket.values()).sort((a, b) => b.amount - a.amount);
}

function industryWords(store: Store) {
  if (store.industry_type_key === "auto_repair") {
    return {
      growth: ["季節点検", "オイル交換", "タイヤ交換", "車検前点検", "部品交換"],
      stock: "部品在庫",
      customer: "リピート来店"
    };
  }
  return {
    growth: ["おすすめ商品", "人気サービス", "来店促進", "口コミ促進"],
    stock: "商品在庫",
    customer: "既存顧客"
  };
}

async function fetchSalesItems(supabase: SupabaseClient, storeId: string, targetMonth: string) {
  const currentMonth = currentMonthForTarget(targetMonth);
  const prevMonth = previousMonth(currentMonth);
  const start = `${prevMonth}-01`;
  const endDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const end = endDate.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("sales_transactions")
    .select("business_date, items:sales_transaction_items(item_name, category_name, quantity, total_amount)")
    .eq("store_id", storeId)
    .gte("business_date", start)
    .lt("business_date", end);
  if (error) throw new Error(`売上明細を取得できませんでした: ${error.message}`);
  const rows = ((data ?? []) as SalesTransactionWithItems[]).flatMap((transaction) =>
    (transaction.items ?? []).map((item) => ({
      ...item,
      sales_transaction: { business_date: transaction.business_date }
    }))
  );
  return { rows, currentMonth, prevMonth };
}

async function fetchStocks(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase
    .from("inventory_stocks")
    .select("quantity, reorder_point, item:items(name, item_type, unit)")
    .eq("store_id", storeId);
  if (error) throw new Error(`在庫を取得できませんでした: ${error.message}`);
  return (data ?? []) as unknown as StockRow[];
}

function buildForecasts(store: Store, organizationId: string, storeId: string, targetMonth: string, currentItems: ReturnType<typeof bucketItems>, previousItems: ReturnType<typeof bucketItems>) {
  const previousMap = new Map(previousItems.map((item) => [item.item_name, item]));
  return currentItems.slice(0, 12).map((item) => {
    const previous = previousMap.get(item.item_name);
    const change = percentChange(item.amount, previous?.amount ?? 0);
    const forecastType = change >= 25 ? "growth" : change <= -25 ? "decline" : "stable";
    const multiplier = forecastType === "growth" ? 1.2 : forecastType === "decline" ? 0.85 : 1;
    const confidence = Math.min(0.9, Math.max(0.45, 0.55 + Math.min(Math.abs(change), 60) / 200));
    const words = industryWords(store);
    return {
      organization_id: organizationId,
      store_id: storeId,
      target_month: targetMonth,
      item_name: item.item_name,
      forecast_type: forecastType,
      current_value: item.amount,
      previous_value: previous?.amount ?? 0,
      predicted_value: Math.round(item.amount * multiplier),
      confidence,
      reason: forecastType === "growth"
        ? `${item.item_name} は直近で伸びています。${words.growth.join("、")}の販促テーマにできます。`
        : forecastType === "decline"
          ? `${item.item_name} は前月より落ちています。露出や案内内容を見直す候補です。`
          : `${item.item_name} は安定傾向です。定番メニューとして継続確認します。`,
      status: "active"
    };
  });
}

function buildInventoryAlerts(store: Store, organizationId: string, storeId: string, targetMonth: string, forecasts: Array<Record<string, unknown>>, stocks: StockRow[]) {
  const forecastMap = new Map(forecasts.map((forecast) => [String(forecast.item_name), forecast]));
  const alerts = [];
  for (const stock of stocks) {
    const name = stock.item?.name ?? "未設定";
    const forecast = forecastMap.get(name);
    const quantity = Number(stock.quantity ?? 0);
    const reorderPoint = Number(stock.reorder_point ?? 0);
    const salesQuantity = Number(forecast?.current_value ?? 0);
    const isGrowth = forecast?.forecast_type === "growth";
    const words = industryWords(store);
    if (quantity <= reorderPoint || (isGrowth && quantity <= reorderPoint * 2)) {
      alerts.push({
        organization_id: organizationId,
        store_id: storeId,
        target_month: targetMonth,
        item_name: name,
        alert_type: quantity <= reorderPoint ? "stockout_risk" : "reorder_candidate",
        current_stock: quantity,
        reorder_point: reorderPoint,
        recent_sales_quantity: salesQuantity,
        severity: quantity <= reorderPoint ? "high" : "medium",
        reason: `${name} は需要が見込まれる一方、${words.stock}が少なめです。発注候補として確認してください。`,
        status: "open"
      });
    } else if (!forecast && quantity > Math.max(reorderPoint * 4, 10)) {
      alerts.push({
        organization_id: organizationId,
        store_id: storeId,
        target_month: targetMonth,
        item_name: name,
        alert_type: "overstock_risk",
        current_stock: quantity,
        reorder_point: reorderPoint,
        recent_sales_quantity: 0,
        severity: "low",
        reason: `${name} は在庫がありますが、直近売上との紐づきが弱い状態です。保管量や販促利用を確認してください。`,
        status: "open"
      });
    }
  }
  return alerts;
}

function fallbackActions(store: Store, organizationId: string, storeId: string, targetMonth: string, forecasts: Array<Record<string, unknown>>, alerts: Array<Record<string, unknown>>) {
  const words = industryWords(store);
  const top = String(forecasts[0]?.item_name ?? words.growth[0]);
  const inventory = String(alerts[0]?.item_name ?? top);
  return [
    {
      organization_id: organizationId,
      store_id: storeId,
      target_month: targetMonth,
      action_type: "instagram",
      title: store.industry_type_key === "auto_repair" ? "季節点検の投稿" : "おすすめ紹介の投稿",
      body: store.industry_type_key === "auto_repair" ? `${top}に関連する点検・整備の重要性を、写真付きで分かりやすく投稿します。` : `${top}を来店理由として紹介し、問い合わせや来店につなげます。`,
      item_name: top,
      priority: "high",
      reason: "需要予測で伸びる可能性があるため、早めに認知を作ります。",
      status: "open"
    },
    {
      organization_id: organizationId,
      store_id: storeId,
      target_month: targetMonth,
      action_type: "google_business_profile",
      title: store.industry_type_key === "auto_repair" ? "車検前点検の案内" : "サービス紹介のGoogle投稿",
      body: store.industry_type_key === "auto_repair" ? "地域名、車検、点検、予約導線を自然に含めてGoogle投稿を作成します。" : "検索されやすい商品名・サービス名を含めてGoogle投稿を作成します。",
      item_name: top,
      priority: "medium",
      reason: "検索経由の相談を増やすためです。",
      status: "open"
    },
    {
      organization_id: organizationId,
      store_id: storeId,
      target_month: targetMonth,
      action_type: "store_pop",
      title: store.industry_type_key === "auto_repair" ? "点検おすすめPOP" : "おすすめPOP",
      body: store.industry_type_key === "auto_repair" ? "安全運転のため、気になる症状は早めに点検を。" : "今月のおすすめ。気になる方はスタッフまで。",
      item_name: top,
      priority: "medium",
      reason: "店頭で気づきを作り、相談につなげます。",
      status: "open"
    },
    {
      organization_id: organizationId,
      store_id: storeId,
      target_month: targetMonth,
      action_type: alerts.length > 0 ? "inventory_order" : "customer_message",
      title: alerts.length > 0 ? `${inventory}の在庫確認` : `${words.customer}への案内`,
      body: alerts.length > 0 ? `${inventory}の現在庫と発注目安を確認し、必要なら早めに発注します。` : `過去利用者へ${top}の案内文を送ります。`,
      item_name: inventory,
      priority: alerts.length > 0 ? "high" : "medium",
      reason: alerts.length > 0 ? "在庫切れリスクを下げるためです。" : "リピート利用を増やすためです。",
      status: "open"
    }
  ];
}

function normalizeAiActions(value: unknown, fallback: ReturnType<typeof fallbackActions>) {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const raw = Array.isArray(input.actions) ? input.actions : [];
  if (raw.length === 0) return fallback;
  return raw.slice(0, 8).map((row, index) => {
    const item = typeof row === "object" && row !== null ? row as Record<string, unknown> : {};
    return {
      ...fallback[index % fallback.length],
      action_type: String(item.action_type ?? fallback[index % fallback.length].action_type),
      title: String(item.title ?? fallback[index % fallback.length].title),
      body: String(item.body ?? fallback[index % fallback.length].body),
      item_name: item.item_name ? String(item.item_name) : fallback[index % fallback.length].item_name,
      priority: String(item.priority ?? fallback[index % fallback.length].priority),
      reason: String(item.reason ?? fallback[index % fallback.length].reason)
    };
  });
}

export async function generateDemandActionPlan(storeId: string, targetMonth = nextMonthFromNow()) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const [{ rows, currentMonth, prevMonth }, stocks] = await Promise.all([
    fetchSalesItems(supabase, resolved.storeId, targetMonth),
    fetchStocks(supabase, resolved.storeId)
  ]);
  const forecasts = buildForecasts(
    store,
    resolved.organizationId,
    resolved.storeId,
    targetMonth,
    bucketItems(rows, currentMonth),
    bucketItems(rows, prevMonth)
  );
  const alerts = buildInventoryAlerts(store, resolved.organizationId, resolved.storeId, targetMonth, forecasts, stocks);
  const fallback = fallbackActions(store, resolved.organizationId, resolved.storeId, targetMonth, forecasts, alerts);
  const ai = await generateWithAi({
    store: { ...store, id: resolved.storeId, organization_id: resolved.organizationId },
    templateKey: "demand_action_recommendations",
    input: {
      target_month: targetMonth,
      forecasts,
      alerts,
      stock_count: stocks.length,
      expected_output: { actions: ["instagram", "google_business_profile", "store_pop", "customer_message", "inventory_order"] }
    }
  });
  const actions = normalizeAiActions(ai.output, fallback);

  await Promise.all([
    supabase.from("demand_forecasts").delete().eq("store_id", resolved.storeId).eq("target_month", targetMonth),
    supabase.from("inventory_alerts").delete().eq("store_id", resolved.storeId).eq("target_month", targetMonth),
    supabase.from("recommended_actions").delete().eq("store_id", resolved.storeId).eq("target_month", targetMonth)
  ]);
  if (forecasts.length > 0) {
    const { error } = await supabase.from("demand_forecasts").insert(forecasts);
    if (error) throw new Error(`需要予測を保存できませんでした: ${error.message}`);
  }
  if (alerts.length > 0) {
    const { error } = await supabase.from("inventory_alerts").insert(alerts);
    if (error) throw new Error(`在庫アラートを保存できませんでした: ${error.message}`);
  }
  if (actions.length > 0) {
    const { error } = await supabase.from("recommended_actions").insert(actions);
    if (error) throw new Error(`次アクションを保存できませんでした: ${error.message}`);
  }
  return targetMonth;
}

export async function listDemandForecasts(storeId: string): Promise<DemandForecast[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase.from("demand_forecasts").select("*").eq("store_id", resolved.storeId).order("target_month", { ascending: false }).order("predicted_value", { ascending: false });
  return (data ?? []) as DemandForecast[];
}

export async function listInventoryAlerts(storeId: string): Promise<InventoryAlert[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase.from("inventory_alerts").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false });
  return (data ?? []) as InventoryAlert[];
}

export async function listRecommendedActions(storeId: string): Promise<RecommendedAction[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase.from("recommended_actions").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false });
  return (data ?? []) as RecommendedAction[];
}
