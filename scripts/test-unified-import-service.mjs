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
import * as clarification from "../lib/unified-import/clarification.ts";

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
    finalizationError: false, rebuildError: false, reviewLockMiss: false,
    inventoryFailureAt: null, inventoryAttempts: 0, movementKeys: new Map(), role: "org_owner", storeRole: null, platformAdmin: false
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
  async rpc(name, args) {
    state.events.push({ operation: "rpc", name, args: structuredClone(args) });
    if (name === "apply_inventory_movement") {
      state.inventoryAttempts += 1;
      if (state.inventoryAttempts === state.inventoryFailureAt) return { data: null, error: { message: "synthetic inventory failure" } };
      const key = args.p_movement_key;
      if (!state.movementKeys.has(key)) {
        const movement = { id: randomUUID(), store_id: args.p_store_id, item_id: args.p_item_id, quantity_delta: args.p_quantity_delta, movement_key: key };
        state.movementKeys.set(key, movement.id);
        state.tables.set("inventory_movements", [...(state.tables.get("inventory_movements") ?? []), movement]);
      }
      return { data: state.movementKeys.get(key), error: null };
    }
    return { data: "synthetic-rpc", error: null };
  }
};

const modules = {
  "server-only": {},
  "node:crypto": { createHash, randomUUID },
  "@/lib/auth/server": { getCurrentUserAccess: async () => ({ userId: "synthetic-owner", isPlatformAdmin: state.platformAdmin, organizationRoles: { [store.organization_id]: state.role }, storeRoles: { [store.id]: state.storeRole } }) },
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
  "@/lib/unified-import/version": version,
  "@/lib/unified-import/clarification": clarification
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
const execute = (revision = originalJob().updated_at) => service.executeUnifiedImport(store.id, "job-original", revision);
const reanalyze = () => service.reanalyzeUnifiedImport(store.id, "job-original");
const review = (formData = new FormData(), revision = originalJob().updated_at) => {
  formData.set("expected_revision", revision);
  return service.saveUnifiedImportReview(store.id, "job-original", formData);
};

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
await review();
assert.equal(originalJob().status, "questions_required");
assert.equal(row().review_status, "question");
assert.deepEqual(row().missing_fields, ["date", "amount"]);
const corrections = new FormData();
corrections.set(`row_${row().id}_date`, "2026/9/1");
corrections.set(`row_${row().id}_amount`, "(1,000)");
await review(corrections);
assert.equal(originalJob().status, "review_ready");
assert.equal(row().normalized_data.amount, "(1,000)");
assert.equal(businessWrites().length, 0);

reset();
state.reviewLockMiss = true;
const rowsBeforeStaleSave = structuredClone(state.tables.get("unified_import_rows"));
await assert.rejects(() => review(), /別の操作/);
assert.deepEqual(state.tables.get("unified_import_rows"), rowsBeforeStaleSave);
assert.equal(state.events.filter((event) => event.operation === "upsert").length, 0);
reset();
const concurrentSaves = await Promise.allSettled([
  review(),
  review()
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
  const reviewed = await review(override);
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
await review(confirmation);
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
assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 }, row().error_message);
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
  assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 });
  assert.equal(businessWrites().length, writesBeforeRetry, "A finalization-only retry must not duplicate business records");
  assert.equal(originalJob().status, "completed");
}

reset();
row().confirmed_record_type = "expense";
row().normalized_data = { date: "2026-01-02T00:30:00+09:00", vendor_name: "Synthetic Vendor", amount: "100" };
assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 });
assert.equal(state.tables.get("expense_receipts")[0].receipt_date, "2026-01-02");
reset();
row().confirmed_record_type = "customer";
row().normalized_data = { name: "Synthetic Customer", phone: "0000000000", birth_date: "2000-01-02T00:30:00+09:00", last_visit_date: "2026-01-02T00:30:00+09:00" };
assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 });
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

reset(2);
for (const entry of state.tables.get("unified_import_rows")) entry.normalized_data.transaction_id = "SYNTHETIC-RECEIPT";
row().normalized_data.date = "2026/9/1";
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(state.tables.get("sales_transactions").length, 1, "Equivalent calendar formats identify one receipt");
assert.equal(state.tables.get("sales_transactions")[0].gross_amount, 2000);
assert.equal(state.tables.get("sales_transaction_items").length, 2);

