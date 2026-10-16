// Render the actual components using synthetic data only. Inspect these files in CUA.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as menus from "../lib/onboarding/menu-candidates.ts";
import * as menuRules from "../lib/menu-workbench-rules.ts";
import { normalizeOperatingModel } from "../lib/applications/operating-model.ts";
const require = createRequire(import.meta.url);
const modules = {};
function load(path, extra = "") {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(path, "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function("require", "module", "exports", js)(name => {
    if (name in modules) return modules[name];
    if (name === "./actions" || name.endsWith("inventory/actions")) return { confirmInitialSetupAction() {}, saveInitialSetupDraftAction() {}, setAvailabilityAction() {} };
    if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}
modules["@/lib/onboarding/menu-candidates"] = menus;
modules["@/lib/menu-workbench-rules"] = menuRules;
modules["@/components/ui/pending-submit-button"] = load("components/ui/pending-submit-button.tsx");
modules["@/components/ui/data-visuals"] = load("components/ui/data-visuals.tsx");
const { MenuQuestion, InitialSetupReviewForm } = load("app/onboarding/setup-review/initial-setup-review-form.tsx", "\nexport { MenuQuestion };\n");
const { MenuCards } = load("components/menu/menu-cards.tsx");
const { ItemForm } = load("components/phase2/item-form.tsx");
const candidates = menus.setupMenuCandidates({ services: ["ランチ", "個室利用"], menu_candidates: [{ name: "季節の野菜たっぷりランチセット", unitPrice: 1200, taxInclusion: "inclusive", sourceUrl: "https://example.invalid/menu", evidence: "季節の野菜たっぷりランチセット 1200円（税込）" }] }).map(item => ({ ...item, enabled: false, confirmed: false, freeConfirmed: false }));
const item = { id: "synthetic-pending", name: "ランチ", status: "active", unit_price: 0, item_type: "service", tax_rate: 10, unit: "回", cost_price: 0, is_stock_managed: false, metadata: { initial_setup_candidate: true } };
const render = element => renderToStaticMarkup(element);
const review = { store: { id: "synthetic", name: "架空カフェ", industry_type_key: "restaurant" }, snapshotId: "synthetic", menus: candidates,
  operatingModel: normalizeOperatingModel({}), additionalLocations: [], invoice: { issuerName: "架空法人", prefix: "INV", registrationNumber: "" },
  industryPresets: {}, industryOptions: [], evidenceSources: [], preparedSummary: {}, savedDraftStep: 6, savedSkippedSteps: [], dataImport: { counts: { item: 0 } },
  savedDraft: { menus: [{ name: "ランチ", enabled: true, unitPrice: 0 }], additionalLocations: [] } };
const resumed = render(React.createElement(InitialSetupReviewForm, { review }));
assert(!resumed.includes('name="menu_enabled_0"')); assert(!resumed.includes('name="menu_confirmed_0"'));
assert(resumed.includes('name="menu_unit_price_1" value=""'));
const question = render(React.createElement(MenuQuestion, { menus: candidates, importedCount: 0, showEditor: true, onToggleEditor() {}, onMenuChange() {}, onNext() {} }));
assert(!question.includes("すべて登録して進む")); assert(question.includes('placeholder="価格未設定"')); assert(!question.includes('checked=""'));
const cards = render(React.createElement(MenuCards, { storeId: "synthetic", items: [item, { ...item, id: "priced", name: "季節の野菜セット", unit_price: 1200, metadata: { tax_inclusion: "inclusive", price_confirmed: true } }, { ...item, id: "free", name: "無料ドリンク", metadata: { price_confirmed: true, tax_inclusion: "inclusive" } }], manager: true, operate: true }));
assert(cards.includes("価格未設定") && cards.includes("1,200円") && cards.includes("0円"));
const edit = render(React.createElement(ItemForm, { item, labels: { product: "料理", part: "食材", service: "サービス" }, industryTypeKey: "restaurant", action() {} }));
assert(edit.includes('name="catalogue_confirmed"')); assert(!/id="unit_price"[^>]*value="0"/u.test(edit));
const directory = "test-results/onboarding-menu"; mkdirSync(directory, { recursive: true });
for (const [name, content] of Object.entries({ question, cards, edit })) writeFileSync(`${directory}/${name}.html`, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}</style></head><body><main style="max-width:1050px;margin:auto;padding:20px"><p class="eyebrow">動作検証用・架空データ</p><h1>${name === "question" ? "登録するメニューを確認" : name === "cards" ? "商品・メニュー" : "商品名と価格を確認"}</h1>${content}</main></body></html>`);
console.log(`PASS actual components: legacy draft/price, explicit confirmation, source evidence. Visual files: ${directory}`);
