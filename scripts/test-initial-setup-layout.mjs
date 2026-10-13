// Render the real form with synthetic props; no network, auth, or writes.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import ts from "typescript";
import { normalizeOperatingModel } from "../lib/applications/operating-model.ts";

const require = createRequire(import.meta.url);
const source = readFileSync("app/onboarding/setup-review/initial-setup-review-form.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const mod = { exports: {} };
new Function("require", "module", "exports", compiled)(name => {
  if (name === "./actions") return { confirmInitialSetupAction() {}, saveInitialSetupDraftAction() {} };
  if (name === "next/link") return { default: ({ children, ...props }) => React.createElement("a", props, children) };
  if (name.includes("pending-submit-button")) return { PendingSubmitButton: ({ pendingLabel, children, ...props }) => React.createElement("button", { ...props, "data-pending-label": pendingLabel }, children) };
  return require(name);
}, mod, mod.exports);
const branch = { name: "デモサロン 新宿支店", address: "東京都新宿区新宿1丁目", websiteUrl: "https://example.invalid/shinjuku", companyName: "デモ法人", brandName: "デモサロン" };
const model = normalizeOperatingModel({ structure: { mode: "multi_store", locations: [branch] } });
const review = {
  store: { id: "synthetic", name: "デモサロン 巣鴨本店", industry_type_key: "beauty_salon", address: "東京都豊島区巣鴨" },
  snapshotId: "synthetic", operatingModel: model, additionalLocations: [branch], menus: [],
  invoice: { issuerName: "デモ法人", registrationNumber: "", prefix: "INV" },
  industryOptions: [], industryPresets: {}, aiRecommendedFeatures: [], evidenceSources: [],
  preparedSummary: {}, savedDraft: null, savedDraftStep: 8, savedSkippedSteps: [],
  dataImport: { status: null, successRows: 0, counts: { item: 0 } }
};
const render = () => renderToStaticMarkup(React.createElement(mod.exports.InitialSetupReviewForm, { review }));
const html = render();
assert(!html.includes('name="location_enabled_0"'));
// A previously saved automatic selection must not be silently re-enabled.
review.savedDraft = { operatingModel: model, menus: [], additionalLocations: [{ ...branch, sourceKey: "initial-store:synthetic:0", enabled: true }] };
assert(!render().includes('name="location_enabled_0"'));
review.savedDraft = null;
review.operatingModel = normalizeOperatingModel({ structure: { mode: "single_store" } });
assert(!render().includes("別の店舗も追加しますか？"));
review.operatingModel = model;

const browser = await chromium.launch();
const artifacts = mkdtempSync(join(tmpdir(), "setup-layout-"));
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route("**/*", route => route.abort());
    await page.setContent(`<html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}</style></head><body><main style="padding:12px">${html}</main></body></html>`);
    assert(await page.getByText("別の店舗も追加しますか？").isVisible());
    assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 0);
    assert.equal(await page.getByText("別の店舗も追加しますか？").evaluate(el => Boolean(el.closest("details"))), false);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}`);
    await page.locator(".setup-final-summary").screenshot({ path: join(artifacts, `${width}.png`) });
    await page.close();
  }
} finally { await browser.close(); }
console.log(`PASS fresh/resumed/single-store form defaults; mobile and desktop layout: ${artifacts}`);