reset(2);
const secondSheet = { ...structuredClone(sheet), name: "合成別表", rowCount: 1 };
originalJob().sheet_summaries.push(secondSheet);
originalJob().answers.sheet_types[secondSheet.name] = "sale";
state.tables.get("unified_import_rows")[1].sheet_name = secondSheet.name;
for (const entry of state.tables.get("unified_import_rows")) entry.normalized_data.transaction_id = "SYNTHETIC-SAME-NUMBER";
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(state.tables.get("sales_transactions").length, 2, "Separate source tables cannot collide on receipt number");
assert.equal(state.tables.get("sales_transaction_items").length, 2);

function seedStockReceipt() {
  reset(2);
  state.tables.set("items", [{ id: "synthetic-original-item", store_id: store.id, name: "合成サービス", archived_at: null, is_stock_managed: true }]);
  for (const entry of state.tables.get("unified_import_rows")) entry.normalized_data.transaction_id = "SYNTHETIC-STOCK";
  state.inventoryFailureAt = 2;
}
seedStockReceipt();
assert.deepEqual(await execute(), { success: 0, errors: 2, held: 0 });
assert.equal(state.tables.get("sales_transactions").length, 1);
assert.equal(state.tables.get("sales_transaction_items").length, 2);
assert.equal(state.tables.get("inventory_movements").length, 1);
// Recovery must use the original persisted item IDs, not today's matching master.
state.tables.set("items", [{ id: "synthetic-new-item", store_id: store.id, name: "合成サービス", archived_at: null, is_stock_managed: true }]);
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(state.tables.get("sales_transactions").length, 1);
assert.equal(state.tables.get("sales_transaction_items").length, 2);
assert.equal(state.tables.get("inventory_movements").length, 2);
assert(state.tables.get("inventory_movements").every((movement) => movement.item_id === "synthetic-original-item"));
assert.equal(state.inventoryAttempts, 4, "Retry replays idempotent keys, including the first already-applied movement");

for (const tamper of ["provenance", "amount", "missing-line"]) {
  seedStockReceipt();
  assert.deepEqual(await execute(), { success: 0, errors: 2, held: 0 });
  if (tamper === "provenance") state.tables.get("sales_transactions")[0].source_metadata.unified_import_row_ids = ["unrelated-row"];
  if (tamper === "amount") state.tables.get("sales_transaction_items")[0].total_amount = 999;
  if (tamper === "missing-line") state.tables.get("sales_transaction_items").pop();
  const attempts = state.inventoryAttempts;
  assert.deepEqual(await execute(), { success: 0, errors: 2, held: 0 });
  assert.equal(state.inventoryAttempts, attempts, "Mismatched saved evidence must fail before any stock write");
  assert(state.tables.get("unified_import_rows").every((entry) => entry.review_status === "error"));
}

reset();
const staleRevision = originalJob().updated_at;
await review();
const beforeStale = structuredClone(state.tables.get("unified_import_rows"));
const mutationsBeforeStale = mutations().length;
await assert.rejects(() => review(new FormData(), staleRevision), /別の操作/);
await assert.rejects(() => execute(staleRevision), /別の操作/);
await assert.rejects(() => service.saveUnifiedImportReview(store.id, "job-original", new FormData()), /別の操作/);
await assert.rejects(() => service.executeUnifiedImport(store.id, "job-original"), /別の操作/);
assert.equal(mutations().length, mutationsBeforeStale);
assert.deepEqual(state.tables.get("unified_import_rows"), beforeStale);
reset().updated_at = "2099-01-01T00:00:00.000Z";
const futureRevision = originalJob().updated_at;
await review();
assert(Date.parse(originalJob().updated_at) > Date.parse(futureRevision), "Revision tokens must advance even under clock skew");

