import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shell = read("components/layout/app-shell.tsx");
const summary = read("app/api/stores/[storeId]/summary/route.ts");
const labels = read("lib/store-navigation.ts");
const sales = read("app/stores/[storeId]/sales-hub/page.tsx");
const customers = read("app/stores/[storeId]/customers/page.tsx");
const marketing = read("app/stores/[storeId]/marketing/page.tsx");
const inventory = read("app/stores/[storeId]/inventory/page.tsx");
const settings = read("app/stores/[storeId]/settings/page.tsx");
const roadmap = read("docs/menu-architecture-roadmap.md");

for (const label of ["店舗トップ", "AIO改善", "売上・経理", "集客・販促"]) {
  assert.match(shell, new RegExp(`label: "${label}"`, "u"));
}
assert.match(shell, /label: navigationLabels\.customer/u);
assert.match(shell, /label: navigationLabels\.product/u);
assert.doesNotMatch(shell, /label: "データ取り込み"/u);
assert.match(shell, /nav-utility/u);
assert.match(shell, /activeBusinessSection/u);
for (const route of ["customer-segments", "customer-messages", "growth-actions", "growth-calendar", "accounting", "reports"]) assert.match(shell, new RegExp(route, "u"));
for (const route of ["/customers", "/marketing", "/inventory", "/settings"]) assert.match(shell, new RegExp(route.replaceAll("/", "\\/"), "u"));

assert.match(summary, /getStoreNavigationLabels/u);
for (const label of ["メニュー・仕入", "メニュー・店販", "部品・在庫", "施術・備品", "商品・在庫"]) assert.match(labels, new RegExp(label, "u"));

for (const route of ["accounting/receipts", "accounting/exports", "settings/accounting/freee"]) assert.match(sales, new RegExp(route.replaceAll("/", "\\/"), "u"));
for (const label of ["顧客一覧を確認", "顧客を分類", "案内文を準備", "顧客データを取り込む"]) assert.match(customers, new RegExp(label, "u"));
for (const route of ["growth-actions", "growth-calendar", "reviews", "results", "settings/channels"]) assert.match(marketing, new RegExp(route.replaceAll("/", "\\/"), "u"));
assert.doesNotMatch(marketing, /設計中/u);
assert.match(inventory, /getStoreNavigationLabels/u);
assert.match(inventory, /商品・サービス、現在庫、仕入・入荷/u);
assert.match(settings, /AIデータ取り込み/u);

for (const deferred of ["予約管理", "銀行・カードの直接同期", "簡易レジ", "Google・Meta・LINE", "全画面固定AIチャット"]) {
  assert.match(roadmap, new RegExp(deferred, "u"));
}
assert.match(roadmap, /再提案する条件/u);

console.log("Menu architecture checks passed.");
