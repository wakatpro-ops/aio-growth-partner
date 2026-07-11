import "server-only";
import { generateWithAi } from "@/lib/openai/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type { SalesAiReport, SalesAiReportOutput, SalesAnalysisSummary, SalesAnomalyFlag } from "@/types/phase4";

const promptVersion = "phase-4-b-v1";

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
type TransactionRow = {
  id: string;
  organization_id: string;
  store_id: string;
  business_date: string;
  transaction_date: string;
  gross_amount: number;
  payment_method: string | null;
  source_row_hash: string;
  external_transaction_id: string | null;
  items?: Array<{
    item_name: string;
    category_name: string | null;
    quantity: number;
    unit_price: number;
    total_amount: number;
  }>;
};

function persistenceFor(store: Store) {
  const demo = demoPersistence[store.id as keyof typeof demoPersistence];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id
  };
}

function previousMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function formatWeekday(date: string) {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[new Date(`${date}T00:00:00.000Z`).getUTCDay()] ?? "不明";
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

function sumTransactions(rows: TransactionRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.gross_amount ?? 0), 0);
}

function makeBucket<T extends { label: string }>(rows: T[], amount: (row: T) => number, extra?: (current: Record<string, number>, row: T) => void): Array<{ label: string; amount: number; count: number; quantity: number }> {
  const bucket = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const current = bucket.get(row.label) ?? { amount: 0, count: 0, quantity: 0 };
    current.amount += amount(row);
    current.count += 1;
    extra?.(current, row);
    bucket.set(row.label, current);
  }
  return Array.from(bucket.entries()).map(([label, value]) => ({
    label,
    amount: value.amount ?? 0,
    count: value.count ?? 0,
    quantity: value.quantity ?? 0
  }));
}

function normalizeAiResult(value: unknown, store: Store): SalesAiReportOutput {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const arrayValue = (key: string, fallback: string[]) => Array.isArray(input[key]) ? input[key].map(String) : fallback;
  const isAuto = store.industry_type_key === "auto_repair";

  return {
    title: String(input.title ?? (isAuto ? "整備工場向け 月次売上AIレポート" : "月次売上AIレポート")),
    good_points: arrayValue("good_points", ["取り込んだ売上データから月次傾向を確認できる状態になっています。"]),
    cautions: arrayValue("cautions", ["売上が少ない日や商品別の偏りを定期的に確認してください。"]),
    growth_items: arrayValue("growth_items", isAuto ? ["車検、点検、オイル交換などの整備メニュー"] : ["売上上位の商品・サービス"]),
    promotion_ideas: arrayValue("promotion_ideas", isAuto ? ["安全点検や季節整備を投稿テーマにする"] : ["売れ筋商品を投稿テーマにする"]),
    inventory_notes: arrayValue("inventory_notes", isAuto ? ["部品在庫と整備需要の増減を合わせて確認する"] : ["売れている商品の在庫切れに注意する"]),
    next_actions: arrayValue("next_actions", ["売上上位の商品を確認する", "落ち込みのある商品を販促候補にする"]),
    industry_advice: arrayValue("industry_advice", isAuto ? ["リピート来店につながる点検案内を増やす"] : ["来店促進と口コミ促進につながる導線を整える"]),
    ai_reasoning: String(input.ai_reasoning ?? "売上集計と注意点から、次に実行しやすい改善案を整理しました。")
  };
}

