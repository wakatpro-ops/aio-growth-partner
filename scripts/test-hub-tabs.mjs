// Synthetic rendering and event checks only. No database, credentials or provider requests.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const store = { id: "11111111-1111-4111-8111-111111111111", feature_flags: {} };
let query = new URLSearchParams(), promotion = true, reviews = { unanswered: 3 }, focused = -1, changedUrl = "";
const mocks = {
  react: { ...React, useRef: () => ({ current: [0, 1].map(index => ({ focus: () => { focused = index; } })) }) },
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  "next/navigation": { usePathname: () => `/stores/${store.id}/sales-hub`, useSearchParams: () => query },
  "@/lib/feature-flags/resolve-feature-flags": { resolveFeatureFlags: () => ({}), isFeatureEnabled: () => promotion },
  "@/lib/marketing/reviews": { getReviewSummary: async () => { if (reviews === null) throw new Error("unavailable"); return reviews; } }
};
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => name.endsWith(".module.css") ? { __esModule: true, default: { tabs: "hub-tabs" } } : mocks[name] ?? require(name), module, module.exports);
  return module.exports;
}
const { MarketingSections } = load("components/marketing/marketing-sections.tsx");
const { CustomerHubTabs } = load("components/customers/customer-hub-tabs.tsx");
const { SalesHubTabs } = load("components/sales/sales-hub-tabs.tsx");
const salesProps = { summary: React.createElement("p", null, "共通の売上指標"), sales: React.createElement("p", null, "売上の内容"), accounting: React.createElement("p", null, "経理の内容") };

for (const active of ["promotion", "aio", "reviews"]) {
  const html = renderToStaticMarkup(await MarketingSections({ store, active }));
  assert.match(html, /class="hub-tabs"/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, /要返信 3件/);
}
promotion = false;
assert(!renderToStaticMarkup(await MarketingSections({ store, active: "aio" })).includes("投稿・販促"));
promotion = true; reviews = null;
assert.match(renderToStaticMarkup(await MarketingSections({ store, active: "reviews" })), /件数未取得/);
reviews = { unanswered: 0 };
assert(!renderToStaticMarkup(await MarketingSections({ store, active: "reviews" })).includes("要返信"));
reviews = { unanswered: 3 };
for (const active of ["bookings", "customers", "analysis"]) {
  const html = renderToStaticMarkup(CustomerHubTabs({ storeId: store.id, active, customerLabel: "顧客" }));
  assert.match(html, /class="hub-tabs workbench-tabs"/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(html, new RegExp(`href="/stores/${store.id}/customers\\?tab=${active}" aria-current="page"`));
}
assert.match(renderToStaticMarkup(CustomerHubTabs({ storeId: store.id, active: "customers", customerLabel: "お客様" })), />お客様<\/a>/);
globalThis.window = { history: { replaceState: (_state, _title, url) => { changedUrl = url; } } };
for (const active of ["sales", "accounting", "invalid"]) {
  query = new URLSearchParams(`tab=${active}&keep=filter`);
  const tree = SalesHubTabs(salesProps), html = renderToStaticMarkup(tree);
  assert.match(html, /class="hub-tabs sales-hub-tabs"/);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 1);
  assert.match(html, new RegExp(`id="sales-hub-tab-${active === "accounting" ? "accounting" : "sales"}"[^>]*aria-selected="true"[^>]*tabindex="0"`));
  const buttons = tree.props.children[0].props.children;
  buttons[1].props.onClick();
  assert.match(changedUrl, /tab=accounting&keep=filter$/);
  for (const [index, key, expected] of [[0, "ArrowRight", 1], [1, "ArrowLeft", 0], [0, "End", 1], [1, "Home", 0]]) {
    let prevented = false;
    buttons[index].props.onKeyDown({ key, preventDefault: () => { prevented = true; } });
    assert(prevented); assert.equal(focused, expected);
    assert.match(changedUrl, new RegExp(`tab=${expected ? "accounting" : "sales"}&keep=filter$`));
  }
}
delete globalThis.window;
const css = readFileSync("components/ui/hub-tabs.module.css", "utf8");
for (const file of ["components/marketing/marketing-sections.tsx", "components/sales/sales-hub-tabs.tsx", "components/customers/customer-hub-tabs.tsx"]) assert.match(readFileSync(file, "utf8"), /@\/components\/ui\/hub-tabs\.module\.css/);
assert(!existsSync("components/marketing/marketing-sections.module.css"));
assert.match(css, /a\[aria-current="page"\], button\[aria-selected="true"\]/);
assert.match(css, /:focus-visible/); assert.match(css, /min-height: 44px/); assert.match(css, /flex-wrap: wrap/);
assert(!/\.(?:workbench-tabs|sales-hub-tabs)[\s.{]/.test(readFileSync("app/globals.css", "utf8")), "obsolete global tab styles must not override shared styles");
const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
assert.match(shell, /label: `予約・\$\{navigationLabels\.customer\}`/);
assert(!shell.includes('label: `${navigationLabels.customer}・予約`'));
console.log("PASS hub tabs: shared styles, labels, active states, routes, industry terms, review badges/flags/errors, keyboard/focus, query and panels preserved");

if (process.argv.includes("--preview")) {
  const globals = readFileSync("app/globals.css", "utf8");
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"); query = url.searchParams;
    const marketing = renderToStaticMarkup(await MarketingSections({ store, active: "promotion" }));
    const customers = renderToStaticMarkup(CustomerHubTabs({ storeId: store.id, active: "bookings", customerLabel: "顧客" }));
    const sales = renderToStaticMarkup(SalesHubTabs(salesProps));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>共通タブ・架空UIプレビュー</title><style>${globals}\n${css.replaceAll(".tabs", ".hub-tabs")}\nbody{margin:0;padding:32px;font-family:Arial,'Hiragino Sans',sans-serif}main{max-width:1100px;margin:auto}section{margin:32px 0 44px}h1{font-size:26px}h2{font-size:22px;margin-bottom:18px}@media(max-width:600px){body{padding:16px}h1{font-size:22px}}</style></head><body><main><p>表示確認専用・架空データ／本番変更なし</p><h1>予約・顧客 — タブデザインの統一</h1><section><h2>集客・販促（基準）</h2>${marketing}</section><section><h2>売上・経理</h2>${sales}</section><section><h2>予約・顧客</h2>${customers}</section></main></body></html>`);
  });
  server.listen(3196, "127.0.0.1", () => console.log("Synthetic tab preview: http://localhost:3196"));
}
