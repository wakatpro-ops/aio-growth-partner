import assert from "node:assert/strict";
import * as XLSX from "xlsx/xlsx.mjs";
import { createImportClarificationIssue, resolveImportClarification, selectActiveImportResolutions } from "../lib/unified-import/clarification.ts";
import { parseUnifiedImportFile } from "../lib/unified-import/parser.ts";

// Synthetic-only fixtures: no customer files, staff names, or private values.
const source = { sheetName: "Synthetic", range: "A1:D50" };
const issue = (code, extra = {}) => createImportClarificationIssue({ tableName: "Table", code, message: `Synthetic ${code}`, source, ...extra });
function fixture({ kind = "sale", values = [{ date: "2026-01-01", item_name: "Service A", quantity: "1", amount: "100" }], issues = [], checks = [] } = {}) {
  return {
    sheets: [{ name: "Table", sourceSheetName: "Synthetic", sourceRange: "A1:D50", headerRowNumber: 1, headers: ["date", "amount", "quantity"], rowCount: values.length,
      suggestedRecordType: kind, confidence: 1, suggestedMapping: { date: "date", amount: "amount", quantity: "quantity", item_name: "item_name", ...(kind === "expense" ? {} : { vendor_name: "vendor_name" }) },
      clarification: { version: 1, issues, checks, period: { year: 2026, month: 1 } }, blockingIssues: issues.map((item) => item.message) }],
    rows: values.map((normalizedData, index) => ({ sheetName: "Table", rowNumber: index + 1, suggestedRecordType: kind, confidence: 1, normalizedData: { ...normalizedData }, rawData: { 原本: `Synthetic row ${index + 1}`, 元日: String(Number(String(normalizedData.date).match(/(\d{1,2})(?:日)?$/u)?.[1] ?? 1)) }, missingFields: [], question: null }))
  };
}
const answer = (target, action, fields = {}) => ({ id: `resolution-${action}`, tableName: "Table", issueIds: [target.id], action, reason: "原本を確認し、この内容で取り込むと判断しました。", ...fields });
function pending(result, code, field) { return result.issues.find((item) => item.code === code && (!field || item.field === field)); }

const unchanged = fixture();
const snapshot = structuredClone(unchanged);
assert.equal(resolveImportClarification(unchanged).quality, "normal");
assert.deepEqual(unchanged, snapshot, "evaluation never mutates original inputs");
assert.equal(issue("report_period").id, issue("report_period", { message: "Different display wording" }).id);

const period = issue("report_period", { details: { year: null, month: null } });
const month = fixture({ issues: [period], values: [{ date: "?月31日", item_name: "Service A", quantity: "1", amount: "100" }] });
const setPeriod = answer(period, "set_period", { scope: "report", year: 2026, month: 4 });
const monthResolved = resolveImportClarification({ ...month, resolutions: [setPeriod] });
assert.deepEqual(monthResolved.acceptedResolutionIds, [setPeriod.id]);
assert.equal(monthResolved.rows[0].normalizedData.date, "2026-04-31");
assert.equal(pending(monthResolved, "report_period"), undefined, "accepted period is not asked again");
assert.ok(pending(monthResolved, "invalid_date"), "month replacement never rolls invalid 31st into another month");
assert.equal(monthResolved.quality, "clarifiable");
assert.deepEqual(monthResolved.rows[0].rawData, month.rows[0].rawData);
const dateFix = answer(pending(monthResolved, "invalid_date"), "correct_values", { corrections: [{ rowNumber: 1, field: "date", value: "2026-04-30" }] });
const fixedMonth = resolveImportClarification({ ...month, resolutions: [setPeriod, dateFix] });
assert.equal(fixedMonth.quality, "normal");
assert.equal(fixedMonth.rows[0].normalizedData.date, "2026-04-30");
assert.deepEqual(resolveImportClarification({ ...month, resolutions: [setPeriod, dateFix] }), fixedMonth, "deterministic history replay");
assert.equal(resolveImportClarification({ ...month, resolutions: [{ ...setPeriod, year: 0 }] }).rejectedResolutions.length, 1);