reset();
const simultaneousRuns = await Promise.allSettled([execute(), execute()]);
assert.equal(simultaneousRuns.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(simultaneousRuns.filter((result) => result.status === "rejected").length, 1);
assert.equal(state.tables.get("sales_transactions").length, 1);
assert.equal(state.tables.get("sales_transaction_items").length, 1);

function seedHeldReceipt() {
  reset(2);
  const names = [sheet.name, "合成保留表"];
  originalJob().sheet_summaries = names.map((name) => ({ ...structuredClone(sheet), name, rowCount: 1, headers: [...headers, "取引ID"], suggestedMapping: { ...mapping, transaction_id: "取引ID" } }));
  originalJob().answers.sheet_types = Object.fromEntries(names.map((name) => [name, "sale"]));
  originalJob().answers.column_mappings = Object.fromEntries(names.map((name) => [name, { ...mapping, transaction_id: "取引ID" }]));
  state.tables.get("unified_import_rows").forEach((entry, index) => {
    entry.sheet_name = names[index];
    entry.raw_data["取引ID"] = "SYNTHETIC-SHARED-RECEIPT";
    entry.normalized_data.transaction_id = "SYNTHETIC-SHARED-RECEIPT";
  });
  const heldRow = state.tables.get("unified_import_rows")[1];
  heldRow.raw_data.金額 = "#VALUE!";
  heldRow.normalized_data.amount = "#VALUE!";
  heldRow.review_status = "question";
  heldRow.missing_fields = ["amount"];
  heldRow.question = "合成数値の確認";
  return heldRow;
}
const deferred = seedHeldReceipt();
const originalHeld = structuredClone(deferred);
const hold = new FormData(); hold.set("sheet_hold_1", "on");
assert.deepEqual(await review(hold), { approved: 1, unresolved: 0, held: 1 });
assert.deepEqual(await execute(), { success: 1, errors: 0, held: 1 });
assert.equal(originalJob().status, "questions_required");
assert.equal(originalJob().completed_at, null);
assert.deepEqual(state.tables.get("unified_import_rows")[1], originalHeld, "A held question's source and state remain intact");
const importedSnapshot = structuredClone(row());
const resume = new FormData(); resume.set(`row_${deferred.id}_amount`, "2000");
assert.deepEqual(await review(resume), { approved: 1, unresolved: 0, held: 0 });
assert.deepEqual(row(), importedSnapshot, "Reviewing a held table never rewrites imported rows");
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(state.tables.get("sales_transactions").length, 2, "Resuming a shared receipt number imports the other table exactly once");
assert.equal(state.tables.get("sales_transaction_items").length, 2);
assert.equal(state.tables.get("sales_transactions").reduce((sum, item) => sum + item.gross_amount, 0), 3000);
assert.equal(originalJob().status, "completed");
const writesAtCompletion = businessWrites().length;
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(businessWrites().length, writesAtCompletion);

reset();
const holdAll = new FormData(); holdAll.set("sheet_hold_0", "on");
assert.deepEqual(await review(holdAll), { approved: 0, unresolved: 0, held: 1 });
assert.equal(originalJob().status, "questions_required");
await assert.rejects(execute);
assert.equal(businessWrites().length, 0);

reset();
row().raw_data.支払先 = "Synthetic Vendor";
originalJob().sheet_summaries[0].headers.push("支払先");
const reclassifyHeld = new FormData(); reclassifyHeld.set("sheet_hold_0", "on"); reclassifyHeld.set("sheet_type_0", "expense"); reclassifyHeld.set("sheet_mapping_0_date", "売上日");
await review(reclassifyHeld);
assert.equal(row().confirmed_record_type, "sale", "Held row is not rewritten during reclassification");
await review();
assert.equal(row().confirmed_record_type, "expense", "Resuming applies classification saved while held");
assert.equal(row().normalized_data.vendor_name, "Synthetic Vendor");

reset();
const amountIssue = clarification.createImportClarificationIssue({ tableName: sheet.name, code: "invalid_number", field: "amount", rowNumbers: [2], source: { sheetName: sheet.name, range: "2:2" }, message: "Synthetic invalid amount" });
originalJob().answers.clarification_original_sheets = { [sheet.name]: { ...structuredClone(originalJob().sheet_summaries[0]), clarification: { version: 1, issues: [amountIssue] } } };
originalJob().answers.clarification_resolutions = [{ id: "synthetic-resolution", tableName: sheet.name, action: "correct_values", issueIds: [amountIssue.id], reason: "Synthetic correction", corrections: [{ rowNumber: 2, field: "amount", value: "900" }], actorId: "synthetic-owner", approvedAt: "2026-09-01T00:00:00.000Z" }];
originalJob().answers.clarification_state = { quality: "normal", marker: "preserved" };
originalJob().answers.clarification_pending = { id: "synthetic-stale-proposal" };
row().raw_data.金額 = "#VALUE!";
row().clarification_base_data = { ...structuredClone(row().normalized_data), amount: "#VALUE!" };
row().normalized_data.amount = "900";
const approvedSnapshot = structuredClone(row());
await review();
assert.deepEqual(row(), approvedSnapshot, "Ordinary save must retain effective clarification values and original baseline");
assert.equal(originalJob().answers.clarification_pending, null);
assert.equal(originalJob().answers.clarification_state.marker, "preserved");
assert.equal(originalJob().answers.clarification_resolutions.length, 1);
for (const [key, value] of [["sheet_type_0", "expense"], ["sheet_mapping_0_amount", "商品名"], [`row_${row().id}_amount`, "901"]]) {
  const change = new FormData(); change.set(key, value);
  await assert.rejects(() => review(change), /変更できません/);
  assert.deepEqual(row(), approvedSnapshot);
}
assert.equal((await review(holdAll)).held, 1, "An approved but unexecuted table may still be held");
assert.equal((await review()).approved, 1);
assert.deepEqual(row(), approvedSnapshot);

reset();
originalJob().sheet_summaries[0].suggestedRecordType = "expense";
originalJob().sheet_summaries[0].suggestedMapping = { date: "売上日", amount: "金額" };
originalJob().sheet_summaries[0].missingRequiredFields = ["vendor_name"];
originalJob().answers.sheet_types[sheet.name] = "expense";
originalJob().answers.column_mappings[sheet.name] = { date: "売上日", amount: "金額" };
const vendorIssue = clarification.createImportClarificationIssue({ tableName: sheet.name, code: "missing_field", field: "vendor_name", rowNumbers: [2], source: { sheetName: sheet.name, range: "2:2" }, message: "Synthetic missing vendor" });
originalJob().answers.clarification_original_sheets = { [sheet.name]: { ...structuredClone(originalJob().sheet_summaries[0]), clarification: { version: 1, issues: [vendorIssue] } } };
originalJob().answers.clarification_resolutions = [{ id: "synthetic-default", tableName: sheet.name, action: "set_default", issueIds: [vendorIssue.id], reason: "Synthetic missing vendor", field: "vendor_name", value: "Synthetic Vendor" }];
row().confirmed_record_type = "expense";
row().normalized_data = { date: "2026-09-01", amount: "1000", vendor_name: "Synthetic Vendor" };
row().clarification_base_data = { date: "2026-09-01", amount: "1000" };
assert.deepEqual(await review(), { unresolved: 0, approved: 1, held: 0 }, "An approved default does not require a nonexistent source column");

seedStockReceipt();
assert.deepEqual(await execute(), { success: 0, errors: 2, held: 0 });
const failedRows = structuredClone(state.tables.get("unified_import_rows"));
const changeFailed = new FormData(); changeFailed.set(`row_${row().id}_amount`, "3000");
await assert.rejects(() => review(changeFailed), /変更できません/);
await assert.rejects(() => review(holdAll), /保留へ変更できません/);
assert.deepEqual(state.tables.get("unified_import_rows"), failedRows);
assert.deepEqual(await review(), { unresolved: 0, approved: 2, held: 0 });
assert.deepEqual(state.tables.get("unified_import_rows"), failedRows);
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });

