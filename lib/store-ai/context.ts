import "server-only";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { mayReadStore, mayEditStore } from "@/lib/auth/access-policy";
import { menuPermissions } from "@/lib/menu-workbench-rules";
import { menuSales } from "@/lib/menu-workbench";
import { getBooking, listBookings, listCalendarBookings, type BookingListView } from "@/lib/bookings";
import { bookingStatusLabels, bookingSourceLabels } from "@/lib/bookings/constants";
import { readCustomerWorkbench } from "@/lib/customer-workbench";
import { customerMatchesSegment } from "@/lib/customer-crm";
import { japanDay, recencyGroup, visitGroup } from "@/lib/customer-workbench-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStoreAiReadiness } from "./readiness";
import { bookingFacts, bookingPeriod, contextGreeting, resolveAiPage, salesFacts, type AiContext, type AiPage, type AiSection } from "./context-rules";
import { contextVersion, pageKnowledge } from "./knowledge";
import type { Store } from "@/types/domain";
import type { BusinessItem, InventoryStock } from "@/types/phase2";
import type { AioGoal, AioImprovementTask } from "@/types/aio-improvement";

type Db = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
async function section(key: string, label: string, read: () => Promise<Omit<AiSection, "key" | "label">>): Promise<AiSection> {
  try { return { key, label, ...await read() }; }
  catch { return { key, label, state: "unavailable", summary: `${label}は取得できませんでした。未登録とは異なります。` }; }
}

// Bounded, complete reads. Exceeding the cap is an error, never a false total.
async function rows<T>(db: Db, store: Store, table: string, fields: string, active = false): Promise<T[]> {
  const output: T[] = [];
  for (let from = 0; from < 50000; from += 500) {
    let query = db.from(table).select(fields).eq("store_id", store.id).eq("organization_id", store.organization_id).order("id").range(from, from + 499);
    if (active) query = query.is("archived_at", null);
    const result = await query;
    if (result.error) throw new Error("read_failed");
    output.push(...(result.data ?? []) as unknown as T[]);
    if ((result.data?.length ?? 0) < 500) return output;
  }
  throw new Error("read_limit");
}

async function reservations(store: Store, page: AiPage): Promise<AiSection> {
  return section("bookings", "予約", async () => {
    const range = bookingPeriod(page);
    const records = await (page.recordId ? getBooking(store.id, page.recordId).then(row => row ? [row] : [])
        : page.view === "day" || page.view === "week" ? listCalendarBookings(store.id, range.start, range.end)
          : listBookings(store.id, page.view as BookingListView));
    // One unambiguous period aggregate: never mix in all-time/archive badge counts.
    const { bookings, ...counts } = bookingFacts(records, page.view === "deleted");
    const label = page.recordId ? "選択した予約" : page.view === "week" ? `${page.days[0]}〜${page.days.at(-1)}` : page.view === "day" ? page.day : ({ upcoming: "明日以降", past: "昨日以前", deleted: "削除済み" }[page.view]);
    const limited = !page.recordId && !["day", "week"].includes(page.view) && bookings.length === 300;
    return { state: bookings.length ? "ready" : "empty", summary: `${label}の${limited ? "取得分" : "予約"}は${counts.totalCount}件${bookings.length ? `（キャンセル・無断キャンセルを除く${counts.excludingCancelledAndNoShowCount}件）` : ""}です。`, truncated: limited || bookings.length > 60,
      data: { displayedPeriod: { label, ...counts, scope: page.view === "deleted" ? "削除済み一覧の取得分のみ" : "表示期間・条件の削除されていない予約のみ。全期間や削除済み件数は含まない。" }, filters: { view: page.view, date: page.day }, todayJst: japanDay(), detailLimit: 60,
        bookings: bookings.slice(0, 60).map(row => ({ id: row.id, customer: row.customer_name.slice(0, 120), service: (row.service_name || row.service?.name || "未登録").slice(0, 160), startsAt: row.starts_at, endsAt: row.ends_at, status: bookingStatusLabels[row.status], source: bookingSourceLabels[row.source], resources: row.allocations?.map(a => a.resource?.name).filter(Boolean), updatedAt: row.updated_at })) } };
  });
}

