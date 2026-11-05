// Synthetic only: no environment files, database, external API or AI calls.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createServer } from "node:http";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { salesPeriod, summarizeSalesMonth, buildSalesDashboard, salesTarget, homeMonthSales } from "../lib/sales/dashboard-rules.ts";

const now = new Date("2026-11-05T04:00:00Z");
assert.equal(salesPeriod(new Date("2026-10-31T14:59:59Z")).month, "2026-10");
assert.equal(salesPeriod(new Date("2026-10-31T15:00:00Z")).month, "2026-11");
assert.equal(salesPeriod(new Date("2026-03-31T12:00:00Z")).previousUntil, "2026-02-28");
assert.equal(salesPeriod(new Date("2028-03-31T12:00:00Z")).previousUntil, "2028-02-29");
assert.equal(salesPeriod(new Date("2027-01-01T00:00:00Z")).previousMonth, "2026-12");
const row = (id, date, amount, extra = {}) => ({ id: String(id), business_date: date, gross_amount: amount, payment_method: "cash", source_metadata: { guest_count: 2, guest_count_confirmed: true }, ...extra });
let input = [row(1, "2026-11-01", 6000), row(2, "2026-11-05", 9000, { payment_method: "credit_card" }), row(3, "2026-10-01", 4000), row(4, "2026-10-05", 8000), row(5, "2026-10-25", 900000), row(6, "2026-12-01", 999999), row(7, "2026-11-06", 777777), row(8, "2026-11-01", 100000, { source_metadata: { square_pos_state: "void" } }), row(9, "2026-11-04", -1000, { payment_method: null, source_metadata: { square_pos_state: "refund" } })];
let data = buildSalesDashboard(input, { sales_month_targets: { "2026-11": 20000 } }, now);
assert.equal(data.current.total, 14000); assert.equal(data.current.count, 3); assert.equal(data.current.guestCount, 4); assert.equal(data.current.averageGuest, 3500);
assert.equal(data.previous.total, 12000); assert.equal(data.previous.averageGuest, 3000); assert.equal(data.guestDifference, 500);
assert.equal(data.current.paymentMethods.reduce((s, r) => s + r.amount, 0), data.current.total);
assert.equal(data.current.paymentMethods.find(r => r.label === "unset").amount, -1000);
assert.equal(data.target, 20000);
assert.equal(summarizeSalesMonth([row(1, "2026-11-01", 5000, { source_metadata: {} })], "2026-11-01", "2026-11-05").averageGuest, null);
for (const guest of [0, -1, 1.5, "2", null]) assert.equal(summarizeSalesMonth([row(1, "2026-11-01", 5000, { source_metadata: { guest_count: guest, guest_count_confirmed: true } })], "2026-11-01", "2026-11-05").averageGuest, null);
assert.equal(buildSalesDashboard([], {}, now).guestDifference, null);
assert.throws(() => buildSalesDashboard([row(1, "2026-11-01", "not money")], {}, now));
for (const target of [0, -1, "20000", 1.5, 1e14]) assert.equal(salesTarget({ sales_month_targets: { "2026-11": target } }, "2026-11"), null);
const home = homeMonthSales([...data.current.daily, ...data.previous.daily, { label: "2026-12-01", amount: 999999, count: 1 }], now);
assert.equal(home.amount, 14000); assert.equal(home.change, 16.7);
assert.equal(homeMonthSales([{ label: "2026-10-01", amount: 999, count: 1 }], now).amount, 0);
console.log("PASS calendar/JST/year/leap boundaries, current-month and equal-cutoff comparison, refunds/voids, guests, unknowns, payment reconciliation and target validation");

