// Opt-in, staging-only integration. Uses only new synthetic UUID fixtures and keeps all keys in memory.
// No browser automation, production endpoint, environment-file loading, or private workbook access.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import XLSX from "xlsx";
import ts from "typescript";
import { z } from "zod";
import * as dates from "../lib/import-date.ts";
import * as parser from "../lib/unified-import/parser.ts";
import * as legacyParser from "../lib/phase4/import-parser.ts";
import * as saleGroups from "../lib/unified-import/sales-groups.ts";
import * as values from "../lib/unified-import/value-validation.ts";
import * as version from "../lib/unified-import/version.ts";
import * as storageNames from "../lib/storage-object-name.ts";
import * as clarification from "../lib/unified-import/clarification.ts";
import * as reviewGroups from "../lib/unified-import/review-groups.ts";

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
  "@/lib/unified-import/clarification": clarification,
  "@/lib/unified-import/review-groups": reviewGroups,
  "./review-groups": reviewGroups,
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
Object.assign(modules, { zod: { z }, "./data": service, "./clarification": clarification, "./version": version, "./value-validation": values });
const clarificationService = loadService("../lib/unified-import/clarification-data.ts");
function sheetsFile(sheets, name) {
  const book = XLSX.utils.book_new();
  for (const [sheetName, matrix] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(matrix), sheetName);
  return new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
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
async function review(jobId, form = new FormData()) {
  const detail = await service.getUnifiedImportJob(storeId, jobId);
  form.set("expected_revision", detail.job.updated_at);
  return service.saveUnifiedImportReview(storeId, jobId, form);
}
async function execute(jobId) {
  const detail = await service.getUnifiedImportJob(storeId, jobId);
  return service.executeUnifiedImport(storeId, jobId, detail.job.updated_at);
}
async function previewResolution(jobId, resolutions) {
  const detail = await service.getUnifiedImportJob(storeId, jobId);
  const form = new FormData();
  form.set("expected_revision", detail.job.updated_at);
  form.set("resolutions", JSON.stringify(resolutions));
  return clarificationService.previewUnifiedImportClarification(storeId, jobId, form);
}
async function approveResolution(jobId, proposal) {
  const form = new FormData();
  form.set("expected_revision", proposal.revision); form.set("proposal_id", proposal.id); form.set("approved", "on");
  return clarificationService.applyUnifiedImportClarification(storeId, jobId, form);
}
const denied = (result, message) => { assert(result.error, message); assert.equal(result.data, null); };

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
  assert(!preview.job.sheet_summaries.some((sheet) => sheet.requiresConfirmation), "proven matrix layout still needs final review, not a blanket question");
  await assert.rejects(() => execute(monthly.jobId));
  assert.equal(await count("sales_transactions"), 0);
  assert.equal((await review(monthly.jobId)).unresolved, 0);
  assert.equal(await count("sales_transactions"), 0, "review still requires a separate final import action");
  assert.deepEqual(await execute(monthly.jobId), { success: 2, errors: 0, held: 0 });
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
  await review(replacement.jobId);
  assert.deepEqual(await execute(replacement.jobId), { success: 1, errors: 0, held: 0 });
  const refund = checked(await db.from("sales_transaction_items").select("quantity,total_amount").eq("store_id", storeId).eq("item_name", "Synthetic Refund").single());
  assert.equal(Number(refund.quantity), 1);
  assert.equal(Number(refund.total_amount), -1000);
  pass("reanalysis preserves archived original rows, performs no business writes, and accounting negative/default quantity persist");

  const many = await upload(fileFor([["売上日", "商品名", "金額"], ...Array.from({ length: 1205 }, (_, index) => ["2026-09-01", `Synthetic Row ${index}`, 1])], "synthetic-pagination.xlsx"));
  const manyPreview = await service.getUnifiedImportJob(storeId, many.jobId);
  assert.equal(manyPreview.rows.length, 1205);
  assert.equal(new Set(manyPreview.rows.map((row) => row.id)).size, 1205);
  assert.equal((await review(many.jobId)).approved, 1205);
  assert.equal(await count("sales_transactions"), 3);
  pass("1205 real PostgREST preview/review rows are complete and remain unimported");

  const expense = await upload(sheetsFile([["経費", [["支払日", "勘定科目", "経費金額", "支払先"], ["2026-09-02", "Synthetic Supplies", 123, ""]]]], "synthetic-expense-default.xlsx"));
  const expenseBefore = await service.getUnifiedImportJob(storeId, expense.jobId);
  assert.equal(expenseBefore.rows.length, 1);
  const expenseSheet = expenseBefore.job.sheet_summaries.find((sheet) => sheet.suggestedRecordType === "expense");
  assert(expenseSheet, "Synthetic expense table must be detected");
  const vendorIssue = clarificationService.calculateClarification(expenseBefore.job, expenseBefore.rows).sheets.flatMap((sheet) => sheet.clarification?.issues ?? []).find((issue) => issue.field === "vendor_name");
  assert(vendorIssue, "A supplied but blank vendor column requires an explicit answer");
  const vendorAnswer = { id: randomUUID(), tableName: expenseSheet.name, issueIds: [vendorIssue.id], reason: "Synthetic fixture vendor verified", action: "set_default", field: "vendor_name", value: "Synthetic Approved Vendor" };
  const vendorProposal = await previewResolution(expense.jobId, [vendorAnswer]);
  assert.equal(vendorProposal.changedRows, 1);
  assert.deepEqual(checked(await db.from("unified_import_rows").select("*").eq("import_job_id", expense.jobId)), expenseBefore.rows, "Preview must not alter rows or their source snapshot");
  const unapproved = new FormData(); unapproved.set("expected_revision", vendorProposal.revision); unapproved.set("proposal_id", vendorProposal.id);
  await assert.rejects(() => clarificationService.applyUnifiedImportClarification(storeId, expense.jobId, unapproved), /承認/);
  assert.equal(await count("expense_receipts"), 0);
  assert.deepEqual(await approveResolution(expense.jobId, vendorProposal), { remaining: 0 });
  await assert.rejects(() => approveResolution(expense.jobId, vendorProposal), /別の操作/);
  const expenseApproved = await service.getUnifiedImportJob(storeId, expense.jobId);
  assert.deepEqual(expenseApproved.rows[0].raw_data, expenseBefore.rows[0].raw_data);
  assert.deepEqual(expenseApproved.rows[0].clarification_base_data, expenseBefore.rows[0].normalized_data);
  assert.equal(expenseApproved.rows[0].normalized_data.vendor_name, vendorAnswer.value);
  assert.equal(expenseApproved.job.answers.clarification_resolutions[0].actorId, users[0].id);
  assert.equal(expenseApproved.job.answers.clarification_resolutions[0].id, vendorAnswer.id);
  denied(await db.from("unified_import_rows").update({ raw_data: { synthetic: "tamper" } }).eq("id", expenseApproved.rows[0].id).select(), "Original source must be immutable");
  denied(await db.from("unified_import_rows").update({ clarification_base_data: {} }).eq("id", expenseApproved.rows[0].id).select(), "Original normalized snapshot must be immutable");
  denied(await db.from("unified_import_jobs").update({ file_sha256: "synthetic-tamper" }).eq("id", expense.jobId).select(), "File evidence must be immutable");
  const badAnswers = { ...expenseApproved.job.answers, clarification_resolutions: [] };
  const rpcArgs = { p_job_id: expense.jobId, p_store_id: storeId, p_organization_id: orgId, p_expected_revision: expenseApproved.job.updated_at,
    p_revision: new Date(Date.parse(expenseApproved.job.updated_at) + 1000).toISOString(),
    p_rows: [{ ...expenseApproved.rows[0], normalized_data: { ...expenseApproved.rows[0].normalized_data, amount: "999" } }],
    p_answers: badAnswers, p_sheets: expenseApproved.job.sheet_summaries, p_questions: [] };
  denied(await db.rpc("apply_unified_import_clarification", rpcArgs), "Removing approval history must reject and atomically roll back row changes");
  assert.deepEqual((await service.getUnifiedImportJob(storeId, expense.jobId)).rows, expenseApproved.rows);
  assert.deepEqual((await service.getUnifiedImportJob(storeId, expense.jobId)).job, expenseApproved.job);
  denied(await db.rpc("apply_unified_import_clarification", { ...rpcArgs, p_store_id: randomUUID(), p_answers: expenseApproved.job.answers }), "Cross-store RPC must reject");
  denied(await db.rpc("apply_unified_import_clarification", { ...rpcArgs, p_organization_id: randomUUID(), p_answers: expenseApproved.job.answers }), "Cross-organization RPC must reject");
  denied(await db.rpc("apply_unified_import_clarification", { ...rpcArgs, p_expected_revision: expenseBefore.job.updated_at, p_answers: expenseApproved.job.answers }), "Stale RPC revision must reject");
  assert.deepEqual(await review(expense.jobId), { unresolved: 0, approved: 1, held: 0 }, "Approved default must not require a source column");
  assert.deepEqual(await execute(expense.jobId), { success: 1, errors: 0, held: 0 });
  const receipt = checked(await db.from("expense_receipts").select("vendor_name,receipt_date,total_amount").eq("store_id", storeId).single());
  assert.equal(receipt.vendor_name, vendorAnswer.value); assert.equal(receipt.receipt_date, "2026-09-02"); assert.equal(Number(receipt.total_amount), 123);
  denied(await db.from("unified_import_rows").update({ normalized_data: { amount: "999" }, review_status: "ready", result_id: null }).eq("id", expenseApproved.rows[0].id).select(), "Posted rows must remain immutable");
  pass("real clarification preview/approval RPC, missing vendor default, immutable evidence/history, atomic rollback, stale/cross-tenant rejection, and expense execution");

  const noVendor = await upload(sheetsFile([["経費", [["経費日", "用途", "経費金額"], ["2026-09-02", "Synthetic draft expense", 321]]]], "synthetic-no-vendor-column.xlsx"));
  const noVendorDetail = await service.getUnifiedImportJob(storeId, noVendor.jobId);
  assert.equal(noVendorDetail.job.questions.length, 0);
  assert.equal((await review(noVendor.jobId)).unresolved, 0);
  assert.deepEqual(await execute(noVendor.jobId), { success: 1, errors: 0, held: 0 });
  const noVendorReceipt = checked(await db.from("expense_receipts").select("vendor_name,status,approval_status,freee_status,total_amount").eq("store_id", storeId).eq("total_amount", 321).single());
  assert.equal(noVendorReceipt.vendor_name, null);
  assert.equal(noVendorReceipt.status, "needs_review");
  assert.equal(noVendorReceipt.approval_status, "draft");
  assert.equal(noVendorReceipt.freee_status, "review_required");
  assert.deepEqual(await execute(noVendor.jobId), { success: 1, errors: 0, held: 0 });
  assert.equal(await count("expense_receipts"), 2, "retries do not duplicate unknown-vendor drafts");
  pass("absent supplier column remains NULL in an unapproved, unexported draft; retry is idempotent");

  const partial = await upload(sheetsFile([
    ["先に取込", [["売上日", "商品名", "金額", "伝票番号"], ["2026-09-03", "Synthetic Shared Receipt", 100, "SHARED-SYNTHETIC"]]],
    ["保留分", [["売上日", "商品名", "金額", "伝票番号"], ["2026-09-03", "Synthetic Shared Receipt", "#VALUE!", "SHARED-SYNTHETIC"]]]
  ], "synthetic-partial-hold.xlsx"));
  const partialBefore = await service.getUnifiedImportJob(storeId, partial.jobId);
  const heldIndex = partialBefore.job.sheet_summaries.findIndex((sheet) => sheet.sourceSheetName === "保留分" || sheet.name === "保留分");
  assert(heldIndex >= 0);
  const heldName = partialBefore.job.sheet_summaries[heldIndex].name;
  const hold = new FormData(); hold.set(`sheet_hold_${heldIndex}`, "on");
  assert.deepEqual(await review(partial.jobId, hold), { unresolved: 0, approved: 1, held: 1 });
  assert.deepEqual(await execute(partial.jobId), { success: 1, errors: 0, held: 1 });
  const heldDetail = await service.getUnifiedImportJob(storeId, partial.jobId);
  assert.equal(heldDetail.job.status, "questions_required"); assert.equal(heldDetail.job.completed_at, null);
  const posted = heldDetail.rows.find((row) => row.review_status === "imported");
  const heldRow = heldDetail.rows.find((row) => row.sheet_name === heldName);
  assert.deepEqual(heldRow.raw_data, partialBefore.rows.find((row) => row.id === heldRow.id).raw_data);
  const amountIssue = clarificationService.calculateClarification(heldDetail.job, heldDetail.rows).sheets.find((sheet) => sheet.name === heldName).clarification.issues.find((issue) => issue.field === "amount");
  assert(amountIssue);
  const amountProposal = await previewResolution(partial.jobId, [{ id: randomUUID(), tableName: heldName, issueIds: [amountIssue.id], reason: "Synthetic amount independently verified", action: "correct_values", corrections: [{ rowNumber: heldRow.row_number, field: "amount", value: 200 }] }]);
  await approveResolution(partial.jobId, amountProposal);
  assert.deepEqual(await review(partial.jobId), { unresolved: 0, approved: 1, held: 0 });
  assert.deepEqual((await service.getUnifiedImportJob(storeId, partial.jobId)).rows.find((row) => row.id === posted.id), posted, "Resuming never rewrites posted rows");
  assert.deepEqual(await execute(partial.jobId), { success: 2, errors: 0, held: 0 });
  const shared = checked(await db.from("sales_transactions").select("id,gross_amount").eq("store_id", storeId).contains("source_metadata", { unified_import_job_id: partial.jobId }));
  assert.equal(shared.length, 2); assert.equal(shared.reduce((sum, row) => sum + Number(row.gross_amount), 0), 300);
  const salesAfterResume = await count("sales_transactions");
  assert.deepEqual(await execute(partial.jobId), { success: 2, errors: 0, held: 0 });
  assert.equal(await count("sales_transactions"), salesAfterResume);
  pass("real partial hold/import/approved correction/resume with shared receipt ID, preserved posted rows, and zero duplicate transactions");

  checked(await db.from("unified_import_jobs").update({ status: "importing" }).eq("id", many.jobId));
  denied(await db.from("unified_import_jobs").update({ archived_at: new Date().toISOString() }).eq("id", many.jobId).select(), "Active execution cannot be archived");
  checked(await db.from("unified_import_jobs").update({ status: "review_ready" }).eq("id", many.jobId));
  pass("database rejects archival during an active import");

  activeRole = "outsider";
  await assert.rejects(() => service.getUnifiedImportJob(storeId, many.jobId), /権限/);
  await assert.rejects(() => service.listUnifiedImportJobs(storeId), /権限/);
  await assert.rejects(() => review(many.jobId), /権限/);
  await assert.rejects(() => execute(many.jobId), /権限/);
  await assert.rejects(() => service.reanalyzeUnifiedImport(storeId, many.jobId), /権限/);
  activeRole = "owner";
  for (const user of users) {
    const authenticated = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    checked(await authenticated.auth.signInWithPassword({ email: user.email, password: user.password }));
    for (const table of ["unified_import_jobs", "unified_import_rows"]) {
      denied(await authenticated.from(table).select("id").eq("store_id", storeId), "Direct authenticated raw financial reads denied, including owner");
      denied(await authenticated.from(table).update({ updated_at: new Date().toISOString() }).eq("store_id", storeId).select(), "Direct authenticated mutation denied");
      denied(await authenticated.from(table).delete().eq("store_id", storeId).select(), "Direct authenticated deletion denied");
    }
    denied(await authenticated.rpc("apply_unified_import_clarification", rpcArgs), "Authenticated RPC access denied");
    await authenticated.auth.signOut();
  }
  pass("non-member raw service access denied; real authenticated owner and outsider direct SELECT/DML/RPC permissions denied");
  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  // Exact random fixture IDs generated by this invocation only; no pre-existing business data is touched.
  const errors = [];
  const cleanup = async (label, operation) => { try { checked(await operation()); } catch (error) { errors.push(`${label}: ${error.message}`); } };
  await cleanup("storage", async () => {
    const jobs = checked(await db.from("unified_import_jobs").select("storage_path").eq("store_id", storeId));
    return jobs.length ? db.storage.from("import-files").remove(jobs.map((job) => job.storage_path)) : { data: [], error: null };
  });
  for (const table of ["audit_logs", "normalized_sales_summaries", "sales_transaction_items", "sales_transactions", "expense_receipts", "unified_import_rows", "unified_import_jobs", "inventory_movements", "inventory_stocks", "items"]) {
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