async function customers(store: Store, page: AiPage): Promise<AiSection> {
  return section("customers", "顧客", async () => {
    const workspace = await readCustomerWorkbench(store.id), query = page.query;
    const keyword = (query.q ?? "").trim().toLowerCase();
    const filtered = workspace.customers.filter(c => (!page.recordId || c.id === page.recordId) && (!query.segment || customerMatchesSegment(c, query.segment)) && (!query.group || visitGroup(c.visit_count) === query.group) && (!query.recency || recencyGroup(c.last_visit_date) === query.recency) && (!keyword || [c.name, c.company_name, c.phone, c.email, c.assigned_staff_name, ...(c.tags ?? [])].some(v => String(v ?? "").toLowerCase().includes(keyword))));
    return { state: filtered.length ? "ready" : "empty", summary: `登録中のお客様は${workspace.customers.length}件、表示条件に合うお客様は${filtered.length}件です。`, truncated: filtered.length > 50,
      data: { active: workspace.customers.length, matched: filtered.length, filters: { segment: query.segment, group: query.group, recency: query.recency, keywordApplied: Boolean(keyword) },
        firstVisit: filtered.filter(c => visitGroup(c.visit_count) === "first").length, repeatVisit: filtered.filter(c => visitGroup(c.visit_count) === "repeat").length, lastVisit90DaysOrMore: filtered.filter(c => recencyGroup(c.last_visit_date) === "long").length,
        customers: filtered.slice(0, 50).map(c => ({ name: c.name.slice(0, 120), visits: c.visit_count, lastVisit: c.last_visit_date, staff: c.assigned_staff_name?.slice(0, 100) })) } };
  });
}

async function sales(db: Db, store: Store): Promise<AiSection> {
  return section("sales", "売上", async () => {
    const transactions = await rows<{ business_date: string; gross_amount: number }>(db, store, "sales_transactions", "id,business_date,gross_amount");
    const facts = salesFacts(transactions);
    return { state: facts.count ? "ready" : "empty", summary: facts.latest ? `最新の登録月（${facts.latest.month}）の売上は${facts.latest.amount.toLocaleString("ja-JP")}円です。` : "売上データはまだ登録されていません。", truncated: facts.monthly.length > 24, data: { ...facts, monthly: facts.monthly.slice(-24), scope: "取り込み済み全取引。日付のない期間・利益・経費は取得していない。", currency: "JPY" } };
  });
}

