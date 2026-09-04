import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const visuals = read("components/ui/data-visuals.tsx");
const sales = read("app/stores/[storeId]/sales-hub/page.tsx");
const inventory = read("app/stores/[storeId]/inventory/page.tsx");
const customers = read("app/stores/[storeId]/customers/page.tsx");
const items = read("app/stores/[storeId]/items/page.tsx");
const marketing = read("app/stores/[storeId]/marketing/page.tsx");
const commandCenter = read("components/dashboard/store-command-center.tsx");
const css = read("app/globals.css");

for (const component of ["DonutChart", "HorizontalBarChart", "StatusBar", "ItemThumbnail"]) {
  assert.match(visuals, new RegExp(`export function ${component}`, "u"));
}
assert.match(sales, /売上上位の商品・メニュー/u);
assert.match(sales, /支払方法の割合/u);
assert.match(inventory, /発注が必要なものから確認/u);
assert.match(inventory, /利用可能在庫/u);
assert.match(customers, /来店状況/u);
assert.match(customers, /連絡可否/u);
assert.match(items, /写真で確認/u);
assert.match(marketing, /投稿の準備状況/u);
assert.match(commandCenter, /ScoreGauge/u);
assert.match(commandCenter, /Sparkline/u);
assert.match(commandCenter, /command-social-image/u);
assert.match(css, /\.visual-grid\.cols-3/u);
assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.visual-grid\.cols-2/u);
assert.match(css, /\.visual-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u);
assert.match(visuals, /role="img"/u);

console.log("visual-first store page checks passed");
