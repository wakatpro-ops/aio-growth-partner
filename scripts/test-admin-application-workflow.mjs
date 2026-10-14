// Actual server actions + actual page/components, synthetic data only.
// Email, auth and DB writes are replaced in memory. Browser network is blocked.
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import ts from "typescript";
import * as workflow from "../lib/admin/application-workflow.ts";
import * as model from "../lib/applications/operating-model.ts";

const require = createRequire(import.meta.url);
const base = { id: "synthetic", store_name: "テスト店舗（架空）", contact_name: "確認担当", email: "review@example.invalid", status: "new", source_analysis_id: "source", intake_review_status: "pending", payment_status: "unpaid", billing_status: "not_issued", account_status: "not_created", archived_at: null, created_at: "2026-10-14T01:00:00Z", updated_at: "2026-10-14T01:00:00Z", store_count: 1 };
const paid = { ...base, intake_review_status: "approved", payment_status: "paid" };
const done = { ...paid, status: "account_issued", account_status: "invited", store_id: "store", invited_user_id: "user" };
for (const [app, stage] of [
  [base, "review"], [paid, "activate"], [done, "complete"],
  [{ ...base, intake_review_status: "approved" }, "payment"],
  [{ ...base, intake_review_status: "changes_requested" }, "review"],
  [{ ...base, source_analysis_id: null }, "payment"],
  [{ ...base, intake_review_status: "not_required" }, "payment"],
  [{ ...paid, status: "approved", payment_status: "unpaid" }, "payment"],
  [{ ...paid, status: "payment_confirmed", payment_status: "canceled" }, "payment"],
  [{ ...done, invited_user_id: null }, "inconsistent"],
  [{ ...done, archived_at: "2026-10-14" }, "archived"],
  [{ ...paid, intake_review_status: "rejected" }, "stopped"],
  [{ ...paid, status: "declined" }, "stopped"]
]) assert.equal(workflow.applicationWorkflow(app).stage, stage);

let state, forbidden = false, sent = 0;
const db = { from(table) {
  let op = "select", payload, single = false;
  const filters = [];
  const q = {
    select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
    is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; },
    update(p) { op = "update"; payload = p; return q; },
    insert(p) { op = "insert"; payload = p; return q; },
    upsert(p) { op = "insert"; payload = p; return q; },
    maybeSingle() { single = true; return q; },
    then(resolve) {
      const rows = state[table] ??= [];
      let selected = rows.filter(r => filters.every(f => f(r)));
      if (op === "update") selected.forEach(r => Object.assign(r, structuredClone(payload)));
      if (op === "insert") { const r = { id: randomUUID(), ...payload }; rows.push(r); selected = [r]; }
      resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null });
    }
  }; return q;
}, auth: { admin: {
  async generateLink() { return { data: { user: { id: "new-user" } }, error: null }; },
  async updateUserById() { return { error: null }; }
} } };
const load = (path, overrides = {}) => {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", compiled)(name => {
    if (name in overrides) return overrides[name];
    if (name === "server-only") return {};
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "next/navigation") return { redirect(url) { throw new Error("REDIRECT:" + url); }, notFound() { throw new Error("NOT_FOUND"); } };
    if (name.endsWith("application-workflow")) return workflow;
    if (name.endsWith("operating-model")) return model;
    if (name.endsWith("auth/server")) return { async requirePlatformAdmin() { if (forbidden) throw new Error("FORBIDDEN"); return { userId: "admin" }; } };
    if (name.endsWith("supabase/admin")) return { createSupabaseAdminClient: () => db };
    if (name.endsWith("application-emails")) return { async sendApplicationInviteEmail() { sent++; return { ok: true, status: "sent" }; }, async sendIntakeReviewOutcomeEmail() { sent++; return { ok: true, status: "sent" }; } };
    if (name.endsWith("operator-review-token")) return { createOperatorReviewToken: () => "synthetic-token" };
    if (name === "@/config/industries") return { getIndustryConfig: () => ({ defaultFeatureFlags: {} }) };
    if (name.endsWith("applications/options")) return { normalizeIndustryTypeKey: () => "general_store" };
    if (name.endsWith("invite-links")) return { buildScannerSafeInviteUrl: () => "https://example.invalid/invite" };
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
};
const actions = load("lib/admin/applications.ts");
const reset = app => { state = { applications: [structuredClone(app)], application_activity_logs: [] }; sent = 0; forbidden = false; };
const form = data => { const f = new FormData(); Object.entries(data).forEach(([k,v]) => f.set(k,v)); return f; };
const redirected = (fn, pattern) => assert.rejects(fn, pattern);
reset(done);
await redirected(() => actions.updateApplicationSalesAction("synthetic", form({ sales_notes: "追記", status: "new", approval_status: "pending", payment_status: "unpaid" })), /saved=1/);
assert.equal(state.applications[0].status, "account_issued");
assert.equal(state.applications[0].payment_status, "paid");
assert.equal(state.applications[0].sales_notes, "追記");
assert.equal(sent, 0);
reset({ ...base, intake_review_status: "approved" });
await redirected(() => actions.recordApplicationPaymentAction("synthetic", form({})), /error=/);
assert.equal(state.applications[0].payment_status, "unpaid");
await redirected(() => actions.recordApplicationPaymentAction("synthetic", form({ payment_confirmed: "yes" })), /saved=1/);
assert.equal(state.applications[0].payment_status, "paid");
assert.equal(sent, 0);
await redirected(() => actions.recordApplicationPaymentAction("synthetic", form({ payment_confirmed: "yes" })), /error=/);
assert.equal(state.application_activity_logs.length, 1);
reset(base);
await redirected(() => actions.updateApplicationIntakeReviewAction("synthetic", form({ intake_review_status: "approved" })), /error=/);
assert.equal(sent, 0);
await redirected(() => actions.updateApplicationIntakeReviewAction("synthetic", form({ intake_review_status: "approved", review_confirmed: "yes" })), /email=sent/);
assert.equal(sent, 1);
assert.equal(state.applications[0].payment_status, "unpaid");
await redirected(() => actions.updateApplicationIntakeReviewAction("synthetic", form({ intake_review_status: "approved", review_confirmed: "yes" })), /error=/);
assert.equal(sent, 1);
for (const app of [base, done, { ...paid, archived_at: "archived" }, { ...paid, intake_review_status: "rejected" }]) {
  reset(app);
  await redirected(() => actions.approveApplicationStartAction("synthetic", form({ activation_confirmed: "yes" })), /error=/);
  assert.equal(sent, 0);
}
reset(paid); forbidden = true;
for (const action of [actions.approveApplicationStartAction, actions.recordApplicationPaymentAction, actions.updateApplicationIntakeReviewAction, actions.updateApplicationSalesAction, actions.resendApplicationInviteAction]) {
  await assert.rejects(() => action("synthetic", form({})), /FORBIDDEN/);
}
reset(paid);
await redirected(() => actions.approveApplicationStartAction("synthetic", form({ activation_confirmed: "yes" })), /prepared=1/);
assert.equal(state.applications[0].status, "account_issued");
assert.equal(sent, 1);
assert.equal(state.stores.length, 1);
assert.equal(state.organizations.length, 1);
await redirected(() => actions.approveApplicationStartAction("synthetic", form({ activation_confirmed: "yes" })), /error=/);
assert.equal(sent, 1);
assert.equal(state.stores.length, 1);