const expensePeriod = issue("expense_period", { details: { year: 2026, month: 1 } });
const expenses = fixture({ kind: "expense", issues: [expensePeriod], values: [{ date: "2025-01-02", amount: "10", category_name: "Supplies" }, { date: "2025-01-03", amount: "20", category_name: "Travel" }] });
const expenseState = resolveImportClarification(expenses);
const vendor = pending(expenseState, "missing_field", "vendor_name");
assert.equal(expenseState.issues.filter((item) => item.field === "vendor_name").length, 1, "one vendor question for the whole table");
const keepDates = answer(expensePeriod, "keep_expense_dates");
const setVendor = answer(vendor, "set_default", { field: "vendor_name", value: "User-confirmed vendor" });
const kept = resolveImportClarification({ ...expenses, resolutions: [keepDates, setVendor] });
assert.equal(kept.quality, "normal");
assert.equal(kept.rows[0].normalizedData.date, "2025-01-02");
assert.equal(kept.rows[0].normalizedData.vendor_name, "User-confirmed vendor");
assert.equal(kept.rows[0].rawData.vendor_name, undefined);
const movedExpenses = resolveImportClarification({ ...expenses, resolutions: [answer(expensePeriod, "set_period", { scope: "expense", year: 2026, month: 2 }), setVendor] });
assert.deepEqual(movedExpenses.rows.map((row) => row.normalizedData.date), ["2026-02-02", "2026-02-03"]);
assert.equal(movedExpenses.quality, "normal");

const subtotal = issue("reconciliation", { field: "amount", rowNumbers: [1], details: { expected: 120, actual: 100, delta: 20 } });
const checked = fixture({ issues: [subtotal], checks: [{ id: subtotal.id, tableName: "Table", field: "amount", expected: 120, rowNumbers: [1], source }] });
const detailed = answer(subtotal, "use_details", { observedTotals: { [subtotal.id]: 100 } });
assert.equal(resolveImportClarification({ ...checked, resolutions: [detailed] }).quality, "normal");
assert.equal(resolveImportClarification({ ...checked, resolutions: [{ ...detailed, observedTotals: { [subtotal.id]: 120 } }] }).rejectedResolutions.length, 1);
assert.equal(resolveImportClarification({ ...checked, resolutions: [{ ...detailed, reason: "" }] }).rejectedResolutions.length, 1);
assert.equal(resolveImportClarification({ ...checked, resolutions: [answer(subtotal, "confirm_layout")] }).rejectedResolutions.length, 1, "checkbox is not reconciliation consent");

const quantitySubtotal = issue("reconciliation", { field: "quantity", rowNumbers: [1], details: { expected: 2, actual: -2, delta: 4 } });
const changed = fixture({ issues: [quantitySubtotal], checks: [{ id: quantitySubtotal.id, tableName: "Table", field: "quantity", expected: 2, rowNumbers: [1], source }], values: [{ date: "2026-01-01", item_name: "Service A", amount: 100, quantity: -2 }] });
const invalidQuantity = pending(resolveImportClarification(changed), "invalid_number", "quantity");
const changedAnswer = answer(quantitySubtotal, "use_details", { observedTotals: { [quantitySubtotal.id]: -2 } });
const quantityFix = answer(invalidQuantity, "correct_values", { corrections: [{ rowNumber: 1, field: "quantity", value: 2 }] });
const changedResult = resolveImportClarification({ ...changed, resolutions: [changedAnswer, quantityFix] });
assert.ok(changedResult.rejectedResolutions.some((item) => item.id === changedAnswer.id), "later numeric changes invalidate prior monetary evidence consent");

const adjustment = issue("adjustment", { details: { expected: 80, actual: 100, delta: -20 } });
const adjusted = fixture({ issues: [adjustment] });
const useGross = answer(adjustment, "use_gross", { observedGross: 100, observedAdjusted: 80 });
const gross = resolveImportClarification({ ...adjusted, resolutions: [useGross] });
assert.equal(gross.quality, "normal");
assert.equal(gross.rows.length, 1);
assert.equal(gross.rows[0].normalizedData.amount, "100");
const explicitAdjustment = answer(adjustment, "sales_adjustment", { date: "2026-01-31", signedAmount: -20, itemName: "Confirmed adjustment", observedGross: 100, observedAdjusted: 80 });
const adjustedResult = resolveImportClarification({ ...adjusted, resolutions: [explicitAdjustment, explicitAdjustment] });
assert.equal(adjustedResult.quality, "normal");
assert.equal(adjustedResult.rows.length, 2, "idempotent adjustment replay does not duplicate rows");
assert.equal(adjustedResult.rows[1].normalizedData.amount, -20);
assert.equal(adjustedResult.rows[1].normalizedData.quantity, 1);
assert.equal(adjustedResult.rows[1].normalizedData.clarification_adjustment, true);
assert.equal(adjustedResult.rows[1].rawData.確認回答ID, explicitAdjustment.id);
assert.equal(resolveImportClarification({ ...adjusted, resolutions: [{ ...explicitAdjustment, signedAmount: 20 }] }).rejectedResolutions.length, 1);
assert.equal(resolveImportClarification({ ...adjusted, resolutions: [{ ...explicitAdjustment, date: "2026-02-31" }] }).rejectedResolutions.length, 1);
assert.equal(resolveImportClarification({ ...adjusted, resolutions: [{ ...useGross, observedGross: 99 }] }).rejectedResolutions.length, 1);
assert.equal(resolveImportClarification({ ...adjusted, resolutions: [useGross, explicitAdjustment] }).rejectedResolutions.length, 1, "mutually exclusive financial treatments");

