// Synthetic SSR contract checks. No environment, credentials, network or live DB.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../../", import.meta.url);
const css = new Proxy({}, { get: (_, key) => key });
const Link = ({ children, ...props }) => React.createElement("a", props, children);
function load(path, mocks = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const loadedModule = { exports: {} };
  const safeRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "next/link") return { __esModule: true, default: Link };
    if (name === "next/navigation") return { useRouter: () => ({ refresh() { throw new Error("SSR must not refresh"); } }) };
    if (name === "./usage.module.css" || name === "./app-shell.module.css") return { __esModule: true, default: css };
    throw new Error(`Unexpected SSR dependency: ${name}`);
  };
  new Function("require", "module", "exports", code)(safeRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const core = load("lib/ai-usage/dashboard.ts");
const view = load("app/admin/ai-logs/usage-dashboard.tsx");
const settingsView = load("app/admin/ai-logs/usage-settings.tsx");
const metrics = (values = {}) => ({ ...core.emptyAiUsageMetrics(), ...values });
const group = (key, values = {}) => ({ key, label: `合成 ${key}`, ...metrics(values) });
function fixture(overrides = {}) {
  const aggregate = core.emptyAiUsageAggregate();
  aggregate.totals = metrics({ requests: 20, operations: 18, retries: 2, errors: 1, inputTokens: 10000, outputTokens: 2000, cachedInputTokens: 8000, cacheWriteTokens: 1000, knownCostRequests: 20, estimatedCostUsd: 0.45, tokenCostUsd: 0.40, toolCostUsd: 0.05, webSearchCalls: 5 });
  aggregate.stores = [group("synthetic-store", aggregate.totals)];
  aggregate.features = [group("assistant", aggregate.totals)];
  aggregate.days = [group("2026-10-01", aggregate.totals)];
  aggregate.recent.current = metrics({ requests: 20, knownCostRequests: 20, estimatedCostUsd: 0.1 });
  aggregate.recent.previous = metrics({ requests: 5, knownCostRequests: 5, estimatedCostUsd: 0.02 });
  return { ...core.buildAiUsageDashboard({ month: "2026-10", now: new Date("2026-10-10T03:00:00Z"), meteringStartedAt: "2026-09-30T15:00:00Z", aggregate,
    settings: { usdJpy: 150, serviceRevenueJpy: 100000, updatedAt: "2026-10-01T00:00:00Z" } }), ...overrides };
}
const render = (data) => renderToStaticMarkup(React.createElement(view.AiUsageDashboardView, { dashboard: data }));

test("synthetic dashboard displays scoped month, estimated costs and cache-inclusive input", () => {
  const html = render(fixture());
  assert.match(html, /value="2026-10"/);
  assert.match(html, /\$0\.45/);
  assert.match(html, /67\.5円/);
  assert.match(html, /0\.07%/);
  assert.match(html, /キャッシュは入力の内数/);
  assert.match(html, /入力トークン合計<\/p><strong>10,000/);
  assert.match(html, /キャッシュ読取<\/p><strong>8,000/);
  assert.doesNotMatch(html, /19,000/);
  assert.match(html, /ツール費用小計 \$0\.05/);
  assert.match(html, /請求書の確定額ではありません/);
  assert.match(html, /店舗AI相談/);
});
test("unpriced requests are not shown as a zero cost", () => {
  const data = fixture({ totals: metrics({ requests: 3, operations: 3, unpricedCount: 3 }), costJpy: null, revenueRatioPercent: null });
  const html = render(data);
  assert.match(html, /計算できません/);
  assert.match(html, /トークン費用小計 計算不可/);
  assert.match(html, /ツール費用小計 計算不可/);
  assert.doesNotMatch(html, /トークン費用小計 \$0\.00/);
});
test("partial and never-metered day gaps remain unknown, future dates do not become zero", () => {
  const points = view.usageDayPoints(fixture({ days: [], meteringStartedAt: "2026-10-05T03:00:00Z" }));
  assert.equal(points.length, 31);
  assert.equal(points[0].amount, null);
  assert.equal(points[3].measured, false);
  assert.equal(points[4].amount, 0);
  assert.equal(points[4].partial, true);
  assert.equal(points[5].amount, 0);
  assert.equal(points[5].partial, false);
  assert.equal(points[9].partial, true);
  assert.equal(points[10].amount, null);
});
test("all-unpriced day is unknown but a measured zero-activity day is zero", () => {
  const points = view.usageDayPoints(fixture({ days: [group("2026-10-02", { requests: 1, unpricedCount: 1 })] }));
  assert.equal(points[0].amount, 0);
  assert.equal(points[1].amount, null);
  assert.equal(points[1].measured, true);
});
test("empty month with incomplete coverage explicitly says unmetered", () => {
  const data = core.buildAiUsageDashboard({ month: "2026-09", now: new Date("2026-10-10T03:00:00Z"), meteringStartedAt: "2026-10-01T00:00:00Z", aggregate: core.emptyAiUsageAggregate() });
  const html = render(data);
  assert.match(html, /<strong>未計測<\/strong>/);
  assert.match(html, /換算レート・利用料売上を設定/);
  assert.equal(view.usageDayPoints(data).filter(point => point.amount !== null).length, 0);
});
test("unavailable state has no fabricated metric cards", () => {
  const html = render(fixture({ state: "unavailable", warnings: ["合成の取得失敗"] }));
  assert.match(html, /AI利用状況を取得できませんでした/);
  assert.match(html, /合成の取得失敗/);
  assert.doesNotMatch(html, /class="kpis"/);
  assert.doesNotMatch(html, /<svg/);
});
test("actual page excludes settings entirely when loader is unavailable", async () => {
  let requested;
  const page = load("app/admin/ai-logs/page.tsx", {
    "@/components/layout/app-shell": { AppShell: ({ children }) => React.createElement("main", null, children) },
    "@/components/ui/page-header": { PageHeader: ({ title }) => React.createElement("h1", null, title) },
    "@/lib/ai-usage/admin": { getAiUsageDashboard: async (month) => { requested = month; return fixture({ state: "unavailable" }); }, saveAiUsageMonthlySettingsAction: () => { throw new Error("SSR must not save settings"); } },
    "./usage-dashboard": view, "./usage-settings": settingsView
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ month: "2026-09" }) }));
  assert.equal(requested, "2026-09");
  assert.doesNotMatch(html, /name="usd_jpy"/);
  assert.match(html, /現在の設定を正常に読み込んでから/);
});
test("settings show unknown FX blank and real zero revenue, with no invented FX", () => {
  const html = renderToStaticMarkup(React.createElement(settingsView.MonthlyUsageSettings, { month: "2026-10", settings: { usdJpy: null, serviceRevenueJpy: 0, updatedAt: null }, saveAction: () => { throw new Error("must not save"); } }));
  assert.match(html, /name="usd_jpy"[^>]*value=""/);
  assert.match(html, /name="service_revenue_jpy"[^>]*value="0"/);
  assert.match(html, /空欄で更新すると/);
  assert.match(html, /税抜・円/);
});
test("recent spikes stay explicitly independent of selected monthly scope", () => {
  const data = fixture({ month: "2026-09", spikes: [{ key: "assistant", label: "assistant", scope: "feature", kind: "spike", current: metrics({ requests: 20, retries: 2 }), previous: metrics({ requests: 5 }), requestRatio: 4 }] });
  const html = render(data);
  assert.match(html, /選択月とは別集計/);
  assert.match(html, /直近24時間 vs その前の24時間/);
  assert.match(html, /4倍/);
  assert.match(html, /利用増は異常を意味しません/);
});
test("incomplete 48h history does not assert no spikes", () => {
  const data = fixture();
  data.recent.coverageComplete = false;
  const html = render(data);
  assert.match(html, /急増かどうかは判定しません/);
  assert.doesNotMatch(html, /急増の確認候補はありません/);
});
test("accessible chart, exact table and all store rows survive escaped labels", () => {
  const stores = Array.from({ length: 40 }, (_, index) => group(`synthetic-${index}`, { label: index === 39 ? "<script>alert('test')</script>" : `合成店舗${index}`, requests: 1, knownCostRequests: 1 }));
  const html = render(fixture({ stores }));
  assert.match(html, /role="img" aria-labelledby="usage-chart-title usage-chart-description"/);
  assert.match(html, /日別の正確な数値を確認/);
  assert.match(html, /合成店舗38/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /tabindex="0" role="region"/);
});
test("all CSS-module references are defined, including responsive and scroll containment", () => {
  const style = readFileSync(new URL("app/admin/ai-logs/usage.module.css", root), "utf8");
  for (const file of ["page.tsx", "usage-dashboard.tsx", "usage-settings.tsx"]) {
    const source = readFileSync(new URL(`app/admin/ai-logs/${file}`, root), "utf8");
    for (const match of source.matchAll(/styles\.([A-Za-z0-9_]+)/g)) assert(style.includes(`.${match[1]}`), `Missing CSS class ${match[1]}`);
  }
  assert.match(style, /max-width: 480px/);
  assert.match(style, /overflow-x: auto/);
  assert.match(style, /focus-visible/);
});
test("SSR renders without React title or hydration warnings", () => {
  const messages = [];
  const original = console.error;
  console.error = (...values) => messages.push(values);
  try { render(fixture()); } finally { console.error = original; }
  assert.deepEqual(messages, []);
});
test("admin navigation is outside the general mobile scroller and keeps all links discoverable", () => {
  const { AppShell } = load("components/layout/app-shell.tsx", { "next/navigation": { usePathname: () => "/admin/ai-logs" } });
  const html = renderToStaticMarkup(React.createElement(AppShell, null, "synthetic"));
  const mainNavigation = html.match(/<nav class="nav" aria-label="main">([\s\S]*?)<\/nav>/)?.[1];
  assert(mainNavigation);
  assert.doesNotMatch(mainNavigation, /管理者メニュー|\/admin/);
  const adminNavigation = html.match(/<nav class="nav adminNav" aria-labelledby="admin-menu-heading">([\s\S]*?)<\/nav>/)?.[1];
  assert(adminNavigation);
  assert.match(adminNavigation, /href="\/admin"/);
  assert.match(adminNavigation, /href="\/admin\/applications"/);
  assert.match(adminNavigation, /aria-current="page" class="active" href="\/admin\/ai-logs"/);
  const style = readFileSync(new URL("components/layout/app-shell.module.css", root), "utf8");
  assert.match(style, /nav\.adminNav\s*\{[^}]*display: grid/);
  assert.match(style, /overflow: visible/);
  assert.match(style, /white-space: nowrap/);
  assert.match(style, /@media \(max-width: 900px\)/);
});
test("store navigation does not gain an operator-only navigation group", () => {
  const { AppShell } = load("components/layout/app-shell.tsx", { "next/navigation": { usePathname: () => "/stores/synthetic-store/sales-hub" } });
  const html = renderToStaticMarkup(React.createElement(AppShell, null, "synthetic"));
  assert.doesNotMatch(html, /admin-menu-heading|href="\/admin/);
  assert.match(html, /aria-current="page" class="active" href="\/stores\/synthetic-store\/sales-hub"/);
});
