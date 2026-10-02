// Opt-in, staging-only integration. Uses only new synthetic UUID fixtures and keeps all keys in memory.
// No browser automation, production endpoint, environment-file loading, or private workbook access.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import ts from "typescript";
import * as dates from "../lib/import-date.ts";
import * as parser from "../lib/unified-import/parser.ts";
import * as legacyParser from "../lib/phase4/import-parser.ts";
import * as saleGroups from "../lib/unified-import/sales-groups.ts";
import * as values from "../lib/unified-import/value-validation.ts";
import * as version from "../lib/unified-import/version.ts";
import * as storageNames from "../lib/storage-object-name.ts";

assert(process.argv.includes("--staging-synthetic"), "Pass --staging-synthetic to authorize disposable staging fixtures");
const ref = "zlqqjifitnvorudxbepy";
function cli(args) {
  try { return JSON.parse(execFileSync("/opt/homebrew/bin/supabase", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
  catch { throw new Error("Supabase CLI verification failed; no CLI credential output is exposed."); }
}
const projects = cli(["projects", "list", "--output", "json"]);
const project = projects.find((item) => item.id === ref);
assert.equal(project?.name, "aio-growth-partner-staging");
assert.equal(project?.organization_id, "gprkjuklwwjleoktmpvp");
const keys = cli(["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"]);
const secret = keys.find((key) => key.name === "aio_staging_vercel" && key.type === "secret")?.api_key;
const publicKey = keys.find((key) => key.type === "publishable")?.api_key;
assert(secret && publicKey, "Expected existing staging keys are required");
const url = `https://${ref}.supabase.co`;
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const orgId = randomUUID(), storeId = randomUUID(), itemId = randomUUID();
const store = { id: storeId, organization_id: orgId, industry_type_key: "general_store", name: "IMPORT SYNTHETIC ONLY" };
const users = [], checks = [];
let activeRole = "owner";
const checked = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
const count = async (table) => { const result = await db.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId); checked(result); return result.count; };
const unexpected = () => { throw new Error("Out-of-scope service called by staging test"); };
const modules = {
  "server-only": {}, "node:crypto": { createHash, randomUUID },
  "@/lib/auth/server": { getCurrentUserAccess: async () => ({ userId: users[activeRole === "owner" ? 0 : 1]?.id, isPlatformAdmin: false, organizationRoles: activeRole === "owner" ? { [orgId]: "org_owner" } : {}, storeRoles: {} }) },
  "@/lib/stores": { getStore: async (id) => { assert.equal(id, storeId, "Service is restricted to this run's generated store UUID"); return store; } },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
  "@/lib/import-date": dates,
  "@/lib/unified-import/parser": parser,
  "@/lib/unified-import/sales-groups": saleGroups,
  "@/lib/unified-import/value-validation": values,
  "@/lib/unified-import/version": version,
  "@/lib/storage-object-name": storageNames,
  "@/lib/phase4/import-parser": legacyParser,
  "@/lib/inventory-operations": { applyImportedSaleInventory: unexpected, syncOrderInventory: unexpected },
  "@/lib/phase4/demand-actions": { generateDemandActionPlan: unexpected }
};
function loadService(file) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`);
    return modules[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}
modules["@/lib/phase6/compliance-data"] = loadService("../lib/phase6/compliance-data.ts");
modules["@/lib/phase4/sales-import-data"] = loadService("../lib/phase4/sales-import-data.ts");
const service = loadService("../lib/unified-import/data.ts");
function fileFor(matrix, name) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), "合成表");
  return new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function matrixFile() {
  const book = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([["2026年分"], ["月", "合計"], ["1月", 80]]);
  summary.B3 = { t: "n", v: 80, f: "'1月'!E10" };
  XLSX.utils.book_append_sheet(book, summary, "累計");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    [], [null, null, "1月"], [null, null, "総合計"], [null, null, null, "Synthetic Summary Item", "合計"],
    [null, "件数", "1日", 2, 2], [null, "金額", null, 100, 100],
    [null, null, "2日", 1, 1], [null, null, null, -20, -20],
    [null, null, "合計", 3, 3], [null, null, null, 80, 80]
  ]), "1月");
  return new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], "synthetic-month.xlsx");
}
async function upload(file) {
  const form = new FormData(); form.set("file", file);
  return service.uploadUnifiedImportFile(storeId, form);
}

try {
  checked(await db.from("organizations").insert({ id: orgId, name: "IMPORT SYNTHETIC ONLY", status: "active" }));
  checked(await db.from("stores").insert({ ...store, status: "active" }));
  for (const role of ["owner", "outsider"]) {
    const email = `import-${role}-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa9!`;
    const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
    users.push({ id: user.id, email, password });
    checked(await db.from("user_profiles").upsert({ user_id: user.id, display_name: "IMPORT SYNTHETIC ONLY", role: "user", status: "active" }));
  }
  checked(await db.from("organization_members").insert({ organization_id: orgId, user_id: users[0].id, role_key: "org_owner", status: "active" }));
  checked(await db.from("items").insert({ id: itemId, organization_id: orgId, store_id: storeId, industry_type_key: "general_store", name: "Synthetic Summary Item", unit: "個", unit_price: 100, is_stock_managed: true }));
  checked(await db.from("inventory_stocks").insert({ item_id: itemId, organization_id: orgId, store_id: storeId, quantity: 7 }));

  const monthly = await upload(matrixFile());
  const preview = await service.getUnifiedImportJob(storeId, monthly.jobId);
  assert.equal(preview.rows.length, 2);
  assert(preview.job.sheet_summaries.some((sheet) => sheet.requiresConfirmation));
  await service.saveUnifiedImportReview(storeId, monthly.jobId, new FormData());
  await assert.rejects(() => service.executeUnifiedImport(storeId, monthly.jobId));
  assert.equal(await count("sales_transactions"), 0);
  const confirm = new FormData();
  preview.job.sheet_summaries.forEach((sheet, index) => { if (sheet.requiresConfirmation) confirm.set(`sheet_confirm_${index}`, "on"); });
  assert.equal((await service.saveUnifiedImportReview(storeId, monthly.jobId, confirm)).unresolved, 0);
  assert.deepEqual(await service.executeUnifiedImport(storeId, monthly.jobId), { success: 2, errors: 0 });
  const sales = checked(await db.from("sales_transactions").select("gross_amount,business_date").eq("store_id", storeId));
  assert.deepEqual(sales.map((sale) => Number(sale.gross_amount)).sort((a, b) => a - b), [-20, 100]);
  assert.equal(Number(checked(await db.from("inventory_stocks").select("quantity").eq("item_id", itemId).single()).quantity), 7);
  assert.equal(await count("inventory_movements"), 0);
  const totals = checked(await db.from("normalized_sales_summaries").select("gross_amount").eq("store_id", storeId).eq("summary_type", "monthly"));
  assert.equal(totals.reduce((sum, item) => sum + Number(item.gross_amount), 0), 80);
  pass("monthly XLSX upload, explicit confirmation, negative value persistence, totals, and zero inventory movements");

  const flat = await upload(fileFor([["売上日", "商品名", "金額"], ["2026/9/1", "Synthetic Refund", "(1,000)"]], "synthetic-flat.xlsx"));
  const oldRows = checked(await db.from("unified_import_rows").select("*").eq("import_job_id", flat.jobId));
  const salesBefore = await count("sales_transactions");
  const replacement = await service.reanalyzeUnifiedImport(storeId, flat.jobId);
  assert.notEqual(replacement.jobId, flat.jobId);
  assert(checked(await db.from("unified_import_jobs").select("archived_at").eq("id", flat.jobId).single()).archived_at);
  assert.deepEqual(checked(await db.from("unified_import_rows").select("*").eq("import_job_id", flat.jobId)), oldRows);
  assert.equal(await count("sales_transactions"), salesBefore);
  await service.saveUnifiedImportReview(storeId, replacement.jobId, new FormData());
  assert.deepEqual(await service.executeUnifiedImport(storeId, replacement.jobId), { success: 1, errors: 0 });
  const refund = checked(await db.from("sales_transaction_items").select("quantity,total_amount").eq("store_id", storeId).eq("item_name", "Synthetic Refund").single());
  assert.equal(Number(refund.quantity), 1);
  assert.equal(Number(refund.total_amount), -1000);
  pass("reanalysis preserves archived original rows, performs no business writes, and accounting negative/default quantity persist");

  const many = await upload(fileFor([["売上日", "商品名", "金額"], ...Array.from({ length: 1205 }, (_, index) => ["2026-09-01", `Synthetic Row ${index}`, 1])], "synthetic-pagination.xlsx"));
  const manyPreview = await service.getUnifiedImportJob(storeId, many.jobId);
  assert.equal(manyPreview.rows.length, 1205);
  assert.equal(new Set(manyPreview.rows.map((row) => row.id)).size, 1205);
  assert.equal((await service.saveUnifiedImportReview(storeId, many.jobId, new FormData())).approved, 1205);
  assert.equal(await count("sales_transactions"), 3);
  pass("1205 real PostgREST preview/review rows are complete and remain unimported");

  activeRole = "outsider";
  await assert.rejects(() => service.saveUnifiedImportReview(storeId, many.jobId, new FormData()), /権限/);
  await assert.rejects(() => service.executeUnifiedImport(storeId, many.jobId), /権限/);
  await assert.rejects(() => service.reanalyzeUnifiedImport(storeId, many.jobId), /権限/);
  activeRole = "owner";
  const outsider = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  checked(await outsider.auth.signInWithPassword({ email: users[1].email, password: users[1].password }));
  assert.deepEqual(checked(await outsider.from("unified_import_jobs").select("id").eq("store_id", storeId)), []);
  assert.deepEqual(checked(await outsider.from("unified_import_rows").select("id").eq("store_id", storeId)), []);
  await outsider.auth.signOut();
  pass("non-member service writes denied and real authenticated RLS cannot read fixture jobs or rows");
  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  // Exact random fixture IDs generated by this invocation only; no pre-existing business data is touched.
  const errors = [];
  const cleanup = async (label, operation) => { try { checked(await operation()); } catch (error) { errors.push(`${label}: ${error.message}`); } };
  await cleanup("storage", async () => {
    const jobs = checked(await db.from("unified_import_jobs").select("storage_path").eq("store_id", storeId));
    return jobs.length ? db.storage.from("import-files").remove(jobs.map((job) => job.storage_path)) : { data: [], error: null };
  });
  for (const table of ["audit_logs", "normalized_sales_summaries", "sales_transaction_items", "sales_transactions", "unified_import_rows", "unified_import_jobs", "inventory_movements", "inventory_stocks", "items"]) {
    await cleanup(table, () => db.from(table).delete().eq("store_id", storeId));
  }
  await cleanup("store", () => db.from("stores").delete().eq("id", storeId));
  await cleanup("memberships", () => db.from("organization_members").delete().eq("organization_id", orgId));
  await cleanup("organization", () => db.from("organizations").delete().eq("id", orgId));
  for (const user of users) await cleanup("user", () => db.auth.admin.deleteUser(user.id));
  assert.deepEqual(errors, [], "Synthetic fixture cleanup must succeed");
  assert.equal(checked(await db.from("stores").select("id").eq("id", storeId)).length, 0);
  console.log("Synthetic staging fixture records/accounts/files removed; no original workbook or customer records used.");
}
