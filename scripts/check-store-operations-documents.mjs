import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const onboarding = read("app/onboarding/setup-review/initial-setup-review-form.tsx");
const operations = read("app/stores/[storeId]/settings/operations/page.tsx");
const sidebar = read("components/layout/app-shell.tsx");
const inventory = read("app/stores/[storeId]/inventory/page.tsx");
const inventoryServer = read("lib/inventory-operations.ts");
const documentForm = read("components/phase2/document-form.tsx");
const styles = read("app/globals.css");

assert.doesNotMatch(onboarding, /\["aio_boost", "AIO boostで管理する"\]/u);
assert.doesNotMatch(onboarding, /\["simple_register", "AIO boostの簡易会計を使う"\]/u);
for (const label of ["既存の予約サービスを使う", "電話・LINE・紙などで管理する", "CSV・Excelで売上を取り込む", "後で決める"]) assert.match(onboarding, new RegExp(label));
assert.match(operations, /AIO boost予約管理（準備中・変更してください）/u);
assert.match(operations, /AIO boost簡易レジ（準備中・変更してください）/u);

assert.match(sidebar, /label: navigationLabels\.product/u);
for (const field of ["supplier_name", "purchase_date", "unit_cost"]) {
  assert.match(inventory, new RegExp(`name="${field}"`));
  assert.match(inventoryServer, new RegExp(field));
}
assert.match(inventory, /仕入レシートを読み取る/u);
assert.match(inventory, /在庫表をまとめて取り込む/u);

assert.match(documentForm, /^"use client";/u);
assert.match(documentForm, /document-preview-pane/u);
assert.match(documentForm, /document-fields-pane/u);
assert.match(documentForm, /PairMarker number=\{1\}/u);
assert.match(documentForm, /PairMarker number=\{5\}/u);
assert.match(styles, /\.document-editor[\s\S]*grid-template-columns/u);
assert.match(styles, /@media \(max-width: 1120px\)[\s\S]*\.document-editor \{ grid-template-columns: 1fr;/u);

console.log("Store operations and paired document editor checks passed.");
