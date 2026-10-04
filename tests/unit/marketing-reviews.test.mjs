import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
function fixture() {
  const store = { id: "s", organization_id: "o" };
  const state = { allowed: true, error: false, db: true, queries: [], connections: [{ id: "c", status: "connected" }], locations: [{ id: "l", google_oauth_connection_id: "c", is_selected: true, archived_at: null }], reviews: [
    { id: "1", google_reply_text: null, reply_status: "draft" },
    { id: "2", google_reply_text: "", reply_status: "approved" },
    { id: "3", google_reply_text: "公開返信", reply_status: "draft" },
    { id: "4", google_reply_text: null, reply_status: "published" },
    { id: "5", google_reply_text: null, reply_status: "error" }
  ].map(r => ({ ...r, store_id: "s", organization_id: "o", google_business_location_id: "l" })) };
  const db = { from(table) {
    let rows = table === "google_oauth_connections" ? state.connections : table === "google_business_locations" ? state.locations : state.reviews;
    const q = { table, calls: [], head: false, rangeValue: null,
      select(fields, options) { this.calls.push(["select", fields, options]); this.head = options?.head; return this; },
      eq(key, value) { this.calls.push(["eq", key, value]); if (key in (rows[0] ?? {})) rows = rows.filter(r => r[key] === value); return this; },
      is(key, value) { this.calls.push(["is", key, value]); rows = rows.filter(r => r[key] === value); return this; },
      in(key, value) { this.calls.push(["in", key, value]); rows = rows.filter(r => value.includes(r[key])); return this; },
      or(value) { assert.equal(value, 'google_reply_text.is.null,google_reply_text.eq.""'); rows = rows.filter(r => r.google_reply_text === null || r.google_reply_text === ""); return this; },
      neq(key, value) { rows = rows.filter(r => r[key] !== value); return this; },
      order() { return this; }, range(a, b) { this.rangeValue = [a, b]; return this; },
      then(resolve) { state.queries.push(this); const count = rows.length; return Promise.resolve(resolve({ error: state.error ? {} : null, count, data: this.head ? null : this.rangeValue ? rows.slice(this.rangeValue[0], this.rangeValue[1] + 1) : rows })); }
    }; return q;
  } };
  const service = load("lib/marketing/reviews.ts", { "server-only": {}, react: { cache: fn => fn }, "@/lib/stores": { getStore: async id => { if (!state.allowed || id !== store.id) throw new Error("forbidden"); return store; } }, "@/lib/supabase/admin": { createSupabaseAdminClient: () => state.db ? db : null } });
  return { state, ...service };
}
test("exact pending count, tenant and selected active location boundary, published vs drafts", async () => {
  const f = fixture();
  f.state.reviews.push({ ...f.state.reviews[0], store_id: "other" }, { ...f.state.reviews[0], organization_id: "other" }, { ...f.state.reviews[0], google_business_location_id: "old" });
  assert.deepEqual(await f.getReviewSummary("s"), { connected: true, unanswered: 3, locationIds: ["l"] });
  for (const q of f.state.queries) {
    assert(q.calls.some(c => c[0] === "eq" && c[1] === "store_id" && c[2] === "s"));
    assert(q.calls.some(c => c[0] === "eq" && c[1] === "organization_id" && c[2] === "o"));
  }
  assert.equal((await f.getReviewPage("s", 1, false)).reviews.length, 3);
  assert.equal((await f.getReviewPage("s", 1, true)).reviews.length, 5);
});
test("more than 100 reviews counted and paginated without hiding old pending replies", async () => {
  const f = fixture(); f.state.reviews = Array.from({ length: 121 }, (_, i) => ({ ...f.state.reviews[0], id: String(i) }));
  assert.equal((await f.getReviewSummary("s")).unanswered, 121);
  const last = await f.getReviewPage("s", 7, false); assert.equal(last.count, 121); assert.equal(last.reviews.length, 1);
});
test("disconnected, unmatched, unselected and archived Google locations", async () => {
  for (const change of [f => { f.state.connections[0].status = "disconnected"; }, f => { f.state.connections[0].id = "other"; }, f => { f.state.locations[0].is_selected = false; }, f => { f.state.locations[0].archived_at = "2026-10-01"; }]) {
    const f = fixture(); change(f); assert.equal((await f.getReviewSummary("s")).connected, false);
  }
});
test("read failures never become zero counts, unauthorized reads stop before DB", async () => {
  const f = fixture(); f.state.error = true; await assert.rejects(() => f.getReviewSummary("s"));
  f.state.error = false; f.state.db = false; await assert.rejects(() => f.getReviewSummary("s"));
  f.state.allowed = false; f.state.queries = []; await assert.rejects(() => f.getReviewSummary("s"), /forbidden/); assert.equal(f.state.queries.length, 0);
});
test("legacy route preserves query feedback", async () => {
  const { default: page } = load("app/stores/[storeId]/reviews/page.tsx", { "next/navigation": { redirect: href => { throw new Error(href); } } });
  await assert.rejects(() => page({ params: Promise.resolve({ storeId: "s" }), searchParams: Promise.resolve({ saved: "1", filter: "all" }) }), /\/stores\/s\/marketing\/reviews\?saved=1&filter=all/);
});
