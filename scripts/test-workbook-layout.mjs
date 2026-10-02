import assert from "node:assert/strict";
import XLSX from "xlsx";
import { extractWorkbookLayouts } from "../lib/unified-import/workbook-layout.ts";

// All workbook contents below are synthetic. Never copy customer workbooks or
// their service/staff names into fixtures, logs committed to git, or snapshots.
const put = (sheet, address, v, f) => { sheet[address] = { t: typeof v === "number" ? "n" : "s", v, ...(f ? { f } : {}) }; };
function monthSheet(month = 1) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [], [null, null, `${month}月`], [null, null, "総合計"],
    [null, null, null, "Service A", "Service A", "Service C", "合計"],
    [null, "件数", "1日", 2, 1, 0, 3],
    [null, "金額", null, 100, 50, 0, 150],
    [null, null, "2日", 0, -1, null, -1],
    [null, null, null, 0, -20, null, -20],
    [null, null, "合計", 2, 0, 0, 2],
    [null, null, null, 100, 30, 0, 130]
  ]);
  put(sheet, "D6", 100, "D16");
  put(sheet, "D5", 2, "D15");
  put(sheet, "E5", 1, "E15");
  put(sheet, "E6", 50, "E16");
  put(sheet, "F6", 0, "F16");
  put(sheet, "D8", 0, "D18");
  put(sheet, "E8", -20, "E18");
  put(sheet, "E7", -1, "E17");
  XLSX.utils.sheet_add_aoa(sheet, [
    [null, null, "担当内訳合計"],
    [null, null, null, "Service A", "Service A", "Service C", "合計"],
    [null, "件数", "1日", 2, 1, 0, 3],
    [null, "金額", null, 100, 50, 0, 150],
    [null, null, "2日", 0, -1, null, -1],
    [null, null, null, 0, -20, null, -20],
    [null, null, "合計", 2, 0, 0, 2],
    [null, null, null, 100, 30, 0, 130]
  ], { origin: "A13" });
  // Two independent side-by-side expense ledgers, with the total label one
  // column before the first ledger's date column (as in many printed reports).
  XLSX.utils.sheet_add_aoa(sheet, [["日付", "用途", "金額"], [46023, "Expense A", 12], [46024, "Expense B", -2], [null, null, 10]], { origin: "J5" });
  put(sheet, "I8", "合計");
  XLSX.utils.sheet_add_aoa(sheet, [["日付", "用途", "金額"], ["2026-01-01", "Expense C", 0], ["合計", null, 0]], { origin: "N5" });
  return sheet;
}
function fixture({ year = 2026, secondMonth = false } = {}) {
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([[], [], [null, null, year ? `${year}年分` : "累計"], [], ["月", "合計"], ["1月", 130]]);
  put(summary, "B6", 130, "'1月'!G10");
  XLSX.utils.book_append_sheet(workbook, summary, "累計");
  XLSX.utils.book_append_sheet(workbook, monthSheet(), "1月");
  if (secondMonth) XLSX.utils.book_append_sheet(workbook, monthSheet(2), "2月");
  return workbook;
}
function sale(result, name = "1月") { return result.tables.find((table) => table.kind === "sale" && table.sourceSheetName === name); }