const require = createRequire(import.meta.url), store = { id: "11111111-1111-4111-8111-111111111111", organization_id: "org", profile_data: {} };
let authorized = true, role = "org_owner", failure = false, records = [], calls = [], rpcCalls = [], rpcFailure = false, renderMonthly = false, mockHooks = false, nextView = null;
const db = { from(table) {
  assert.equal(table, "sales_transactions"); const filters = []; let page;
  const q = { select(fields) { assert.equal(fields, "id,business_date,gross_amount,payment_method,source_metadata"); return q; },
    eq(k, v) { filters.push(r => r[k] === v); return q; }, gte(k, v) { filters.push(r => r[k] >= v); return q; }, lte(k, v) { filters.push(r => r[k] <= v); return q; },
    or() { filters.push(r => r.source_metadata?.square_pos_state !== "void" && r.source_metadata?.air_regi_state !== "void"); return q; }, order() { return q; }, range(a, b) { page = [a, b]; return q; },
    then(done) { calls.push(page); const all = records.filter(r => filters.every(f => f(r))); done({ data: all.slice(page[0], page[1] + 1), count: all.length, error: failure ? { message: "PRIVATE" } : null }); }
  }; return q;
}, rpc: async (name, params) => { rpcCalls.push({ name, params }); return { error: rpcFailure ? { message: "PRIVATE" } : null }; } };
const access = () => ({ userId: "actor", accountActive: authorized, isPlatformAdmin: role === "platform_admin", organizationRoles: { org: role }, storeRoles: {} });
const mocks = { "server-only": {}, "@/lib/stores": { getStore: async id => { if (!authorized || id !== store.id) throw new Error("forbidden"); return store; }, getStoreForApi: async id => authorized && id === store.id ? { ok: true, store } : { ok: false, status: 403 } },
  "@/lib/auth/server": { getCurrentUserAccess: async () => authorized ? access() : null },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db }, "next/navigation": { useRouter: () => ({ refresh() {} }) } };
const realState = React.useState;
const reactMock = { ...React, useState: initial => mockHooks ? [initial === "daily" && renderMonthly ? "monthly" : initial, value => { nextView = value; }] : realState(initial) };
function source(file) {
  const result = { exports: {} }, text = readFileSync(file, "utf8");
  const js = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)(name => {
    if (name === "react") return reactMock;
    if (mocks[name]) return mocks[name];
    if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
    const path = name.startsWith("@/") ? name.slice(2) : resolve(dirname(file), name);
    return source(existsSync(path) ? path : existsSync(`${path}.ts`) ? `${path}.ts` : `${path}.tsx`);
  }, result, result.exports);
  return result.exports;
}
const { getSalesDashboard } = source("lib/sales/dashboard.ts");
records = Array.from({ length: 1205 }, (_, i) => ({ ...row(i, "2026-11-02", 100), store_id: store.id, organization_id: "org" }));
records.push({ ...records[0], id: "other", store_id: "other" }, { ...records[0], id: "foreign", organization_id: "foreign" }, { ...records[0], id: "old", business_date: "2025-11-02" });
assert.equal((await getSalesDashboard(store.id, now)).current.total, 120500);
assert.deepEqual(calls, [[0,499], [500,999], [1000,1499]]);
authorized = false; calls = []; await assert.rejects(getSalesDashboard(store.id, now), /forbidden/); assert.equal(calls.length, 0); authorized = true;
failure = true; await assert.rejects(getSalesDashboard(store.id, now), /sales_read_failed/); failure = false;
records = []; assert.equal((await getSalesDashboard(store.id, now)).current.total, 0);
console.log("PASS monthly service complete pagination, org/store/date/void isolation, authorization before service-role read, empty/error distinction");
const { POST } = source("app/api/stores/[storeId]/sales-target/route.ts");
const currentMonth = salesPeriod().month;
async function post(body, origin = "https://app.aioboost.jp", id = store.id) { return POST(new Request(`https://app.aioboost.jp/api/stores/${id}/sales-target`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ storeId: id }) }); }
for (role of ["staff", "viewer"]) { assert.equal((await post({ month: currentMonth, amount: 10000 })).status, 403); }
role = "org_owner"; assert.equal(rpcCalls.length, 0);
for (role of ["org_owner", "store_manager", "platform_admin"]) assert.equal((await post({ month: currentMonth, amount: 10000 })).status, 200);
assert.equal((await post({ month: currentMonth, amount: null })).status, 200);
assert.equal((await post({ month: "2000-01", amount: 10000 })).status, 400);
assert.equal((await post({ month: currentMonth, amount: 0 })).status, 400);
assert.equal((await post({ month: currentMonth, amount: "10000" })).status, 400);
assert.equal((await post({ month: currentMonth, amount: 10000 }, "https://evil.example")).status, 403);
assert.equal((await post({ month: currentMonth, amount: 10000 }, undefined, "foreign-store")).status, 403);
rpcFailure = true; const failed = await post({ month: currentMonth, amount: 10000 }); assert.equal(failed.status, 503); assert(!JSON.stringify(await failed.json()).includes("PRIVATE")); rpcFailure = false;
assert(rpcCalls.every(call => call.name === "save_sales_month_target" && call.params.p_actor === "actor" && call.params.p_store === store.id));
const sql = readFileSync("supabase/migrations/202611050001_sales_month_target.sql", "utf8");
for (const token of ["menu_actor_allowed(p_actor,p_store,true)", "for update", "jsonb_set", "audit_logs", "from public,anon,authenticated", "to service_role"]) assert(sql.includes(token));
console.log("PASS goal API: manager roles, CSRF, month rollover, validation/clear, safe errors, scoped atomic SQL/audit contract");

