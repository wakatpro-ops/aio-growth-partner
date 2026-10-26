import assert from "node:assert/strict";
import { test } from "node:test";
import { expenseMonthBounds, expenseOverview, validExpenseMonth } from "../../lib/accounting/overview-rules.ts";

const row = (id, amount, extra = {}) => ({ id, receipt_date: "2026-10-03", vendor_name: "架空支払先", category_name: "仕入", total_amount: amount, approval_status: "approved", ...extra });

test("month validation and year boundary", () => {
  assert.deepEqual(expenseMonthBounds("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
  for (const value of ["2026-00", "2026-13", "2026-1", "bad", ["2026-10"], undefined]) assert(!validExpenseMonth(value));
  assert.throws(() => expenseMonthBounds("2026-13"));
});
test("month/active filters, pending status, duplicates and unknown values are explicit", () => {
  const report = expenseOverview([
    row("one", "1200.1"), row("two", "400.2", { category_name: "光熱費", approval_status: "draft" }),
    row("archived", 9999, { archived_at: "2026-10-01" }), row("othermonth", 9999, { receipt_date: "2026-09-01" }),
    row("undated", 9999, { receipt_date: null }), row("duplicate", 9999, { duplicate_of_id: "one" }),
    row("null", null), row("nan", "bad"), row("blank", ""), row("zero", 0, { category_name: " " })
  ], "2026-10");
  assert.equal(report.total, 1600.3); assert.equal(report.count, 3); assert.equal(report.pendingCount, 1);
  assert.equal(report.duplicateCount, 1); assert.equal(report.invalidCount, 3);
  assert(report.breakdown.some(r => r.label === "未分類"));
  assert.deepEqual(report.entries.map(r => r.id), ["one", "two", "zero"]);
});
test("all categories reconcile; only additive categories group; any negative line forbids donut", () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(String(i), (i + 1) * 100, { category_name: `分類${i}` }));
  const report = expenseOverview(rows, "2026-10");
  assert.equal(report.breakdown.length, 12); assert.equal(report.chart.length, 6);
  assert.equal(report.chart.reduce((s, r) => s + r.amount, 0), report.total);
  const adjusted = expenseOverview([row("a", 1200), row("b", -100)], "2026-10");
  assert.equal(adjusted.total, 1100); assert.equal(adjusted.hasNegative, true);
  assert.equal(adjusted.entries[1].amount, -100);
});
test("empty is empty, not fictional accounting data", () => {
  const result = expenseOverview([], "2026-10");
  assert.equal(result.total, 0); assert.equal(result.count, 0); assert.deepEqual(result.chart, []);
});
