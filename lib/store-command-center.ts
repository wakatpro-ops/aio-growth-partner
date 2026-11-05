import "server-only";

import { getIndustryConfig } from "@/config/industries";
import { normalizeOperatingModel } from "@/lib/applications/operating-model";
import { listInventoryStocks } from "@/lib/phase2/business-data";
import { listInventoryAlerts } from "@/lib/phase4/demand-actions";
import { getSalesReport } from "@/lib/phase4/sales-import-data";
import { getGoogleIntegrationState } from "@/lib/phase5/google-integrations";
import { listGrowthActions } from "@/lib/phase5/growth-actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import { getStoreHomeMetrics } from "@/lib/store-home-metrics";
import { homeMonthSales } from "@/lib/sales/dashboard-rules";
import { getSalesDashboard } from "@/lib/sales/dashboard";
import type { IndustryTypeKey, Store } from "@/types/domain";
import type { GrowthAction } from "@/types/phase5";

export type CommandCenterMetric = {
  key: string;
  label: string;
  value: string;
  change: number | null;
  changeLabel: string;
  href: string;
  available: boolean;
  points: number[];
  visual?: "bookings" | "rating";
};

export type CommandCenterTask = {
  key: string;
  tone: "danger" | "warning" | "opportunity" | "info";
  category: string;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
};

export type CommandCenterSocialDraft = {
  id: string;
  title: string;
  summary: string;
  channel: string;
  href: string;
  imageUrl: string | null;
};

export type StoreCommandCenter = {
  store: Store;
  industryName: string;
  dashboardTitle: string;
  focusLabels: string[];
  enabledAreas: { sales: boolean; inventory: boolean; reservations: boolean; customers: boolean };
  metrics: CommandCenterMetric[];
  coverageScore: number;
  coverageItems: Array<{ label: string; ready: boolean; detail: string }>;
  headline: string;
  summary: string;
  recommendation: string;
  tasks: CommandCenterTask[];
  inventoryLowCount: number;
  unansweredReviewCount: number;
  socialDrafts: CommandCenterSocialDraft[];
  dataAsOf: string;
};

const industryFocus: Record<IndustryTypeKey, string[]> = {
  restaurant: ["売上・取引", "食材在庫・仕入", "予約・座席", "Google口コミ", "SNS投稿"],
  beauty_salon: ["予約枠", "再来店", "客単価", "スタッフ", "商材在庫", "口コミ・SNS"],
  retail: ["商品別売上", "在庫回転", "欠品・発注", "顧客", "キャンペーン・SNS"],
  auto_repair: ["入庫・作業", "部品在庫", "顧客・車両", "見積・請求", "口コミ"],
  clinic_bodycare: ["予約・来院", "再来院", "客単価", "スタッフ", "口コミ"],
  real_estate: ["問合せ", "案件", "顧客", "見積・請求", "集客"],
  school: ["予約・受講", "継続率", "顧客", "教材在庫", "集客"],
  hotel_tourism: ["予約・稼働", "客単価", "在庫・備品", "口コミ", "SNS"],
  professional_service: ["相談・案件", "顧客", "見積・請求", "入金", "集客"],
  construction_renovation: ["案件・工程", "材料・仕入", "顧客", "見積・請求", "集客"],
  other_service: ["売上", "顧客", "予約", "在庫", "口コミ・SNS"],
  general_store: ["売上", "顧客", "在庫", "口コミ", "SNS投稿"]
};