for (const code of ["source_missing", "source_error", "unclaimed_structure", "unproven_coverage", "label_conflict"]) {
  const hard = issue(code);
  const blocked = fixture({ issues: [hard] });
  assert.equal(resolveImportClarification(blocked).quality, "unprocessable");
  const bypass = resolveImportClarification({ ...blocked, resolutions: [answer(hard, "use_details", { observedTotals: { [hard.id]: 100 } })] });
  assert.equal(bypass.quality, "unprocessable");
  assert.equal(bypass.rejectedResolutions.length, 1);
  const held = resolveImportClarification({ ...blocked, heldTables: ["Table"] });
  assert.equal(held.quality, "normal");
  assert.equal(held.rows.length, 1, "holding is not deletion");
  assert.equal(held.sheets[0].clarification.issues[0].code, code);
}

const unusable = fixture({ values: Array.from({ length: 20 }, () => ({ date: "not-a-date", item_name: "Service A", amount: "1,2", quantity: 1 })) });
assert.equal(resolveImportClarification(unusable).quality, "unprocessable");
assert.deepEqual(resolveImportClarification(unusable).qualityMetrics, { candidateRows: 20, invalidCriticalRows: 20, invalidDateRows: 20, invalidNumberRows: 20, invalidRatio: 1, hardThresholdTriggered: true });
const lowVolume = { ...unusable, rows: unusable.rows.slice(0, 19) };
assert.equal(resolveImportClarification(lowVolume).quality, "clarifiable");
const dateOnly = fixture({ values: Array.from({ length: 20 }, () => ({ date: "not-a-date", item_name: "Service A", amount: "100", quantity: 1 })) });
assert.equal(resolveImportClarification(dateOnly).quality, "clarifiable", "one repeated repairable date pattern is not a multi-failure hard rejection");
const expectedPeriod = fixture({ issues: [period], values: Array.from({ length: 20 }, () => ({ date: "?月1日", item_name: "Service A", amount: "100", quantity: 1 })) });
assert.equal(resolveImportClarification(expectedPeriod).qualityMetrics.invalidDateRows, 0, "known missing period does not poison quality metrics");

// Parser integration: objective typed evidence, no message-to-code regex.
const workbook = XLSX.utils.book_new();
const flat = XLSX.utils.aoa_to_sheet([["売上日", "商品名", "金額"], ["2026-01-01", "Service A", 100]]);
flat.C2 = { t: "n", f: "1+1" };
XLSX.utils.book_append_sheet(workbook, flat, "Synthetic");
const encoded = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
const parsed = await parseUnifiedImportFile("synthetic.xlsx", encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength));
assert.ok(parsed.sheets[0].clarification.issues.some((item) => item.code === "source_missing" && item.source.cells.includes("C2")));
assert.equal(resolveImportClarification(parsed).quality, "unprocessable");

