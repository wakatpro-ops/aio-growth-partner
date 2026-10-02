// Entirely in-memory synthetic tests: no environment files, credentials, network, or live database.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as dates from "../lib/import-date.ts";
import * as parser from "../lib/unified-import/parser.ts";
import * as saleGroups from "../lib/unified-import/sales-groups.ts";
import * as values from "../lib/unified-import/value-validation.ts";
import * as version from "../lib/unified-import/version.ts";

const store = { id: "synthetic-store", organization_id: "synthetic-org", industry_type_key: "other" };
const originalBytes = new TextEncoder().encode("売上日,商品名,金額\n2026-09-01,合成サービス,1000");
const sha = createHash("sha256").update(originalBytes).digest("hex");
const headers = ["売上日", "商品名", "金額"];
const mapping = { date: "売上日", item_name: "商品名", amount: "金額" };
const sheet = { name: "合成表", headerRowNumber: 1, headers, rowCount: 1, suggestedRecordType: "sale", confidence: 0.98, suggestedMapping: mapping, missingRequiredFields: [] };
let state;

function seedRow(index = 0) {
  return {
    id: `row-${String(index).padStart(5, "0")}`, import_job_id: "job-original", store_id: store.id, organization_id: store.organization_id,
    sheet_name: sheet.name, row_number: index + 2, raw_data: { 売上日: "2026-09-01", 商品名: "合成サービス", 金額: "1000" },
    normalized_data: { date: "2026-09-01", item_name: "合成サービス", amount: "1000" }, suggested_record_type: "sale",
    confirmed_record_type: "sale", confidence: 0.98, user_corrections: {}, missing_fields: [], question: null,
    review_status: "ready", result_id: null, result_table: null
  };
}

function reset(count = 1) {
  const job = {
    id: "job-original", store_id: store.id, organization_id: store.organization_id, original_filename: "synthetic.csv",
    storage_bucket: "import-files", storage_path: "synthetic/original.csv", file_sha256: sha, mime_type: "text/csv",
    status: "review_ready", total_rows: count, success_rows: 0, error_rows: 0, approved_rows: count,
    archived_at: null, created_by: "synthetic-owner", updated_at: "2026-09-01T00:00:00.000Z",
    sheet_summaries: [{ ...structuredClone(sheet), rowCount: count }],
    answers: { parser_version: version.UNIFIED_IMPORT_PARSER_VERSION, sheet_types: { [sheet.name]: "sale" }, column_mappings: { [sheet.name]: mapping } }
  };
  state = {
    tables: new Map([["unified_import_jobs", [job]], ["unified_import_rows", Array.from({ length: count }, (_, index) => seedRow(index))]]),
    events: [], audits: [], parseCalls: 0, rebuilds: 0, storageError: false, parseError: false, downloadError: false, badHash: false, lockMiss: false,
    finalizationError: false, rebuildError: false, reviewLockMiss: false
  };
  return job;
}