async function fetchTransactions(supabase: SupabaseClient, storeId: string, months: string[]) {
  const start = `${months[months.length - 1]}-01`;
  const endDate = new Date(`${months[0]}-01T00:00:00.000Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("sales_transactions")
    .select("*, items:sales_transaction_items(item_name, category_name, quantity, unit_price, total_amount)")
    .eq("store_id", storeId)
    .gte("business_date", start)
    .lt("business_date", end)
    .order("business_date", { ascending: true });
  if (error) throw new Error(`売上データを取得できませんでした: ${error.message}`);
  return (data ?? []) as TransactionRow[];
}

export async function buildSalesAnalysis(storeId: string, targetMonth: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = persistenceFor(store);
  const previous = previousMonth(targetMonth);
  const rows = await fetchTransactions(supabase, resolved.storeId, [targetMonth, previous]);
  const currentRows = rows.filter((row) => row.business_date.startsWith(targetMonth));
  const previousRows = rows.filter((row) => row.business_date.startsWith(previous));
  const totalSales = sumTransactions(currentRows);
  const previousMonthSales = sumTransactions(previousRows);
  const transactionCount = currentRows.length;

  const itemRows = currentRows.flatMap((row) => (row.items ?? []).map((item) => ({
    label: item.item_name || "未設定",
    amount: Number(item.total_amount ?? 0),
    quantity: Number(item.quantity ?? 0)
  })));
  const previousItemRows = previousRows.flatMap((row) => (row.items ?? []).map((item) => ({
    label: item.item_name || "未設定",
    amount: Number(item.total_amount ?? 0)
  })));

  const topItems = makeBucket(itemRows, (row) => row.amount, (current, row) => { current.quantity += row.quantity; })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((row) => ({ label: row.label, amount: row.amount, quantity: row.quantity }));
  const previousItems = makeBucket(previousItemRows, (row) => row.amount);
  const previousItemMap = new Map(previousItems.map((row) => [row.label, row.amount]));
  const itemChanges = topItems.map((item) => ({
    label: item.label,
    currentAmount: item.amount,
    previousAmount: previousItemMap.get(item.label) ?? 0,
    changeRate: percentChange(item.amount, previousItemMap.get(item.label) ?? 0)
  }));

  const summary: SalesAnalysisSummary = {
    targetMonth,
    totalSales,
    previousMonthSales,
    monthOverMonthRate: percentChange(totalSales, previousMonthSales),
    transactionCount,
    averageTransactionAmount: transactionCount > 0 ? totalSales / transactionCount : 0,
    topItems,
    paymentMethods: makeBucket(currentRows.map((row) => ({ label: row.payment_method ?? "未設定", amount: Number(row.gross_amount ?? 0) })), (row) => row.amount)
      .sort((a, b) => b.amount - a.amount)
      .map((row) => ({ label: row.label, amount: row.amount, count: row.count })),
    daily: makeBucket(currentRows.map((row) => ({ label: row.business_date, amount: Number(row.gross_amount ?? 0) })), (row) => row.amount)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((row) => ({ label: row.label, amount: row.amount, count: row.count })),
    weekday: makeBucket(currentRows.map((row) => ({ label: formatWeekday(row.business_date), amount: Number(row.gross_amount ?? 0) })), (row) => row.amount)
      .map((row) => ({ label: row.label, amount: row.amount, count: row.count })),
    risingItems: itemChanges.filter((row) => row.previousAmount === 0 ? row.currentAmount > 0 : (row.changeRate ?? 0) >= 30).slice(0, 5),
    fallingItems: itemChanges.filter((row) => row.previousAmount > 0 && (row.changeRate ?? 0) <= -30).slice(0, 5)
  };

  return { store, resolved, currentRows, summary };
}

function detectAnomalies(rows: TransactionRow[], summary: SalesAnalysisSummary) {
  const flags: SalesAnomalyFlag[] = [];
  const average = summary.averageTransactionAmount;
  const hashes = new Map<string, number>();

  for (const row of rows) {
    const amount = Number(row.gross_amount ?? 0);
    hashes.set(row.source_row_hash, (hashes.get(row.source_row_hash) ?? 0) + 1);
    if (average > 0 && amount > average * 5) {
      flags.push({ anomaly_type: "high_unit_amount", severity: "medium", title: "単価が高い取引", description: `${row.business_date} の取引金額が平均より大きくなっています。`, source_data: { transaction_id: row.id, amount } });
    }
    if (amount < 0 || (average > 0 && amount > 0 && amount < average * 0.1)) {
      flags.push({ anomaly_type: "low_or_negative_amount", severity: amount < 0 ? "high" : "low", title: "金額確認が必要な取引", description: `${row.business_date} の取引金額が極端に低い、またはマイナスです。`, source_data: { transaction_id: row.id, amount } });
    }
    for (const item of row.items ?? []) {
      const quantity = Number(item.quantity ?? 0);
      if (quantity <= 0 || quantity >= 100) {
        flags.push({ anomaly_type: "unusual_quantity", severity: quantity <= 0 ? "high" : "medium", title: "数量確認が必要な行", description: `${item.item_name} の数量が通常より不自然に見えます。`, source_data: { transaction_id: row.id, item_name: item.item_name, quantity } });
      }
    }
  }

  for (const falling of summary.fallingItems) {
    flags.push({ anomaly_type: "falling_item", severity: "medium", title: "前月より落ちた商品・サービス", description: `${falling.label} が前月比で大きく下がっています。`, source_data: falling });
  }
  for (const rising of summary.risingItems) {
    flags.push({ anomaly_type: "rising_item", severity: "low", title: "急に伸びた商品・サービス", description: `${rising.label} が前月より伸びています。販促テーマに使えます。`, source_data: rising });
  }
  for (const [hash, count] of hashes.entries()) {
    if (count > 1) {
      flags.push({ anomaly_type: "possible_duplicate", severity: "medium", title: "重複の可能性", description: "同じsource_row_hashの取引が複数あります。", source_data: { source_row_hash: hash, count } });
    }
  }
  return flags.slice(0, 30);
}

export async function listSalesAiReports(storeId: string): Promise<SalesAiReport[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = persistenceFor(store);
  const { data } = await supabase
    .from("sales_ai_reports")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("target_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);
  return (data ?? []) as SalesAiReport[];
}

export async function getSalesAiReport(storeId: string, reportId: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = persistenceFor(store);
  const [{ data: report }, { data: sections }, { data: flags }] = await Promise.all([
    supabase.from("sales_ai_reports").select("*").eq("store_id", resolved.storeId).eq("id", reportId).maybeSingle(),
    supabase.from("sales_ai_report_sections").select("*").eq("report_id", reportId).order("sort_order"),
    supabase.from("sales_anomaly_flags").select("*").eq("report_id", reportId).order("created_at")
  ]);
  if (!report) return null;
  return { report: report as SalesAiReport, sections: sections ?? [], flags: (flags ?? []) as SalesAnomalyFlag[] };
}

export async function createSalesAiReport(storeId: string, targetMonth: string) {
  const { store, resolved, currentRows, summary } = await buildSalesAnalysis(storeId, targetMonth);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const anomalies = detectAnomalies(currentRows, summary);
  const ai = await generateWithAi({
    store: { ...store, id: resolved.storeId, organization_id: resolved.organizationId },
    templateKey: "sales_ai_monthly_report",
    input: {
      target_month: targetMonth,
      summary,
      anomalies,
      expected_output_keys: ["title", "good_points", "cautions", "growth_items", "promotion_ideas", "inventory_notes", "next_actions", "industry_advice", "ai_reasoning"]
    }
  });
  const aiResult = normalizeAiResult(ai.output, store);

  const { data: report, error } = await supabase
    .from("sales_ai_reports")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      industry_type_key: store.industry_type_key,
      target_month: targetMonth,
      title: aiResult.title,
      summary_metrics: summary,
      ai_result: aiResult,
      anomaly_summary: anomalies,
      prompt_version: promptVersion,
      model_name: ai.log.model,
      status: ai.log.status
    })
    .select("*")
    .single();
  if (error || !report) throw new Error(`AI月次レポートを保存できませんでした: ${error?.message ?? "unknown error"}`);

  const sectionRows = [
    ["good_points", "今月の良かった点", aiResult.good_points],
    ["cautions", "注意すべき点", aiResult.cautions],
    ["growth_items", "来月伸ばすべき商品・サービス", aiResult.growth_items],
    ["promotion_ideas", "投稿や販促に使えるネタ", aiResult.promotion_ideas],
    ["inventory_notes", "在庫や仕入れで注意すべき点", aiResult.inventory_notes],
    ["next_actions", "来月のアクション", aiResult.next_actions],
    ["industry_advice", "業態別の改善提案", aiResult.industry_advice]
  ].map(([section_key, title, content], index) => ({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    report_id: report.id,
    section_key,
    title,
    content,
    sort_order: index + 1
  }));
  await supabase.from("sales_ai_report_sections").insert(sectionRows);
  if (anomalies.length > 0) {
    await supabase.from("sales_anomaly_flags").insert(anomalies.map((flag) => ({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      report_id: report.id,
      target_month: targetMonth,
      anomaly_type: flag.anomaly_type,
      severity: flag.severity,
      title: flag.title,
      description: flag.description,
      source_data: flag.source_data,
      status: "open"
    })));
  }
  return report.id as string;
}
