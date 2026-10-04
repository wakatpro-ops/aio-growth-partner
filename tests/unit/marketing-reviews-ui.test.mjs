import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const store = { id: "test-store", organization_id: "org", industry_type_key: "restaurant" };
async function render({ edit = true, failed = false, status = "draft", published = false } = {}) {
  const wrap = ({ children }) => React.createElement("div", null, children);
  const mocks = {
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/marketing/marketing-sections": { MarketingSections: () => React.createElement("nav", null, "Google口コミ") },
    "@/components/marketing/aio-function-list": { AioFunctionList: ({ badge, children }) => React.createElement("details", null, React.createElement("summary", null, `機能一覧 ${badge ?? ""}`), children) },
    "@/lib/marketing/reviews": { getReviewSummary: async () => { if (failed) throw new Error("db"); return { unanswered: 121, connected: true }; }, getReviewPage: async () => { if (failed) throw new Error("db"); return { count: 121, reviews: [{ id: "r", reply_status: status, google_reply_text: published ? "返信済み" : null, google_updated_at: null, comment: "合成口コミ" }] }; } },
    "@/lib/auth/server": { canEditStore: async () => edit },
    "@/lib/phase5/google-business-policy": { googleBusinessApiApproved: () => true },
    "@/components/ai/ai-generator": { AiGenerator: () => React.createElement("div", null, "AI返信案") },
    "@/components/layout/app-shell": { AppShell: wrap },
    "@/components/phase2/store-business-nav": { StoreBusinessNav: () => null },
    "@/components/ui/page-header": { PageHeader: () => null },
    "@/components/ui/pending-submit-button": { PendingSubmitButton: ({ children, disabled }) => React.createElement("button", { disabled }, children) },
    "@/config/industries": { getIndustryConfig: () => ({ name: "飲食店", reviewLabel: "口コミ返信" }) },
    "@/lib/phase5/google-integrations": { getGoogleIntegrationState: async () => ({ locations: [{ is_selected: true, title: "合成店舗" }] }) },
    "@/lib/stores": { getStore: async () => store },
    "../../growth-actions/actions": Object.fromEntries(["approveGoogleReviewReplyAction", "publishGoogleReviewReplyAction", "saveGoogleReviewReplyDraftAction", "syncGoogleBusinessReviewsAction"].map(key => [key, () => {}]))
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync("app/stores/[storeId]/marketing/reviews/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText)(name => mocks[name] ?? require(name), module, module.exports);
  return renderToStaticMarkup(await module.exports.default({ params: Promise.resolve({ storeId: store.id }), searchParams: Promise.resolve({}) }));
}
test("tools default closed, pending badge visible, 20-row pagination retained", async () => {
  const html = await render();
  assert(html.includes("<details><summary>機能一覧 要返信 121件</summary>"));
  assert(html.includes("返信下書きを保存") && html.includes("この返信を承認") && html.includes("次の20件"));
  assert(!html.includes("承認済み返信をGoogleへ反映"));
});
test("viewer cannot see mutating reply controls or AI generation", async () => {
  const html = await render({ edit: false });
  for (const text of ["返信下書きを保存", "この返信を承認", "承認済み返信をGoogleへ反映", "AI返信案を個別に作る"]) assert(!html.includes(text));
  assert(html.includes("disabled=\"\""));
});
test("approved reply preserves explicit publish control, failure is not empty", async () => {
  assert((await render({ status: "approved" })).includes("承認済み返信をGoogleへ反映"));
  const html = await render({ failed: true });
  assert(html.includes("未返信0件という意味ではありません"));
  assert(!html.includes("このページに返信が必要な口コミはありません"));
});