// Persistence contract: current summaries/rows are previews, originals are the
// replay source. New answers supersede overlapping question IDs, not history.
function snapshotStore(original) {
  const first = resolveImportClarification(original);
  return { current: first, originalSheets: structuredClone(original.sheets), baselineRows: structuredClone(original.rows), auditHistory: [] };
}
function calculateSnapshot(store, additions) {
  const history = [...store.auditHistory, ...additions];
  const effective = selectActiveImportResolutions(history);
  return resolveImportClarification({ sheets: store.current.sheets.map((sheet) => store.originalSheets.find((original) => original.name === sheet.name) ?? sheet), rows: store.baselineRows, resolutions: effective });
}
function approveSnapshot(store, addition) {
  const result = calculateSnapshot(store, [addition]);
  assert.ok(!result.rejectedResolutions.some((entry) => entry.id === addition.id));
  store.auditHistory.push(structuredClone(addition));
  store.current = result;
  return result;
}
const partialStore = snapshotStore(fixture({ values: [
  { date: "2026-02-31", item_name: "Service A", amount: "100", quantity: 1 },
  { date: "2026-04-31", item_name: "Service B", amount: "200", quantity: 1 }
] }));
const firstDateIssue = pending(partialStore.current, "invalid_date");
assert.deepEqual(firstDateIssue.rowNumbers, [1, 2]);
approveSnapshot(partialStore, answer(firstDateIssue, "correct_values", { id: "fix-first-date", corrections: [{ rowNumber: 1, field: "date", value: "2026-02-28" }] }));
const secondDateIssue = pending(partialStore.current, "invalid_date");
assert.deepEqual(secondDateIssue.rowNumbers, [2]);
assert.notEqual(firstDateIssue.id, secondDateIssue.id, "partial correction leaves a source-scoped residual question");
approveSnapshot(partialStore, answer(secondDateIssue, "correct_values", { id: "fix-second-date", corrections: [{ rowNumber: 2, field: "date", value: "2026-04-30" }] }));
assert.equal(partialStore.current.quality, "normal");
assert.deepEqual(partialStore.current.rows.map((row) => row.normalizedData.date), ["2026-02-28", "2026-04-30"]);
assert.deepEqual(calculateSnapshot(partialStore, []).rows, partialStore.current.rows);
assert.deepEqual(partialStore.baselineRows.map((row) => row.normalizedData.date), ["2026-02-31", "2026-04-31"]);

const periodStore = snapshotStore(month);
approveSnapshot(periodStore, setPeriod);
assert.equal(pending(periodStore.current, "report_period"), undefined);
const acceptedPeriodResidual = pending(periodStore.current, "invalid_date");
approveSnapshot(periodStore, answer(acceptedPeriodResidual, "correct_values", { id: "date-after-period-approval", corrections: [{ rowNumber: 1, field: "date", value: "2026-04-30" }] }));
assert.equal(periodStore.current.quality, "normal");
assert.equal(periodStore.current.rows[0].normalizedData.date, "2026-04-30");
assert.equal(periodStore.current.acceptedResolutionIds.filter((id) => id === setPeriod.id).length, 1);

const replacePeriodStore = snapshotStore(month);
approveSnapshot(replacePeriodStore, setPeriod);
approveSnapshot(replacePeriodStore, { ...setPeriod, id: "replace-period", month: 5 });
assert.equal(replacePeriodStore.current.rows[0].normalizedData.date, "2026-05-31");
assert.equal(replacePeriodStore.current.quality, "normal");
assert.equal(replacePeriodStore.auditHistory.length, 2, "superseded answer remains in immutable history");
assert.deepEqual(replacePeriodStore.current.acceptedResolutionIds, ["replace-period"]);

const monetaryStore = snapshotStore(adjusted);
approveSnapshot(monetaryStore, useGross);
assert.equal(monetaryStore.current.rows.length, 1);
approveSnapshot(monetaryStore, explicitAdjustment);
assert.equal(monetaryStore.current.rows.length, 2);
assert.equal(monetaryStore.current.rows[1].normalizedData.source_resolution_id, explicitAdjustment.id);
assert.deepEqual(monetaryStore.current.acceptedResolutionIds, [explicitAdjustment.id]);
approveSnapshot(monetaryStore, { ...useGross, id: "return-to-gross" });
assert.equal(monetaryStore.current.rows.length, 1, "RPC must prune the superseded unposted derived adjustment absent from this result");
assert.equal(monetaryStore.auditHistory.length, 3);
const auditedHistory = [
  { tableName: "Table", issueIds: ["q1"], actorId: "manager-A", approvedAt: "2026-01-01" },
  { tableName: "Other", issueIds: ["q1"], actorId: "manager-B", approvedAt: "2026-01-02" },
  { tableName: "Table", issueIds: ["q1"], actorId: "manager-C", approvedAt: "2026-01-03" }
];
const untouchedHistory = structuredClone(auditedHistory);
assert.deepEqual(selectActiveImportResolutions(auditedHistory).map((entry) => entry.actorId), ["manager-B", "manager-C"]);
assert.deepEqual(auditedHistory, untouchedHistory);
assert.equal(selectActiveImportResolutions([{ tableName: "Table", issueIds: ["q1", "q2"] }, { tableName: "Table", issueIds: ["q1"] }]).length, 1, "partial overlap invalidates earlier combined decision in full");
console.log("Import clarification: deterministic replay, source preservation, periods, individual fixes, defaults, monetary evidence, signed adjustments, hard stops, holds, and objective quality gates passed.");