function query(table) {
  let operation = "select", payload, range, maximum, single = false;
  const filters = [], orders = [];
  const builder = {
    select() { return builder; },
    eq(field, value) { filters.push((row) => row[field] === value); return builder; },
    ilike(field, value) { filters.push((row) => String(row[field] ?? "").toLowerCase() === String(value).toLowerCase()); return builder; },
    is(field, value) { filters.push((row) => (row[field] ?? null) === value); return builder; },
    in(field, values) { filters.push((row) => values.includes(row[field])); return builder; },
    order(field, options = {}) { orders.push([field, options.ascending !== false]); return builder; },
    range(start, end) { range = [start, end]; return builder; },
    limit(value) { maximum = value; return builder; },
    insert(value) { operation = "insert"; payload = value; return builder; },
    upsert(value) { operation = "upsert"; payload = value; return builder; },
    update(value) { operation = "update"; payload = value; return builder; },
    delete() { operation = "delete"; return builder; },
    maybeSingle() { single = true; return builder; },
    single() { single = true; return builder; },
    then(resolve, reject) {
      try {
        state.events.push({ table, operation, range, payload: structuredClone(payload) });
        const all = state.tables.get(table) ?? [];
        if (state.reviewLockMiss && table === "unified_import_jobs" && operation === "update" && payload.status === "analyzing") {
          // Another reviewer changed the job after this request read its snapshot.
          all[0].updated_at = "2026-09-02T00:00:00.000Z";
        }
        let selected = all.filter((row) => filters.every((filter) => filter(row)));
        if (operation === "select") {
          selected = [...selected].sort((left, right) => {
            for (const [field, ascending] of orders) {
              if (left[field] === right[field]) continue;
              return (left[field] < right[field] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          selected = range ? selected.slice(range[0], range[1] + 1) : selected.slice(0, maximum ?? 1000);
        } else if (operation === "update") {
          if (state.finalizationError && table === "unified_import_jobs" && payload.status === "completed") {
            state.finalizationError = false;
            resolve({ data: null, error: { message: "synthetic finalization failure" } });
            return;
          }
          if (state.lockMiss && table === "unified_import_jobs" && (payload.archived_at || payload.status === "importing")) selected = [];
          for (const row of selected) Object.assign(row, structuredClone(payload));
        } else if (operation === "delete") {
          state.tables.set(table, all.filter((row) => !selected.includes(row)));
        } else {
          selected = (Array.isArray(payload) ? payload : [payload]).map((item) => {
            const existing = operation === "upsert" ? all.find((row) => row.id === item.id) : null;
            if (existing) { Object.assign(existing, structuredClone(item)); return existing; }
            const row = { id: randomUUID(), archived_at: null, updated_at: "2026-09-01T00:00:00.000Z", ...structuredClone(item) };
            all.push(row);
            return row;
          });
          state.tables.set(table, all);
        }
        resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null });
      } catch (error) { reject(error); }
    }
  };
  return builder;
}

const supabase = {
  from: query,
  storage: { from: (bucket) => ({
    async download(path) {
      state.events.push({ operation: "download", bucket, path });
      return { data: state.downloadError ? null : new Blob([state.badHash ? new Uint8Array([0]) : originalBytes]), error: state.downloadError ? { message: "synthetic download failure" } : null };
    },
    async upload(path) {
      state.events.push({ operation: "upload", bucket, path });
      return { error: state.storageError ? { message: "synthetic upload failure" } : null };
    },
    async remove(paths) { state.events.push({ operation: "remove", bucket, paths }); return { error: null }; }
  }) },
  async rpc(name) { state.events.push({ operation: "rpc", name }); return { data: "synthetic-rpc", error: null }; }
};

const modules = {
  "server-only": {},
  "node:crypto": { createHash, randomUUID },
  "@/lib/auth/server": { getCurrentUserAccess: async () => ({ userId: "synthetic-owner", isPlatformAdmin: false, organizationRoles: { [store.organization_id]: "org_owner" }, storeRoles: {} }) },
  "@/lib/import-date": dates,
  "@/lib/phase6/compliance-data": { logAuditEvent: async (event) => { state.audits.push(event); } },
  "@/lib/phase4/sales-import-data": { rebuildSalesSummaries: async () => {
    state.rebuilds += 1;
    if (state.rebuildError) { state.rebuildError = false; throw new Error("synthetic summary failure"); }
  } },
  "@/lib/stores": { getStore: async () => store },
  "@/lib/storage-object-name": { buildImportStorageFileName: () => "synthetic.csv" },
  "@/lib/supabase/admin": { createSupabaseAdminClient: () => supabase },
  "@/lib/unified-import/parser": { ...parser, parseUnifiedImportFile: async () => {
    state.parseCalls += 1;
    if (state.parseError) throw new Error("synthetic parse failure");
    return { fileType: "csv", macroEnabled: false, sheets: [structuredClone(sheet)], rows: [{ sheetName: sheet.name, rowNumber: 2, ...parser.classifyUnifiedImportRow(seedRow().raw_data, "sale", 0.98, mapping) }] };
  } },
  "@/lib/unified-import/sales-groups": saleGroups,
  "@/lib/unified-import/value-validation": values,
  "@/lib/unified-import/version": version
};
const source = readFileSync(new URL("../lib/unified-import/data.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serviceModule = { exports: {} };
new Function("require", "module", "exports", compiled)((name) => {
  assert(Object.hasOwn(modules, name), `Unexpected live dependency: ${name}`);
  return modules[name];
}, serviceModule, serviceModule.exports);
const service = serviceModule.exports;
const businessWrites = () => state.events.filter((event) => event.table && !event.table.startsWith("unified_import_") && event.operation !== "select");
const mutations = () => state.events.filter((event) => ["insert", "update", "upsert", "delete", "upload", "remove", "rpc"].includes(event.operation));
const row = () => state.tables.get("unified_import_rows")[0];
const originalJob = () => state.tables.get("unified_import_jobs").find((job) => job.id === "job-original");
const execute = () => service.executeUnifiedImport(store.id, "job-original");
const reanalyze = () => service.reanalyzeUnifiedImport(store.id, "job-original");

reset(1205);
const all = await service.getUnifiedImportJob(store.id, "job-original");
assert.equal(all.rows.length, 1205);
assert.deepEqual(state.events.filter((event) => event.table === "unified_import_rows").map((event) => event.range), [[0, 499], [500, 999], [1000, 1499]]);
assert.equal(mutations().length, 0);
reset(1205).total_rows = 1206;
await assert.rejects(() => service.getUnifiedImportJob(store.id, "job-original"), /すべて取得/);
assert.equal(mutations().length, 0);

reset();
row().raw_data.売上日 = "2026-02-30";
row().raw_data.金額 = "#VALUE!";
await service.saveUnifiedImportReview(store.id, "job-original", new FormData());
assert.equal(originalJob().status, "questions_required");
assert.equal(row().review_status, "question");
assert.deepEqual(row().missing_fields, ["date", "amount"]);
const corrections = new FormData();
corrections.set(`row_${row().id}_date`, "2026/9/1");
corrections.set(`row_${row().id}_amount`, "(1,000)");
await service.saveUnifiedImportReview(store.id, "job-original", corrections);
assert.equal(originalJob().status, "review_ready");
assert.equal(row().normalized_data.amount, "(1,000)");
assert.equal(businessWrites().length, 0);

reset();
state.reviewLockMiss = true;
const rowsBeforeStaleSave = structuredClone(state.tables.get("unified_import_rows"));
await assert.rejects(() => service.saveUnifiedImportReview(store.id, "job-original", new FormData()), /別の操作/);
assert.deepEqual(state.tables.get("unified_import_rows"), rowsBeforeStaleSave);
assert.equal(state.events.filter((event) => event.operation === "upsert").length, 0);
reset();
const concurrentSaves = await Promise.allSettled([
  service.saveUnifiedImportReview(store.id, "job-original", new FormData()),
  service.saveUnifiedImportReview(store.id, "job-original", new FormData())
]);
assert.equal(concurrentSaves.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(concurrentSaves.filter((result) => result.status === "rejected").length, 1);
assert.equal(state.events.filter((event) => event.operation === "upsert").length, 1);
assert.equal(originalJob().status, "review_ready");
assert.equal(businessWrites().length, 0);

for (const excluded of [false, true]) {
  const ignored = reset();
  if (excluded) ignored.sheet_summaries[0].excludedReason = "合成集計表の重複";
  else ignored.answers.sheet_types[sheet.name] = "ignore";
  const override = new FormData();
  override.set(`row_type_${row().id}`, "sale");
  const reviewed = await service.saveUnifiedImportReview(store.id, "job-original", override);
  assert.equal(reviewed.approved, 0);
  assert.equal(row().confirmed_record_type, "ignore", "An individual row cannot override table exclusion");
  assert.equal(row().review_status, "ignored");
  assert.equal(businessWrites().length, 0);
}

for (const details of [{ blockingIssues: ["合成表の合計が一致しません"] }, { requiresConfirmation: true }]) {
  reset().sheet_summaries[0] = { ...structuredClone(sheet), ...details };
  await assert.rejects(execute, /未確認/);
  assert.equal(mutations().length, 0);
}
reset().sheet_summaries[0].blockingIssues = ["合成表の合計が一致しません"];
const confirmation = new FormData();
confirmation.set("sheet_confirm_0", "on");
await service.saveUnifiedImportReview(store.id, "job-original", confirmation);
assert.equal(originalJob().status, "questions_required", "A checked confirmation cannot override a blocking issue");
assert.equal(businessWrites().length, 0);

for (const excluded of [false, true]) {
  const ignored = reset();
  if (excluded) ignored.sheet_summaries[0].excludedReason = "合成集計表の重複";
  else ignored.answers.sheet_types[sheet.name] = "ignore";
  await assert.rejects(execute);
  assert.equal(mutations().length, 0, "A stale ready row cannot bypass its owning table exclusion");
}
reset();
row().sheet_name = "missing-sheet";
await assert.rejects(execute);
assert.equal(mutations().length, 0, "Rows without an owning table cannot execute");

reset().answers.parser_version = "old-version";
await assert.rejects(execute, /以前の解析方式/);
assert.equal(mutations().length, 0);
reset();
row().normalized_data.amount = "not a number";
await assert.rejects(execute, /数値/);
assert.equal(mutations().length, 0);
for (const field of ["date", "amount", "item_name"]) {
  reset();
  row().normalized_data[field] = "";
  await assert.rejects(execute, /未入力/);
  assert.equal(mutations().length, 0, `Missing required ${field} must fail before any write`);
}
for (const kind of [null, "unknown"]) {
  reset();
  row().confirmed_record_type = kind;
  await assert.rejects(execute, /未確認/);
  assert.equal(mutations().length, 0);
}
reset(2);
state.tables.get("unified_import_rows")[1].review_status = "question";
await assert.rejects(execute, /未確認/);
assert.equal(mutations().length, 0, "An unresolved row must block partial execution of other ready rows");

reset();
row().normalized_data.amount = "(1,000)";
row().normalized_data.quantity = "";
assert.deepEqual(await execute(), { success: 1, errors: 0 }, row().error_message);
assert.equal(state.tables.get("sales_transactions")[0].gross_amount, -1000);
assert.equal(state.tables.get("sales_transaction_items")[0].quantity, 1);
assert.equal(originalJob().status, "completed");

for (const flag of ["finalizationError", "rebuildError"]) {
  reset();
  state[flag] = true;
  await assert.rejects(execute, /synthetic/);
  assert.equal(row().review_status, "imported", "Completed business writes remain recorded on finalization failure");
  assert.notEqual(originalJob().status, "importing", "Retryable failures must release the execution lock");
  assert.equal(originalJob().status, "partial_failed");
  assert.equal(state.tables.get("sales_transactions").length, 1);
  const writesBeforeRetry = businessWrites().length;
  assert.deepEqual(await execute(), { success: 1, errors: 0 });
  assert.equal(businessWrites().length, writesBeforeRetry, "A finalization-only retry must not duplicate business records");
  assert.equal(originalJob().status, "completed");
}

reset();
row().confirmed_record_type = "expense";
row().normalized_data = { date: "2026-01-02T00:30:00+09:00", vendor_name: "Synthetic Vendor", amount: "100" };
assert.deepEqual(await execute(), { success: 1, errors: 0 });
assert.equal(state.tables.get("expense_receipts")[0].receipt_date, "2026-01-02");
reset();
row().confirmed_record_type = "customer";
row().normalized_data = { name: "Synthetic Customer", phone: "0000000000", birth_date: "2000-01-02T00:30:00+09:00", last_visit_date: "2026-01-02T00:30:00+09:00" };
assert.deepEqual(await execute(), { success: 1, errors: 0 });
assert.equal(state.tables.get("customers")[0].birth_date, "2000-01-02");
assert.equal(state.tables.get("customers")[0].last_visit_date, "2026-01-02");

reset();
const priorRows = structuredClone(state.tables.get("unified_import_rows"));
const replacement = await reanalyze();
assert.notEqual(replacement.jobId, "job-original");
assert(originalJob().archived_at);
assert.equal(state.parseCalls, 2);
assert.deepEqual(state.tables.get("unified_import_rows").filter((item) => item.import_job_id === "job-original"), priorRows);
assert(state.tables.get("unified_import_jobs").some((job) => job.id === replacement.jobId && !job.archived_at));
assert.equal(businessWrites().length, 0);
assert.equal(state.events.filter((event) => event.operation === "remove" || event.operation === "delete").length, 0);

for (const flag of ["downloadError", "badHash", "parseError"]) {
  reset();
  state[flag] = true;
  const before = structuredClone(state.tables.get("unified_import_rows"));
  await assert.rejects(reanalyze);
  assert.equal(originalJob().archived_at, null);
  assert.deepEqual(state.tables.get("unified_import_rows"), before);
  assert.equal(mutations().length, 0);
}
reset();
state.storageError = true;
const preserved = structuredClone(state.tables.get("unified_import_rows"));
await assert.rejects(reanalyze, /保存できません/);
assert.equal(originalJob().archived_at, null, "Failed replacement restores previous active review");
assert.deepEqual(state.tables.get("unified_import_rows"), preserved);
assert.equal(businessWrites().length, 0);

reset();
state.lockMiss = true;
await assert.rejects(reanalyze, /別の操作/);
assert.equal(state.events.filter((event) => event.operation === "upload").length, 0);
assert.equal(originalJob().archived_at, null);
for (const kind of ["imported", "error"]) {
  reset();
  row().review_status = kind;
  await assert.rejects(reanalyze, /取り込み開始済み/);
  assert.equal(mutations().length, 0);
}

console.log("Unified import service pagination, semantic/layout gates, safe execution, and non-destructive reanalysis tests passed.");
