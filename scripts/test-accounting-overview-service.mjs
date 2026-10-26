// Synthetic only. No DB, AI or external data access.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import ts from "typescript";

const store = { id: "synthetic-store", organization_id: "synthetic-org" };
let permission = "org_owner", active = true, fail = false, calls = [], records = [];
const access = () => active ? { accountActive: true, isPlatformAdmin: permission === "platform_admin", organizationRoles: { [store.organization_id]: permission }, storeRoles: {} } : null;
const db = { from(table) {
  assert.equal(table, "expense_receipts"); let filters = [], page, single = false, head = false, order;
  const q = { select(fields, options) { assert(!fields.includes("*")); head = options?.head; return q; },
    eq(k, v) { filters.push(r => r[k] === v); return q; }, is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; },
    not(k, op, v) { assert.equal(op, "is"); assert.equal(v, null); filters.push(r => r[k] != null); return q; },
    gte(k, v) { filters.push(r => r[k] >= v); return q; }, lt(k, v) { filters.push(r => r[k] < v); return q; },
    order(k, options) { order = { k, ascending: options?.ascending !== false }; return q; }, limit(n) { page = [0, n - 1]; return q; },
    range(a, b) { page = [a, b]; return q; }, maybeSingle() { single = true; return q; },
    then(done, reject) { try {
      calls.push({ page }); let data = records.filter(r => filters.every(fn => fn(r)));
      if (order) data.sort((a, b) => String(a[order.k]).localeCompare(String(b[order.k])) * (order.ascending ? 1 : -1));
      const count = data.length; if (page) data = data.slice(page[0], page[1] + 1);
      done({ error: fail ? new Error("PRIVATE_ERROR") : null, data: head ? null : single ? data[0] ?? null : data, count });
    } catch(e) { reject(e); } }
  }; return q;
} };
const mocks = { "server-only": {}, "@/lib/auth/server": { getCurrentUserAccess: async () => access() },
  "@/lib/auth/access-policy": { mayReadStore: (a, s, o) => active && s === store.id && o === store.organization_id && permission !== "foreign" },
  "@/lib/menu-workbench-rules": { menuPermissions: a => ({ manager: !!a && ["org_owner", "store_manager", "platform_admin"].includes(permission) }) },
  "@/lib/stores": { getStore: async () => store }, "@/lib/customer-workbench-rules": { japanDay: () => "2026-10-26" },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db } };
function source(file) {
  const loaded = { exports: {} };
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(s => mocks[s] ?? source(s.startsWith("@/") ? `${s.slice(2)}.ts` : resolve(dirname(file), `${s}.ts`)), loaded, loaded.exports);
  return loaded.exports;
}
const { getAccountingOverview } = source("lib/accounting/overview.ts");
const row = (i, extra = {}) => ({ id: String(i).padStart(5, "0"), store_id: store.id, organization_id: store.organization_id, receipt_date: "2026-09-12", total_amount: 100, category_name: "仕入", approval_status: "approved", ...extra });
records = Array.from({ length: 1205 }, (_, i) => row(i));
records.push(row("foreign", { store_id: "another-store", total_amount: 987654321 }), row("org", { organization_id: "another-org" }), row("archived", { archived_at: "2026-09-01" }), row("undated", { receipt_date: null }));
const report = await getAccountingOverview(store.id);
assert.equal(report.state, "ready"); assert.equal(report.report.month, "2026-09"); assert.equal(report.report.count, 1205); assert.equal(report.report.total, 120500); assert.equal(report.undatedCount, 1);
assert.deepEqual(calls.filter(c => c.page?.[1] > 1).map(c => c.page), [[0,499], [500,999], [1000,1499]]);
assert.equal((await getAccountingOverview(store.id, "2026-10")).report.count, 0);
for (permission of ["staff", "viewer", "foreign"]) { calls = []; assert.equal((await getAccountingOverview(store.id)).state, "restricted"); assert.equal(calls.length, 0); }
permission = "store_manager"; assert.equal((await getAccountingOverview(store.id)).state, "ready");
permission = "platform_admin"; assert.equal((await getAccountingOverview(store.id)).state, "ready");
active = false; calls = []; assert.equal((await getAccountingOverview(store.id)).state, "restricted"); assert.equal(calls.length, 0); active = true;
fail = true; assert.equal((await getAccountingOverview(store.id)).state, "unavailable"); fail = false;
records = []; assert.equal((await getAccountingOverview(store.id)).report.month, "2026-10");
console.log("Accounting overview: complete pagination, org/store/archive isolation, financial roles, empty/error and month boundaries passed.");