const result = extractWorkbookLayouts(fixture({ secondMonth: true }));
const sales = sale(result);
assert.equal(result.tables.filter((table) => table.kind === "sale").length, 2);
assert.equal(sales.rows.length, 3, "staff detail and summary totals must not be imported twice");
assert.deepEqual(sales.rows.map((row) => row.rawData.売上金額), ["100", "50", "-20"]);
assert.deepEqual(sales.rows.map((row) => row.rawData.数量), ["2", "1", "-1"]);
assert.equal(sales.rows[0].rawData.売上日, "2026-01-01");
assert.equal(sale(result, "2月").rows[0].rawData.売上日, "2026-02-01");
assert.deepEqual(sales.rows.map((row) => row.sourceColumn), ["D", "E", "E"]);
assert.deepEqual(sales.rows.map((row) => row.sourceRowNumber), [6, 6, 8]);
assert.equal(sales.rows[0].sourceRange, "D5:D6");
assert.equal(sales.rows[0].rawData.元セル, "D5:D6");
assert.equal(sales.rows[0].rawData.データ粒度, "日別サービス別集計");
assert.deepEqual(sales.rows.map((row) => row.rowNumber), [1, 2, 3]);
assert.equal(sales.blockingIssues.length, 0);
assert.equal(sales.requiresConfirmation, true);
assert.ok(sales.notices.some((notice) => notice.includes("同名サービス")));
assert.ok(sales.notices.some((notice) => notice.includes("重複計上")));
assert.ok(sales.notices.some((notice) => notice.includes("負数")));
assert.ok(sales.notices.some((notice) => notice.includes("保存値 130 / 抽出合計 130")));
const summary = result.tables.find((table) => table.kind === "ignore");
assert.equal(summary.sourceSheetName, "累計");
assert.equal(summary.rows.length, 0);
assert.ok(summary.excludedReason.includes("二重計上"));
const expenses = result.tables.filter((table) => table.kind === "expense" && table.sourceSheetName === "1月");
assert.equal(expenses.length, 2);
assert.equal(expenses[0].rows.length, 2);
assert.equal(expenses[0].rows[0].sourceRange, "J6:L6");
assert.equal(expenses[0].rows[0].rawData.経費日, "2026-01-01");
assert.equal(expenses[0].rows[1].rawData.経費金額, "-2");
assert.equal(expenses[0].mapping.vendor_name, undefined);
assert.equal(expenses[1].rows[0].rawData.経費金額, "0", "explicit zero expense with date/purpose is not a blank row");
assert.equal(expenses[0].blockingIssues.length, 0);

const missingYear = extractWorkbookLayouts(fixture({ year: null }));
assert.ok(sale(missingYear).blockingIssues.some((issue) => issue.includes("対象年")));
assert.equal(sale(missingYear).rows[0].rawData.売上日, "1月1日", "never substitute the current year");

const missingCacheBook = fixture();
missingCacheBook.Sheets["1月"].D6 = { t: "n", f: "D16" };
const missingCache = sale(extractWorkbookLayouts(missingCacheBook));
assert.ok(missingCache.blockingIssues.some((issue) => issue.includes("D6") && issue.includes("保存済み計算結果")));
assert.equal(missingCache.rows[0].rawData.売上金額, "");
// SheetJS fabricates v:0 for a no-cache formula only when retaining stubs.
// Treat that stub as unavailable, never as a successfully calculated zero.
const serializedCacheBook = XLSX.read(XLSX.write(missingCacheBook, { type: "buffer", bookType: "xlsx" }), { cellFormula: true, sheetStubs: true });
assert.equal(serializedCacheBook.Sheets["1月"].D6.t, "z");
assert.ok(sale(extractWorkbookLayouts(serializedCacheBook)).blockingIssues.some((issue) => issue.includes("保存済み計算結果")));
const errorBook = fixture();
errorBook.Sheets["1月"].D6 = { t: "e", v: 15 };
assert.ok(sale(extractWorkbookLayouts(errorBook)).blockingIssues.some((issue) => issue.includes("エラー値")));

const mismatchedDateBook = fixture();
put(mismatchedDateBook.Sheets["1月"], "J6", "2025-01-01");
const mismatchedExpense = extractWorkbookLayouts(mismatchedDateBook).tables.find((table) => table.kind === "expense");
assert.ok(mismatchedExpense.blockingIssues.some((issue) => issue.includes("1件の経費日")));
assert.equal(mismatchedExpense.rows[0].rawData.経費日, "2025-01-01", "conflicting date must never be silently corrected");
const missingDateBook = fixture();
put(missingDateBook.Sheets["1月"], "J6", "1/1");
assert.ok(extractWorkbookLayouts(missingDateBook).tables.find((table) => table.kind === "expense").blockingIssues.some((issue) => issue.includes("年を含む有効な経費日")));