// Render complete pages with real markup and styles, replacing only external boundaries.
const common = {
  "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/components/layout/app-shell": { AppShell: ({ children }) => React.createElement("main", { style: { padding: 12 } }, children) },
  "@/components/ui/page-header": { PageHeader: ({ title, description, action }) => React.createElement("header", null, React.createElement("h1", null, title), React.createElement("p", null, description), action) },
  "@/components/ui/pending-submit-button": { PendingSubmitButton: ({ children, pendingLabel, className = "button", ...props }) => React.createElement("button", { ...props, className, "data-pending": pendingLabel, type: "submit" }, children) },
  "@/components/ui/confirm-submit-button": { ConfirmSubmitButton: ({ children }) => React.createElement("button", { type: "button" }, children) }
};
const progress = load("components/admin/application-progress.tsx", common);
let fixture = base;
const detail = load("app/admin/applications/[applicationId]/page.tsx", {
  ...common, "@/components/admin/application-progress": progress,
  "@/lib/admin/applications": { ...actions, getApplication: async () => ({ application: fixture, logs: [], emailLogs: [] }) },
  "@/lib/admin/application-emails": { applicationEmailTemplates: [], applicationEmailTemplateLabels: {}, applicationEmailStatusLabels: {}, recommendedApplicationEmailTemplates: () => [], sendApplicationGuideEmailAction() {} }
}).default;
const list = load("app/admin/applications/page.tsx", { ...common, "@/lib/admin/applications": { ...actions, listApplications: async () => [fixture] } }).default;
const browser = await chromium.launch();
const artifacts = mkdtempSync(join(tmpdir(), "application-workflow-"));
try {
  for (const width of [320, 390, 1280]) {
    for (const [label, app, buttons] of [["review", base, 1], ["payment", { ...base, intake_review_status: "approved" }, 1], ["activate", paid, 1], ["complete", done, 0], ["archived", { ...done, archived_at: "yes" }, 0]]) {
      fixture = app;
      const html = renderToStaticMarkup(await detail({ params: Promise.resolve({ applicationId: "synthetic" }), searchParams: Promise.resolve({}) }));
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      await page.route("**/*", route => route.abort());
      await page.setContent(`<html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync("app/globals.css", "utf8")}</style></head><body>${html}</body></html>`);
      assert.equal(await page.locator(".application-progress button:visible").count(), buttons);
      assert.equal(await page.locator('select[name="approval_status"],select[name="status"],select[name="payment_status"]').count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + " overflow " + width);
      if (buttons) assert.equal(await page.locator(".application-progress form").evaluate(el => el.checkValidity()), false);
      if (label === "complete" || label === "review") await page.screenshot({ path: join(artifacts, `${label}-${width}.png`) });
      await page.locator(".application-detail > details").evaluateAll(els => els.forEach(el => el.open = true));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + " expanded overflow " + width);
      await page.close();
    }
    fixture = done;
    const html = renderToStaticMarkup(await list({ searchParams: Promise.resolve({}) }));
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(`<style>${readFileSync("app/globals.css", "utf8")}</style>${html}`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "list overflow");
    await page.close();
  }
} finally { await browser.close(); }
console.log("PASS workflow states, guarded actions, memo isolation, role denial, full-page layouts 320/390/1280:", artifacts);