const { MonthlySalesSummary, MonthlySalesVisuals } = source("components/sales/monthly-sales-dashboard.tsx");
const renderSummary = (restaurant, value = data) => renderToStaticMarkup(React.createElement(MonthlySalesSummary, { data: value, restaurant, editable: true, storeId: store.id }));
const renderVisuals = value => renderToStaticMarkup(React.createElement(MonthlySalesVisuals, { data: value, monthly: [{ label: "2026-10", amount: 100000, count: 50 }, { label: "2026-11", amount: 14000, count: 3 }] }));
let html = renderSummary(true);
assert(html.includes("月間売上")); assert(html.includes("平均客単価")); assert(!html.includes("取引件数")); assert(html.includes("70%")); assert(html.includes("前月同期間比 +¥500")); assert(html.includes('role="progressbar"'));
html = renderSummary(false); assert(html.includes("取引件数")); assert(html.includes("平均取引額"));
assert(renderSummary(true, buildSalesDashboard([], {}, now)).includes("客数未取得"));
assert(!renderSummary(true, null).includes('class="metric"'));
assert(renderVisuals(data).includes("日別売上推移")); assert(renderVisuals(data).includes("返金・調整でマイナス"));
const positiveData = buildSalesDashboard(input.filter(r => Number(r.gross_amount) >= 0), { sales_month_targets: { "2026-11": 20000 } }, now);
assert(renderVisuals(positiveData).includes("donut-chart"));
mockHooks = true; let tree = MonthlySalesVisuals({ data, monthly: [] });
const switches = tree.props.children[0].props.children[0].props.children[1].props.children;
assert.equal(switches[0].props["aria-pressed"], true); switches[1].props.onClick(); assert.equal(nextView, "monthly");
renderMonthly = true; assert(renderVisuals(positiveData).includes("月別売上推移")); renderMonthly = false; mockHooks = false;
console.log("PASS rendered KPI scope/restaurant/retail/unknown/error/goal/progress/comparison/payment states and daily-default/monthly-switch event");

const { AccountingOverview } = source("components/sales/accounting-overview.tsx");
for (const month of ["2026-10", "2026-11"]) {
  const accounting = renderToStaticMarkup(React.createElement(AccountingOverview, {
    storeId: store.id, editable: false,
    result: { state: "ready", undatedCount: 0, report: { month, count: 0, pendingCount: 0, duplicateCount: 0, invalidCount: 0 } }
  }));
  assert(accounting.includes(`${month.replace("-", "年")}月の税込金額です。`));
  assert(accounting.includes("上の売上指標は今月の取込済みデータです。"));
  assert(!accounting.includes("全期間")); assert(!accounting.includes("売上3指標"));
}
console.log("PASS accounting expense-month caption stays distinct from shared current-month sales KPIs, without obsolete three-card/all-time wording");

if (process.argv.includes("--preview")) {
  const css = readFileSync("app/globals.css", "utf8");
  createServer((req, res) => {
    const query = new URL(req.url, "http://localhost").searchParams;
    const restaurant = query.get("industry") !== "salon", empty = query.has("empty"), negative = query.has("negative");
    const value = empty ? buildSalesDashboard([], {}, now) : negative ? data : positiveData;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>今月の売上・架空データ検証</title><style>${css}\nbody{padding:24px;margin:0}main{max-width:1150px;margin:auto;display:grid;gap:20px}h1{font-size:26px}@media(max-width:680px){body{padding:16px}}</style></head><body><main><p>表示確認専用・架空データ／本番変更なし</p><h1>売上・経理</h1>${renderSummary(restaurant,value)}${renderVisuals(value)}</main></body></html>`);
  }).listen(3197,"127.0.0.1",()=>console.log("Synthetic monthly sales preview http://127.0.0.1:3197"));
}