async function inventory(db: Db, store: Store, page: AiPage, manager: boolean): Promise<AiSection> {
  if (page.tab === "analysis" && !manager) return { key: "inventory", label: "在庫・利益分析", state: "restricted", summary: "原価・利益分析は店長以上の権限で確認できます。" };
  return section("inventory", "商品・在庫", async () => {
    const [items, stocks, performance] = await Promise.all([
      rows<Pick<BusinessItem, "id" | "name" | "unit" | "unit_price" | "cost_price" | "tax_rate" | "metadata" | "is_stock_managed" | "status" | "availability">>(db, store, "items", `id,name,unit,unit_price,is_stock_managed,status,availability${manager ? ",cost_price,tax_rate,metadata" : ""}`, true),
      rows<InventoryStock>(db, store, "inventory_stocks", "id,item_id,quantity,reserved_quantity,reorder_point,updated_at"),
      page.tab === "analysis" && manager ? menuSales(store.id, [30, 90, 365].includes(Number(page.query.days)) ? Number(page.query.days) : 30) : null
    ]);
    const totals = new Map<string, { quantity: number; amount: number }>();
    for (const row of performance?.rows ?? []) { if (!row.item_id) continue; const current = totals.get(row.item_id) ?? { quantity: 0, amount: 0 }; current.quantity += Number(row.quantity); current.amount += Number(row.total_amount); totals.set(row.item_id, current); }
    const stockById = new Map(stocks.map(row => [row.item_id, row]));
    const products = items.map(item => { const stock = stockById.get(item.id); return { name: item.name.slice(0, 160), unit: item.unit, price: item.unit_price, ...(manager ? { registeredCost: item.cost_price, referenceMargin: item.cost_price > 0 && item.unit_price > 0 ? Math.round((item.metadata?.tax_inclusion === "exclusive" ? item.unit_price : item.unit_price / (1 + item.tax_rate / 100)) - item.cost_price) : null } : {}), ...(performance ? { sales: totals.get(item.id) ?? null } : {}), status: item.status, availability: item.availability, stockManaged: item.is_stock_managed, available: stock ? Number(stock.quantity) - Number(stock.reserved_quantity) : null, reorderPoint: stock?.reorder_point ?? null, updatedAt: stock?.updated_at ?? null }; });
    const low = products.filter(p => p.stockManaged && p.available !== null && Number(p.reorderPoint) > 0 && p.available <= Number(p.reorderPoint));
    const missing = products.filter(p => p.stockManaged && p.available === null).length;
    return { state: products.length ? "ready" : "empty", summary: performance ? `${performance.start}〜${performance.until}の取り込み済み商品明細は${performance.rows.length}件です。` : `商品は${items.length}件、発注目安以下は${low.length}件です。${missing ? `在庫未登録が${missing}件あります。` : ""}`, truncated: products.length > 50 || low.length > 50, data: { count: items.length, lowCount: low.length, missingStockCount: missing, low: low.slice(0, 50), products: products.slice(0, 50), ...(performance ? { period: { from: performance.start, to: performance.until }, unlinkedSales: performance.rows.filter(row => !row.item_id).length } : {}), note: "現在の登録単価・在庫。参考利益は現在の税抜単価−登録原価であり期間実利益ではない。商品紐付け・取り込み不足の可能性がある。" } };
  });
}

async function reviews(db: Db, store: Store): Promise<AiSection> {
  return section("reviews", "Google口コミ", async () => {
    const [connections, locations, allReviews] = await Promise.all([
      rows<{ status: string; updated_at: string }>(db, store, "google_oauth_connections", "id,status,updated_at"),
      rows<{ id: string }>(db, store, "google_business_locations", "id", true),
      rows<{ id: string; google_business_location_id: string; star_rating: number; google_updated_at: string; google_reply_text: string | null; reply_status: string }>(db, store, "google_business_reviews", "id,google_business_location_id,star_rating,google_updated_at,google_reply_text,reply_status")
    ]);
    const ids = new Set(locations.map(row => row.id)), visible = allReviews.filter(row => ids.has(row.google_business_location_id));
    const unanswered = visible.filter(row => !row.google_reply_text && row.reply_status !== "published").length;
    const connected = connections.some(row => row.status === "connected");
    return { state: visible.length ? "ready" : "empty", summary: `${connected ? "Googleから取得済みの" : "Googleは未接続です。保存済みの"}口コミは${visible.length}件、未返信は${unanswered}件です。`, data: { connected, storedCount: visible.length, unanswered, latestReviewUpdate: visible.map(row => row.google_updated_at).sort().at(-1) ?? null, note: "保存済みデータ。今Googleを同期した結果ではない。口コミ本文・氏名は未取得。" } };
  });
}

