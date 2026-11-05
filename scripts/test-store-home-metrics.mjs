// Synthetic only: no credentials, database, provider API or AI calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import ts from "typescript";

const require = createRequire(import.meta.url);
const store = { id: "11111111-1111-4111-8111-111111111111", organization_id: "synthetic-org", name: "【架空】UI検証店舗", industry_type_key: "beauty_salon" };
let authorized = true, failedTable = "", records = {}, calls = [];
const now = new Date("2026-11-03T05:00:00Z");
const cache = new Map();
const mocks = {
  "server-only": {},
  "@/lib/stores": { getStore: async id => { if (!authorized || id !== store.id) throw new Error("forbidden"); return store; } },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  "@/config/industries": { getIndustryConfig: () => ({ name: "サロン", businessLabels: { stock: "商材在庫" } }) },
  "@/lib/applications/operating-model": { normalizeOperatingModel: () => ({ systems: Object.fromEntries(["sales", "inventory", "reservations", "customers"].map(k => [k, { authority: "aio" }])), operations: { serviceMode: "appointment" } }) },
  "@/lib/phase2/business-data": { listInventoryStocks: async () => [] },
  "@/lib/phase4/demand-actions": { listInventoryAlerts: async () => [] },
  "@/lib/phase4/sales-import-data": { getSalesReport: async () => ({ monthly: [{ label: "2026-10", amount: 100000, count: 10 }, { label: "2026-11", amount: 133100, count: 8 }], daily: [] }) },
  "@/lib/sales/dashboard": { getSalesDashboard: async () => ({ current: { daily: [{ label: "2026-11-01", amount: 133100, count: 8 }] }, previous: { daily: [{ label: "2026-10-01", amount: 100000, count: 10 }] } }) },
  "@/lib/phase5/google-integrations": { getGoogleIntegrationState: async () => ({ reviews: [] }) },
  "@/lib/phase5/growth-actions": { listGrowthActions: async () => [] },
  "next/link": { __esModule: true, default: ({ href, children, ...props }) => require("react").createElement("a", { href, ...props }, children) }
};
const db = { from(table) {
  const filters = [], operations = [];
  let fields, options;
  const q = {
    select(f, o) { fields = f; options = o; return q; },
    eq(k, v) { operations.push(["eq", k, v]); filters.push(r => r[k] === v); return q; },
    is(k, v) { operations.push(["is", k, v]); filters.push(r => (r[k] ?? null) === v); return q; },
    lt(k, v) { operations.push(["lt", k, v]); filters.push(r => Date.parse(r[k]) < Date.parse(v)); return q; },
    gt(k, v) { operations.push(["gt", k, v]); filters.push(r => Date.parse(r[k]) > Date.parse(v)); return q; },
    not(k, op, v) { assert.equal(op, "in"); operations.push(["not", k, v]); filters.push(r => !v.slice(1, -1).split(",").includes(r[k])); return q; },
    order() { return q; }, limit() { return q; },
    then(resolve) { const data = (records[table] ?? []).filter(r => filters.every(f => f(r))); calls.push({ table, fields, options, operations }); resolve({ data: options?.head ? null : data, count: data.length, error: table === failedTable ? { message: "PRIVATE_ERROR" } : null }); }
  }; return q;
} };
function source(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const m = { exports: {} }; cache.set(file, m);
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)(name => mocks[name] ?? (name.startsWith("@/") ? source(`${name.slice(2)}.ts`) : require(name)), m, m.exports);
  return m.exports;
}
const { googleReviewSummary, storedGoogleReviewSummary } = source("lib/google-review-summary.ts");
const { homeBookingWeek, getStoreHomeMetrics } = source("lib/store-home-metrics.ts");
const summary = googleReviewSummary({ averageRating: 4.7, totalReviewCount: 1320 }, "locations/current", now.toISOString());
const scoped = extra => ({ store_id: store.id, organization_id: store.organization_id, ...extra });
function reset() {
  authorized = true; failedTable = ""; calls = [];
  records = {
    google_oauth_connections: [scoped({ id: "oauth", status: "connected" })],
    google_business_locations: [scoped({ id: "location", is_selected: true, google_oauth_connection_id: "oauth", google_location_name: "locations/current", metadata: { review_summary: summary } })],
    bookings: []
  };
}
const pass = name => console.log(`PASS ${name}`);
reset();
assert.deepEqual(homeBookingWeek(now).days, ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
assert.equal(homeBookingWeek(new Date("2026-11-01T14:59:59Z")).days[0], "2026-10-26");
assert.equal(homeBookingWeek(new Date("2026-11-01T15:00:00Z")).days[0], "2026-11-02");
assert.equal(homeBookingWeek(new Date("2027-01-01T00:00:00Z")).days[0], "2026-12-28");
pass("JST Monday/Sunday/midnight/year boundaries match the booking calendar");

for (const payload of [{}, { averageRating: 0, totalReviewCount: 1 }, { averageRating: 4.7, totalReviewCount: 0 }, { averageRating: 5.1, totalReviewCount: 1 }, { averageRating: NaN, totalReviewCount: 1 }, { averageRating: "4.7", totalReviewCount: 1 }, { averageRating: 4.7, totalReviewCount: -1 }, { averageRating: 4.7, totalReviewCount: 1.5 }]) assert.equal(googleReviewSummary(payload, "locations/current", now.toISOString()), null);
assert.equal(googleReviewSummary({ averageRating: 0, totalReviewCount: 0 }, "locations/current", now.toISOString()).averageRating, null);
assert.equal(storedGoogleReviewSummary({ review_summary: summary }, "locations/other"), null);
assert.equal(storedGoogleReviewSummary({ review_summary: { ...summary, syncedAt: "invalid" } }, "locations/current"), null);
assert.equal(summary.totalReviewCount, 1320);
pass("official all-review aggregate validated; no subset average or fabricated zero rating");

const booking = extra => scoped({ status: "confirmed", starts_at: "2026-11-03T12:00:00+09:00", ends_at: "2026-11-03T13:00:00+09:00", archived_at: null, ...extra });
records.bookings = [booking({}), booking({ status: "pending" }), booking({ status: "completed" }),
  booking({ starts_at: "2026-11-01T23:30:00+09:00", ends_at: "2026-11-02T00:30:00+09:00" }),
  booking({ starts_at: "2026-11-08T23:30:00+09:00", ends_at: "2026-11-09T00:30:00+09:00" }),
  booking({ status: "cancelled" }), booking({ status: "no_show" }), booking({ archived_at: now.toISOString() }),
  booking({ store_id: "foreign-store" }), booking({ organization_id: "foreign-org" }),
  booking({ starts_at: "2026-11-09T00:00:00+09:00", ends_at: "2026-11-09T01:00:00+09:00" }),
  booking({ starts_at: "2026-11-01T23:00:00+09:00", ends_at: "2026-11-02T00:00:00+09:00" })];
let result = await getStoreHomeMetrics(store.id, now);
assert.equal(result.bookingCount, 5); assert.equal(result.googleRating.summary.averageRating, 4.7);
const bookingCall = calls.find(c => c.table === "bookings");
assert.deepEqual(bookingCall.options, { count: "exact", head: true }); assert.equal(bookingCall.fields, "id");
assert(calls.every(c => !/\*|token|email|customer|comment/i.test(c.fields)));
pass("exact, private-data-minimal booking counts exclude other tenants, archives, cancellations and week boundaries");
records.bookings = Array.from({ length: 1205 }, () => booking({}));
assert.equal((await getStoreHomeMetrics(store.id, now)).bookingCount, 1205);
pass("reservation count is not truncated to a preview/page limit");
failedTable = "bookings"; result = await getStoreHomeMetrics(store.id, now);
assert.equal(result.bookingCount, null); assert.equal(result.googleRating.state, "ready");
failedTable = "google_business_locations"; result = await getStoreHomeMetrics(store.id, now);
assert.equal(result.bookingCount, 1205); assert.equal(result.googleRating.state, "unavailable");
pass("independent read failures are unavailable, not zero or an entire-dashboard failure");
reset(); records.google_business_locations.push(scoped({ ...records.google_business_locations[0], id: "archived", archived_at: now.toISOString(), metadata: {} }), scoped({ ...records.google_business_locations[0], id: "old", is_selected: false, metadata: {} }), scoped({ ...records.google_business_locations[0], store_id: "foreign-store" }));
assert.equal((await getStoreHomeMetrics(store.id, now)).googleRating.summary.totalReviewCount, 1320);
records.google_business_locations.push(scoped({ ...records.google_business_locations[0], id: "ambiguous" }));
assert.equal((await getStoreHomeMetrics(store.id, now)).googleRating.state, "not_selected");
pass("rating only from exactly one selected, non-archived, connected, same-store/organization location");
reset(); records.google_oauth_connections[0].status = "disconnected";
assert.equal((await getStoreHomeMetrics(store.id, now)).googleRating.state, "disconnected");
reset(); records.google_business_locations[0].metadata = {};
assert.equal((await getStoreHomeMetrics(store.id, now)).googleRating.state, "not_synced");
reset(); authorized = false; calls = []; await assert.rejects(getStoreHomeMetrics(store.id, now), /forbidden/); assert.equal(calls.length, 0);
pass("disconnected/missing summary distinct; denied store checked before service-role reads");

reset(); records.bookings = [booking({})];
// Pin the display week, without replacing real service logic above.
mocks["@/lib/store-home-metrics"] = { getStoreHomeMetrics: id => getStoreHomeMetrics(id, now) };
cache.delete("lib/store-command-center.ts");
const dashboard = await source("lib/store-command-center.ts").getStoreCommandCenter(store.id, now);
assert.deepEqual(dashboard.metrics.map(m => m.key), ["sales", "bookings", "google-rating"]);
assert.deepEqual(dashboard.metrics.map(m => m.href), [`/stores/${store.id}/sales-hub`, `/stores/${store.id}/customers?tab=bookings&view=week&date=2026-11-02`, `/stores/${store.id}/marketing`]);
assert.deepEqual(dashboard.metrics.map(m => m.value), ["¥133,100", "1件", "4.7 / 5"]);
assert.equal(dashboard.metrics[0].label, "月間売上（今月の売上）");
assert.deepEqual(dashboard.metrics.slice(1).map(m => m.points), [[], []]);
pass("three real metric cards route separately; old transaction/average/profit cards removed without fake sparklines");
records.bookings = []; records.google_business_locations[0].metadata.review_summary = googleReviewSummary({ totalReviewCount: 0 }, "locations/current", now.toISOString());
let empty = await source("lib/store-command-center.ts").getStoreCommandCenter(store.id);
assert.equal(empty.metrics[1].value, "0件"); assert.equal(empty.metrics[2].value, "口コミなし");
failedTable = "bookings"; records.google_oauth_connections[0].status = "disconnected";
empty = await source("lib/store-command-center.ts").getStoreCommandCenter(store.id);
assert.equal(empty.metrics[1].value, "未取得"); assert.equal(empty.metrics[2].value, "未連携");
pass("legitimate zero reservations, no reviews, failed reads and disconnection remain distinguishable");

const syncSource = readFileSync("lib/phase5/google-integrations.ts", "utf8").split("export async function syncGoogleBusinessReviews")[1].split("export async function saveGoogleReviewReplyDraft")[0];
assert.match(syncSource, /page === 0.*googleReviewSummary\(result, location.google_location_name/);
assert.match(syncSource, /review_summary: reviewSummary/);
assert.match(syncSource, /eq\("id", location.id\).*eq\("store_id", resolved.storeId\).*eq\("organization_id", resolved.organizationId\)/s);
pass("existing explicit Google sync persists official average/count for the exact selected location");

const { StoreCommandCenterView } = source("components/dashboard/store-command-center.tsx");
const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
const render = data => renderToStaticMarkup(React.createElement(StoreCommandCenterView, { dashboard: data }));
const html = render(dashboard);
assert.match(html, /今週の予約/); assert.match(html, /Googleの評価（点数）/);
assert.equal((html.match(/class="command-metric /g) ?? []).length, 3);
assert.doesNotMatch(html, /取引・会計件数|平均取引額|原価・経費データが必要/);
pass("server-rendered card markup and navigation verified");

if (process.argv.includes("--preview")) {
  const css = readFileSync("app/globals.css", "utf8");
  const document = data => `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}\nbody{margin:0;padding:20px;background:#f7f9f7} .preview-main{container-type:inline-size;min-width:0} .command-kpi-column{align-self:start}</style><body><main class="preview-main">${render(data)}</main></body></html>`;
  createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (req.url === "/populated") return res.end(document(dashboard));
    if (req.url === "/empty") return res.end(document(empty));
    if (req.url?.startsWith("/stores/")) return res.end(`<h1>遷移先の確認</h1><p id="destination">${req.url.replaceAll("&", "&amp;")}</p><a href="/">検証画面へ戻る</a>`);
    res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>店舗トップ UI検証（架空データ）</title><body style="margin:20px;font:16px sans-serif"><h1>店舗トップ UI検証（架空データ）</h1><p>DB・外部APIへの接続なし。本番データではありません。</p><h2>PC</h2><iframe title="PC" src="/populated" style="width:1280px;height:900px;border:1px solid #ccc"></iframe><h2>スマホ 390px / 未連携・取得失敗</h2><iframe title="スマホ" src="/populated" style="width:390px;height:1600px;border:1px solid #ccc"></iframe> <iframe title="未取得" src="/empty" style="width:390px;height:1600px;border:1px solid #ccc"></iframe></body></html>`);
  }).listen(3195, "127.0.0.1", () => console.log("Synthetic UI preview http://127.0.0.1:3195"));
}