const totalsBook = fixture();
put(totalsBook.Sheets["1月"], "G10", 131);
put(totalsBook.Sheets["1月"], "G6", 151);
put(totalsBook.Sheets["1月"], "D10", 101);
const totals = sale(extractWorkbookLayouts(totalsBook));
for (const coordinate of ["G10", "G6", "D10"]) assert.ok(totals.blockingIssues.some((issue) => issue.includes(coordinate) && issue.includes("一致しません")));

const adjustedBook = fixture();
put(adjustedBook.Sheets["1月"], "G11", 110, "G10-20");
put(adjustedBook.Sheets["累計"], "B6", 110, "SUM('1月'!G11)");
const adjusted = sale(extractWorkbookLayouts(adjustedBook));
assert.equal(adjusted.rows.reduce((sum, row) => sum + Number(row.rawData.売上金額), 0), 130);
assert.ok(adjusted.blockingIssues.some((issue) => issue.includes("調整後合計（110）") && issue.includes("差額（-20）")));
assert.ok(adjusted.notices.some((notice) => notice.includes("新しい売上や値引きとして自動作成していません")));

const hiddenBook = fixture({ secondMonth: true });
hiddenBook.Workbook = { Sheets: hiddenBook.SheetNames.map((name) => ({ name, Hidden: name === "2月" ? 1 : 0 })) };
assert.equal(extractWorkbookLayouts(hiddenBook).tables.some((table) => table.sourceSheetName === "2月"), false);

const independentBook = fixture();
for (const coordinate of ["D5", "E5", "E7", "D6", "E6", "F6", "D8", "E8"]) delete independentBook.Sheets["1月"][coordinate].f;
assert.ok(sale(extractWorkbookLayouts(independentBook)).blockingIssues.some((issue) => issue.includes("重複・独立")));
const partiallyReferencedBook = fixture();
delete partiallyReferencedBook.Sheets["1月"].E8.f;
assert.ok(sale(extractWorkbookLayouts(partiallyReferencedBook)).blockingIssues.some((issue) => issue.includes("重複・独立")), "one uncovered nonzero detail cell prevents whole-table exclusion");
for (const malformed of ["1,2", "1 2"]) {
  const malformedBook = fixture();
  put(malformedBook.Sheets["1月"], "D6", malformed);
  const malformedSale = sale(extractWorkbookLayouts(malformedBook));
  assert.ok(malformedSale.blockingIssues.some((issue) => issue.includes("D6") && issue.includes("数値")));
  assert.equal(malformedSale.rows[0].rawData.売上金額, "");
}
const otherTableBook = fixture();
XLSX.utils.sheet_add_aoa(otherTableBook.Sheets["1月"], [["取引日", "支払先", "用途", "金額"], ["2026-01-01", "Vendor A", "Expense D", 20]], { origin: "R5" });
assert.ok(sale(extractWorkbookLayouts(otherTableBook)).blockingIssues.some((issue) => issue.includes("R5") && issue.includes("取り落とし")));
const mixedSummaryBook = fixture();
XLSX.utils.sheet_add_aoa(mixedSummaryBook.Sheets["累計"], [["日付", "商品名", "金額"], ["2026-01-01", "Service Z", 20]], { origin: "A20" });
const mixedSummary = extractWorkbookLayouts(mixedSummaryBook);
assert.ok(!mixedSummary.handledSheetNames.includes("累計"));
assert.ok(mixedSummary.notices.some((notice) => notice.includes("シート全体を参照集計として除外していません")));
const unrelatedBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(unrelatedBook, XLSX.utils.aoa_to_sheet([["Name", "Amount"], ["A", 100]]), "Data");
assert.deepEqual(extractWorkbookLayouts(unrelatedBook).handledSheetNames, []);

console.log("Synthetic workbook layout tests passed: matrices, duplicate columns, source cells, cached formulas, reconciliation, side expenses, hidden sheets, and summary exclusion.");
