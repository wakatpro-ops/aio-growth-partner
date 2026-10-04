import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const root = "app/stores/[storeId]/marketing/aio-improvement";
const store = { id: "815c5f9a-427d-473b-bc0e-580f65ea1815", organization_id: "synthetic", industry_type_key: "restaurant", feature_flags: {} };
let allowed = true, promotion = true, failSave = false;
const events = [];
const redirect = href => { throw Object.assign(new Error("redirect"), { href }); };
const mocks = {
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  "next/navigation": { redirect },
  "next/cache": { revalidatePath: path => events.push(["revalidate", path]) },
  "@/lib/auth/store-action-access": { requireStoreActionWriteAccess: async id => { events.push(["authorize", id]); if (!allowed) throw new Error("forbidden"); } },
  "@/lib/feature-flags/resolve-feature-flags": { resolveFeatureFlags: s => s.feature_flags, isFeatureEnabled: () => promotion },
  "@/lib/aio-improvement": Object.fromEntries(["saveAioGoalFromForm", "runAioRediagnosis", "startAioImprovementTask", "updateAioImprovementTaskFromForm"].map(name => [name, async (...args) => { events.push([name, ...args]); if (failSave) throw new Error("validation failed"); return "task-123"; }]))
};
function load(file) {
  const path = resolve(file), loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (mocks[name]) return mocks[name];
    if (name.endsWith(".module.css")) return { __esModule: true, default: { sections: "marketing-sections" } };
    if (name.startsWith(".")) return load(resolve(dirname(path), `${name}.ts`));
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const { resolveAiPage } = load("lib/store-ai/context-rules.ts");
for (const tail of ["", "/history", "/tasks/00000000-0000-4000-8000-000000000001"]) {
  assert.equal(resolveAiPage(store.id, `/stores/${store.id}/marketing/aio-improvement${tail}`).area, "aio");
  assert.equal(resolveAiPage(store.id, `/stores/${store.id}/aio-improvement${tail}`).area, "aio");
}
assert.equal(resolveAiPage(store.id, `/stores/${store.id}/marketing`).area, "marketing");
assert.equal(resolveAiPage(store.id, `/stores/${store.id}/marketing/drafts`).area, "marketing");
assert.equal(resolveAiPage(store.id, `/stores/${store.id}/marketing/aio-improvement/tasks/00000000-0000-4000-8000-000000000001`).recordId, "00000000-0000-4000-8000-000000000001");
assert.throws(() => resolveAiPage(store.id, "/stores/another-store/marketing/aio-improvement"), /invalid_page/);

const { MarketingSections } = load("components/marketing/marketing-sections.tsx");
for (const active of ["promotion", "aio"]) {
  const html = renderToStaticMarkup(React.createElement(MarketingSections, { store, active }));
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  assert(html.includes(`/stores/${store.id}/marketing/aio-improvement`));
  assert(html.includes("投稿・販促") && html.includes("検索・AI対策"));
}
promotion = false;
assert(!renderToStaticMarkup(React.createElement(MarketingSections, { store, active: "aio" })).includes("投稿・販促"));

const actions = load(`${root}/actions.ts`);
for (const [name, args, target] of [
  ["saveAioGoalAction", [store.id, new FormData()], "?goalSaved=1#questions"],
  ["runAioRediagnosisAction", [store.id], "?rediagnosed=1#rediagnosis"],
  ["startAioImprovementTaskAction", [store.id, "profile"], "/tasks/task-123?started=1"],
  ["updateAioImprovementTaskAction", [store.id, "task-123", new FormData()], "/tasks/task-123?saved=1"]
]) {
  allowed = true; events.length = 0;
  await assert.rejects(() => actions[name](...args), error => error.href === `/stores/${store.id}/marketing/aio-improvement${target}`);
  assert.equal(events[0][0], "authorize");
  assert(events.some(event => event[0] === "revalidate" && event[1] === `/stores/${store.id}/marketing/aio-improvement`));
  allowed = false; events.length = 0;
  await assert.rejects(() => actions[name](...args), /forbidden/);
  assert.equal(events.length, 1, "denied users cannot read/write via actions");
}
allowed = true; failSave = true;
await assert.rejects(() => actions.saveAioGoalAction(store.id, new FormData()), error => error.href === `/stores/${store.id}/marketing/aio-improvement?error=validation%20failed#questions`);

const rules = await load("next.config.ts").default.redirects();
assert.equal(rules.length, 2);
assert(rules.every(rule => !rule.permanent && rule.destination.startsWith("/stores/:storeId/marketing/aio-improvement")));
assert.equal(rules[1].source, "/stores/:storeId/aio-improvement/:path+");
const shell = readFileSync("components/layout/app-shell.tsx", "utf8");
assert(!shell.includes('label: "AIO改善"'));
for (const page of ["page.tsx", "history/page.tsx", "tasks/[taskId]/page.tsx"]) {
  const source = readFileSync(`${root}/${page}`, "utf8");
  assert(source.includes('<MarketingSections store={store} active="aio" />'));
  assert(source.includes("await getStore(storeId)") || source.includes("await getAioImprovementWorkspace(storeId)"));
}
const marketing = readFileSync("app/stores/[storeId]/marketing/page.tsx", "utf8");
for (const label of ["今日の集客アクション", "投稿下書き", "投稿・配信カレンダー", "Google口コミ", "集客・検索成果", "連携先を確認"]) assert(marketing.includes(label));
assert(marketing.includes('<details className="card"><summary>機能一覧から選ぶ</summary>'));
assert(!marketing.includes('className="hub-link'));
assert(marketing.includes('if (!isFeatureEnabled(flags, "marketing_drafts")) redirect('));
console.log("PASS marketing/AIO: routes, context, tenant boundary, flags, authorized actions, redirects, revalidation, collapsed feature navigation");