async function aio(db: Db, store: Store, page: AiPage): Promise<AiSection> {
  return section("aio", "AIO改善", async () => {
    const [readiness, goals, tasks] = await Promise.all([getStoreAiReadiness(store, true), rows<Pick<AioGoal, "target_questions">>(db, store, "aio_goals", "id,target_questions"), rows<Pick<AioImprovementTask, "id" | "title" | "status" | "publication_status" | "due_date">>(db, store, "aio_improvement_tasks", "id,title,status,publication_status,due_date", true)]);
    const selected = tasks.filter(task => !page.recordId || task.id === page.recordId);
    return { state: "ready", summary: `AIおすすめ準備度は${readiness.score}%です。${readiness.nextBestActions[0] ? `次は「${readiness.nextBestActions[0].label}」を確認しましょう。` : "整えた情報の外部への反映を確認しましょう。"}`, truncated: selected.length > 30, data: { score: readiness.score, stage: readiness.stage, items: readiness.items.map(({ label, complete, benefit }) => ({ label, complete, benefit })), next: readiness.nextBestActions.map(({ label, href }) => ({ label, href })), targetQuestions: (goals[0]?.target_questions ?? readiness.targetQuestions).slice(0, 5).map(q => q.slice(0, 200)), taskCount: selected.length, tasks: selected.slice(0, 30).map(task => ({ ...task, title: task.title.slice(0, 160) })), definition: "情報の整い具合。検索順位・外部AI推薦率ではない。" } };
  });
}

async function marketing(db: Db, store: Store): Promise<AiSection> {
  return section("marketing", "集客・販促", async () => {
    const actions = await rows<{ title: string; status: string; target_channel: string; published_at: string | null }>(db, store, "growth_actions", "id,title,status,target_channel,published_at", true);
    const drafts = actions.filter(a => ["drafted", "pending_approval", "approved"].includes(a.status));
    return { state: actions.length ? "ready" : "empty", summary: `集客の提案は${actions.length}件、下書き・承認中は${drafts.length}件です。`, truncated: actions.length > 30, data: { count: actions.length, drafts: drafts.length, actions: actions.slice(0, 30).map(a => ({ ...a, title: a.title.slice(0, 160) })) } };
  });
}

export async function loadStoreAiContext(store: Store, pathname: string, search = ""): Promise<AiContext> {
  const access = await getCurrentUserAccess();
  if (!access || !mayReadStore(access, store.id, store.organization_id)) throw new Error("unauthorized");
  const page = resolveAiPage(store.id, pathname, search), knowledge = pageKnowledge(page);
  const manager = menuPermissions(access, store.organization_id, store.id).manager;
  const canEdit = mayEditStore(access, store.id, store.organization_id);
  const db = createSupabaseAdminClient();
  const readers: Partial<Record<typeof page.area, () => Promise<AiSection>>> = {
    bookings: () => reservations(store, page), customers: () => customers(store, page), sales: () => sales(db!, store), inventory: () => inventory(db!, store, page, manager), reviews: () => reviews(db!, store), aio: () => aio(db!, store, page), marketing: () => marketing(db!, store)
  };
  const areas = page.area === "home" ? ["sales", "bookings", "inventory", "reviews", "marketing"] as const : [page.area];
  const sections = await Promise.all(areas.map(area => readers[area]).filter((reader): reader is () => Promise<AiSection> => Boolean(reader)).map(reader => reader()));
  const base = `/stores/${store.id}`;
  const links = page.area === "bookings" ? [{ label: "予約を確認", href: `${base}/customers?tab=bookings` }, { label: "予約メールを確認", href: `${base}/ai-inbox` }]
    : page.area === "customers" ? [{ label: "顧客を確認", href: `${base}/customers?tab=customers` }]
      : page.area === "home" ? [{ label: "売上を見る", href: `${base}/sales-hub` }]
        : [];
  return { version: contextVersion, key: page.key, pageLabel: knowledge.label, storeName: store.name, industry: store.industry_type_key,
    role: access.isPlatformAdmin ? "運営管理者（選択中の店舗のみ）" : access.organizationRoles[store.organization_id] || access.storeRoles[store.id] || "viewer", canEdit, manager,
    observedAt: new Date().toISOString(), day: japanDay(), greeting: contextGreeting(knowledge.label, sections), suggestions: knowledge.suggestions, links, guidance: knowledge.guidance, sections };
}