for (const role of ["staff", "viewer", "hq_viewer", null]) {
  reset(); state.role = role;
  await assert.rejects(() => service.getUnifiedImportJob(store.id, "job-original"), /権限/);
  await assert.rejects(() => service.listUnifiedImportJobs(store.id), /権限/);
  await assert.rejects(review, /権限/);
  await assert.rejects(execute, /権限/);
  await assert.rejects(reanalyze, /権限/);
  assert.equal(state.events.length, 0, "Unauthorized raw financial reads must stop before database queries");
}
for (const allowed of [{ role: "staff", storeRole: "store_manager" }, { role: null, platformAdmin: true }]) {
  reset(); Object.assign(state, allowed);
  assert.equal((await service.getUnifiedImportJob(store.id, "job-original")).rows.length, 1);
  assert.equal((await review()).approved, 1);
}

reset(20);
for (const current of state.tables.get("unified_import_rows").slice(0, 17)) {
  current.raw_data.売上日 = "2026-02-30"; current.raw_data.金額 = "#VALUE!";
}
assert((await review()).unresolved > 0);
assert.equal(originalJob().answers.clarification_state.quality, "unprocessable");
assert.equal(originalJob().answers.clarification_state.qualityMetrics.hardThresholdTriggered, true);
await assert.rejects(execute);
assert.equal(businessWrites().length, 0);
await review(holdAll);
assert.equal(originalJob().answers.clarification_state.quality, "normal");
assert.deepEqual(originalJob().answers.clarification_state.remainingIssueIds, []);
assert.deepEqual(originalJob().answers.clarification_state.heldTables, [sheet.name]);