function yen(value: number) {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function metricChangeLabel(change: number | null, comparison: string) {
  if (change === null) return comparison;
  if (change === 0) return `${comparison} ±0%`;
  return `${comparison} ${change > 0 ? "+" : ""}${change}%`;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function channelLabel(action: GrowthAction) {
  return ({ instagram: "Instagram", google_business_profile: "Google", review_reply: "口コミ返信", line: "LINE", customer_message: "顧客メッセージ", store_pop: "店内POP" } as Record<string, string>)[action.target_channel] ?? "投稿";
}

async function socialImages(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();
  const { data } = await supabase
    .from("image_caption_jobs")
    .select("growth_action_id, storage_bucket, storage_path")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(12);
  const result = new Map<string, string>();
  for (const row of data ?? []) {
    const actionId = String(row.growth_action_id ?? "");
    if (!actionId || result.has(actionId) || !row.storage_bucket || !row.storage_path) continue;
    const { data: signed } = await supabase.storage.from(String(row.storage_bucket)).createSignedUrl(String(row.storage_path), 900);
    if (signed?.signedUrl) result.set(actionId, signed.signedUrl);
  }
  return result;
}

export async function getStoreCommandCenter(storeId: string, now = new Date()): Promise<StoreCommandCenter> {
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);
  const operatingModel = normalizeOperatingModel(store.operating_model);
  const enabledAreas = {
    sales: operatingModel.systems.sales.authority !== "not_managed",
    inventory: operatingModel.systems.inventory.authority !== "not_managed",
    reservations: operatingModel.systems.reservations.authority !== "not_managed" && operatingModel.operations.serviceMode !== "not_used",
    customers: operatingModel.systems.customers.authority !== "not_managed"
  };
  const [[salesResult, stocksResult, alertsResult, growthResult, googleResult, imagesResult, monthResult], home] = await Promise.all([
    Promise.allSettled([
      getSalesReport(store.id),
      listInventoryStocks(store.id),
      listInventoryAlerts(store.id),
      listGrowthActions(store.id),
      getGoogleIntegrationState(store.id),
      socialImages(store.id),
      getSalesDashboard(store.id, now)
    ]),
    getStoreHomeMetrics(store.id)
  ]);
  const sales = settledValue(salesResult, { itemBreakdownIncomplete: false, totalSales: 0, transactionCount: 0, averageTransactionAmount: 0, daily: [], monthly: [], items: [], paymentMethods: [] });
  const stocks = settledValue(stocksResult, []);
  const inventoryAlerts = settledValue(alertsResult, []);
  const growthActions = settledValue(growthResult, []);
  const google = settledValue(googleResult, { connection: null, businessProfile: null, gmail: null, calendar: null, jobs: [], logs: [], locations: [], reviews: [], scopes: [], envReady: false });
  const imageByAction = settledValue(imagesResult, new Map<string, string>());

  const monthly = [...sales.monthly].sort((a, b) => a.label.localeCompare(b.label));
  const monthSales = homeMonthSales(monthResult.status === "fulfilled" ? [...monthResult.value.current.daily, ...monthResult.value.previous.daily] : [], now);
  const salesChange = monthSales.change;
  const daily = [...sales.daily].sort((a, b) => a.label.localeCompare(b.label)).slice(-14);
  const lowStocks = stocks.filter((stock) => Number(stock.quantity) <= Number(stock.reorder_point));
  const activeInventoryAlerts = inventoryAlerts.filter((alert) => !["resolved", "done", "archived"].includes(String(alert.status)));
  const unansweredReviews = google.reviews.filter((review) => !review.google_reply_text && review.reply_status !== "published");
  const drafts = growthActions.filter((action) => ["drafted", "pending_approval", "approved", "todo"].includes(action.status));
  const socialDrafts = drafts
    .filter((action) => ["instagram", "google_business_profile", "line", "customer_message", "store_pop"].includes(action.target_channel))
    .slice(0, 3)
    .map((action) => ({
      id: action.id,
      title: action.title,
      summary: action.summary,
      channel: channelLabel(action),
      href: `/stores/${store.id}/growth-actions/${action.id}`,
      imageUrl: imageByAction.get(action.id) ?? null
    }));

  const salesReady = Boolean(monthly.length || daily.length);
  const inventoryReady = stocks.length > 0;
  const googleReady = Boolean(google.connection || google.businessProfile || google.reviews.length);
  const socialReady = drafts.length > 0;
  const coverageItems = [
    { label: "売上", ready: salesReady, detail: salesReady ? "売上データを確認済み" : "CSV・Excelまたは連携データが未取得" },
    { label: industry.businessLabels.stock, ready: inventoryReady, detail: inventoryReady ? `${stocks.length}件の在庫を確認済み` : "在庫データが未登録" },
    { label: "Google口コミ", ready: googleReady, detail: googleReady ? `${google.reviews.length}件を取得済み` : "Google店舗情報が未連携" },
    { label: "SNS・集客", ready: socialReady, detail: socialReady ? `${drafts.length}件の提案・下書きあり` : "投稿下書きが未作成" }
  ].filter((item) => item.label !== "売上" || enabledAreas.sales)
    .filter((item) => item.label !== industry.businessLabels.stock || enabledAreas.inventory);
  const coverageScore = Math.round(coverageItems.filter((item) => item.ready).length / coverageItems.length * 100);

  const tasks: CommandCenterTask[] = [];
  if (enabledAreas.inventory && (lowStocks.length || activeInventoryAlerts.length)) {
    const first = lowStocks[0];
    tasks.push({
      key: "inventory",
      tone: "danger",
      category: "在庫・仕入",
      title: first ? `${first.item?.name ?? "在庫品"}が発注点以下です` : `${activeInventoryAlerts.length}件の在庫アラートがあります`,
      detail: first ? `残り${Number(first.quantity).toLocaleString("ja-JP")}${first.item?.unit ?? ""}／発注点${Number(first.reorder_point).toLocaleString("ja-JP")}` : activeInventoryAlerts[0]?.reason ?? "在庫状況を確認してください。",
      actionLabel: "在庫を確認する",
      href: `/stores/${store.id}/inventory`
    });
  }
  if (unansweredReviews.length) {
    tasks.push({ key: "reviews", tone: "warning", category: "口コミ対応", title: `Google口コミに${unansweredReviews.length}件未返信`, detail: "返信内容を確認し、承認後にGoogleへ反映できます。", actionLabel: "返信を作成する", href: `/stores/${store.id}/marketing/reviews#review-tools` });
  }
  if (socialDrafts.length) {
    tasks.push({ key: "social", tone: "opportunity", category: "集客チャンス", title: `${socialDrafts[0].channel}の下書きを確認できます`, detail: socialDrafts[0].title, actionLabel: "下書きを確認する", href: socialDrafts[0].href });
  }
  if (enabledAreas.sales && !salesReady) {
    tasks.push({ key: "sales-data", tone: "info", category: "データ準備", title: "売上推移を表示するデータがありません", detail: "CSV・Excel・PDFを取り込むと、実データのグラフと比較を表示します。", actionLabel: "データを取り込む", href: `/stores/${store.id}/data-imports/ai` });
  }
  if (!tasks.length) {
    tasks.push({ key: "all-clear", tone: "info", category: "今日の確認", title: "緊急の対応はありません", detail: "利用中の機能に新しい注意事項はありません。", actionLabel: "店舗情報を確認する", href: `/stores/${store.id}/settings` });
  }

  let headline = "今日の店舗状況を整理しました";
  const monitoredAreas = [enabledAreas.sales && "売上", enabledAreas.inventory && "在庫", "口コミ", "集客"].filter(Boolean).join("・");
  let summary = `接続済みの実データから、${monitoredAreas}の状況を確認しています。`;
  let recommendation = tasks[0].detail;
  if (salesChange !== null && salesChange < 0) {
    headline = `今月の取込済み売上は前月同期間比で${Math.abs(salesChange)}%減です`;
    summary = `${monthSales.previousStart}〜${monthSales.previousUntil}と${monthSales.start}〜${monthSales.today}の取込済み実績を比較しました。`;
    recommendation = "商品別売上と在庫状況を確認し、優先して訴求する商品・サービスを決めましょう。";
  } else if (salesChange !== null && salesChange > 0) {
    headline = `今月の取込済み売上は前月同期間比で${salesChange}%増です`;
    summary = `${monthSales.previousStart}〜${monthSales.previousUntil}と${monthSales.start}〜${monthSales.today}の取込済み実績を比較しました。`;
    recommendation = "伸びている商品・サービスを確認し、SNSやGoogle投稿にも活用しましょう。";
  } else if (lowStocks.length) {
    headline = `${lowStocks.length}件の在庫が発注点以下です`;
    recommendation = "欠品する前に在庫数量と仕入先を確認してください。";
  } else if (unansweredReviews.length) {
    headline = `返信待ちのGoogle口コミが${unansweredReviews.length}件あります`;
    recommendation = "AIで返信下書きを作り、内容を確認してから公開できます。";
  }

  const rating = home.googleRating;
  const ratingSummary = rating.state === "ready" ? rating.summary : null;
  const ratingValue = ratingSummary ? ratingSummary.averageRating === null ? "口コミなし" : `${ratingSummary.averageRating.toFixed(1)} / 5`
    : rating.state === "disconnected" ? "未連携" : rating.state === "not_selected" ? "店舗未選択" : "未取得";
  const metrics = ([
    { key: "sales", label: "月間売上（今月の売上）", value: monthResult.status === "rejected" ? "未取得" : yen(monthSales.amount), change: salesChange, changeLabel: monthResult.status === "rejected" ? "売上を取得できませんでした" : monthSales.available ? salesChange === null ? `${monthSales.month}・取込済み` : metricChangeLabel(salesChange, "前月同期間比") : "今月の取込なし", href: `/stores/${store.id}/sales-hub`, available: monthSales.available, points: monthSales.points },
    { key: "bookings", label: "今週の予約", value: home.bookingCount === null ? "未取得" : `${home.bookingCount.toLocaleString("ja-JP")}件`, change: null,
      changeLabel: home.bookingCount === null ? "予約を取得できませんでした" : `${home.week.days[0].slice(5).replace("-", "/")}〜${home.week.days[6].slice(5).replace("-", "/")}・キャンセルを除く`,
      href: `/stores/${store.id}/customers?tab=bookings&view=week&date=${home.week.days[0]}`, available: home.bookingCount !== null, points: [], visual: "bookings" },
    { key: "google-rating", label: "Googleの評価（点数）", value: ratingValue, change: null,
      changeLabel: ratingSummary ? `口コミ${ratingSummary.totalReviewCount.toLocaleString("ja-JP")}件・最終同期時点` : rating.state === "disconnected" ? "集客・販促からGoogleを接続" : rating.state === "not_selected" ? "集客・販促から店舗を確認" : rating.state === "unavailable" ? "評価を取得できませんでした" : "Google口コミの同期で更新",
      href: `/stores/${store.id}/marketing`, available: ratingSummary?.averageRating !== null && ratingSummary !== null, points: [], visual: "rating" }
  ] satisfies CommandCenterMetric[]).filter((metric) => (enabledAreas.sales || metric.key !== "sales") && (enabledAreas.reservations || metric.key !== "bookings"));

  const focusLabels = (industryFocus[store.industry_type_key] ?? industryFocus.general_store)
    .filter((label) => enabledAreas.sales || !/(売上|利益|客単価|取引)/.test(label))
    .filter((label) => enabledAreas.inventory || !/(在庫|仕入|食材|材料|備品|欠品|発注)/.test(label))
    .filter((label) => enabledAreas.reservations || !/(予約|座席|来院|入庫|受講|稼働)/.test(label))
    .filter((label) => enabledAreas.customers || !/(顧客|再来店|再来院)/.test(label));

  return {
    store,
    industryName: industry.name,
    dashboardTitle: industry.dashboardTitle,
    focusLabels: focusLabels.length ? focusLabels : ["口コミ", "SNS投稿", "店舗情報"],
    enabledAreas,
    metrics,
    coverageScore,
    coverageItems,
    headline,
    summary,
    recommendation,
    tasks: tasks.slice(0, 5),
    inventoryLowCount: Math.max(lowStocks.length, activeInventoryAlerts.length),
    unansweredReviewCount: unansweredReviews.length,
    socialDrafts,
    dataAsOf: new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date())
  };
}