reset();
const hardIssue = clarification.createImportClarificationIssue({ tableName: sheet.name, code: "source_missing", source: { sheetName: sheet.name, range: "A2" }, message: "Synthetic missing source" });
originalJob().sheet_summaries[0].clarification = { version: 1, issues: [hardIssue] };
// Even stale summaries without legacy blocking strings must fail the typed-issue gate.
await assert.rejects(execute, /確認|品質/);
assert.equal(businessWrites().length, 0);

reset();
const layoutIssue = clarification.createImportClarificationIssue({ tableName: sheet.name, code: "layout_confirmation", source: { sheetName: sheet.name, range: "A1:C2" }, message: "Synthetic layout confirmation" });
originalJob().sheet_summaries[0].clarification = { version: 1, issues: [layoutIssue] };
originalJob().sheet_summaries[0].blockingIssues = [layoutIssue.message];
originalJob().sheet_summaries[0].requiresConfirmation = true;
const typedConfirm = new FormData(); typedConfirm.set("sheet_confirm_0", "on");
assert.deepEqual(await review(typedConfirm), { approved: 1, unresolved: 0, held: 0 });
assert.deepEqual(originalJob().sheet_summaries[0].blockingIssues, []);
await review();
assert.equal(originalJob().status, "questions_required", "Unchecking a prior layout confirmation restores its gate");
await review(typedConfirm);
assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 });

reset(2);
const adjustment = state.tables.get("unified_import_rows")[1];
adjustment.raw_data.データ粒度 = "利用者確認済み売上調整";
adjustment.normalized_data = { ...adjustment.normalized_data, amount: "-100", clarification_adjustment: true, source_resolution_id: "synthetic-adjustment" };
state.tables.set("items", [{ id: "stocked-synthetic-item", store_id: store.id, name: "合成サービス", is_stock_managed: true }]);
assert.deepEqual(await execute(), { success: 2, errors: 0, held: 0 });
assert.equal(state.tables.get("inventory_movements").length, 1, "Explicit monetary adjustment never moves matched stock");
assert.equal(state.tables.get("sales_transactions").reduce((sum, item) => sum + item.gross_amount, 0), 900);

for (const name of ["toString", "constructor", "__proto__"]) {
  reset();
  originalJob().sheet_summaries[0].name = name;
  row().sheet_name = name;
  originalJob().answers.sheet_types = {};
  originalJob().answers.column_mappings = {};
  originalJob().answers.layout_confirmations = {};
  const specialLayout = clarification.createImportClarificationIssue({ tableName: name, code: "layout_confirmation", source: { sheetName: name, range: "A1:C2" }, message: "Synthetic prototype-key layout" });
  originalJob().sheet_summaries[0].clarification = { version: 1, issues: [specialLayout] };
  originalJob().sheet_summaries[0].requiresConfirmation = true;
  await assert.rejects(execute, /未確認|確認/);
  assert.equal(businessWrites().length, 0);
  assert((await review()).unresolved > 0, `${name} must require explicit layout consent`);
  const consent = new FormData(); consent.set("sheet_confirm_0", "on");
  assert.deepEqual(await review(consent), { approved: 1, unresolved: 0, held: 0 });
  assert(Object.hasOwn(originalJob().answers.layout_confirmations, name));
  assert.deepEqual(await execute(), { success: 1, errors: 0, held: 0 });
}

console.log("Unified import service pagination, authorization, quality gates, immutable clarification, partial hold/resume, stock retry, and reanalysis tests passed.");
