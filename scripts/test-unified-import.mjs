import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseUnifiedImportFile } from "../lib/unified-import/parser.ts";
import { buildImportStorageFileName } from "../lib/storage-object-name.ts";
import { groupUnifiedSaleRows } from "../lib/unified-import/sales-groups.ts";
import { normalizeImportBusinessDate, parseImportDateIso } from "../lib/import-date.ts";

function arrayBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function workbookFixture() {
  const workbook = XLSX.utils.book_new();
  const sales = XLSX.utils.aoa_to_sheet([
    ["売上日", "商品名", "数量", "合計"],
    ["2026-08-22", "ヘッドスパ", 1, 12000],
    ["2026-08-22", "アロマオイル", 2, 6000]
  ]);
  const expenses = XLSX.utils.aoa_to_sheet([
    ["支払日", "支払先", "勘定科目", "支払額"],
    ["2026-08-21", "仕入先A", "消耗品費", 3300]
  ]);
  const customers = XLSX.utils.aoa_to_sheet([
    ["名前", "電話番号", "メール", "備考"],
    ["山田花子", "090-1111-2222", "hanako@example.com", "肩の施術を希望"]
  ]);
  const inventory = XLSX.utils.aoa_to_sheet([
    ["商品名", "棚卸数"],
    ["アロマオイル", 8]
  ]);
  sales.D3 = { t: "n", f: "SUM(3000,3000)", v: 6000 };
  XLSX.utils.book_append_sheet(workbook, sales, "売上");
  XLSX.utils.book_append_sheet(workbook, expenses, "経費");
  XLSX.utils.book_append_sheet(workbook, customers, "顧客");
  XLSX.utils.book_append_sheet(workbook, inventory, "在庫");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsm" });
}

const parsed = await parseUnifiedImportFile("店舗管理_マクロ付き.xlsm", arrayBuffer(workbookFixture()));
assert.equal(parsed.macroEnabled, true);
assert.equal(parsed.fileType, "excel");
assert.deepEqual(parsed.sheets.map((sheet) => sheet.name), ["売上", "経費", "顧客", "在庫"]);
assert.deepEqual(parsed.sheets.map((sheet) => sheet.suggestedRecordType), ["sale", "expense", "customer", "inventory"]);
assert.equal(parsed.rows.length, 5);
assert.equal(parsed.rows.find((row) => row.sheetName === "売上" && row.rowNumber === 3)?.normalizedData.amount, "6000");
assert.ok(parsed.sheets.every((sheet) => sheet.macroNotice?.includes("マクロは実行せず")));

const mixed = await parseUnifiedImportFile("mixed.csv", arrayBuffer(new TextEncoder().encode([
  "区分,日付,商品名,支払先,金額,名前,電話番号",
  "売上,2026-08-22,ヘッドスパ,,12000,,",
  "経費,2026-08-22,,仕入先A,3000,,",
  "顧客,,,,,山田花子,09011112222"
].join("\n"))));
assert.deepEqual(mixed.rows.map((row) => row.suggestedRecordType), ["sale", "expense", "customer"]);
assert.equal(mixed.rows.filter((row) => row.question).length, 0);

const unknown = await parseUnifiedImportFile("unknown.csv", arrayBuffer(new TextEncoder().encode("A,B\nfoo,bar")));
assert.equal(unknown.rows[0]?.suggestedRecordType, "unknown");
assert.equal(unknown.rows[0]?.question, null);
assert.equal(unknown.sheets[0]?.suggestedRecordType, "unknown");

const salonExport = await parseUnifiedImportFile("売上明細.csv", arrayBuffer(new TextEncoder().encode([
  "会計日,会計時間,会計ID,会計区分,区分,ジャンル,カテゴリ,メニュー・店販・割引・サービス・オプション,単価,単価区分,個数,金額,スタッフ,指名,お客様名,お客様番号,お客様名（フリガナ）,予約経路,性別,新規再来",
  "20260822,120000,TX-001,通常,売上,施術,フェイシャル,ハーブピーリング,12000,税込,1,12000,担当A,指名,顧客A,1,コキャクエー,予約サイト,女性,新規",
  "20260822,120000,TX-001,通常,売上,店販,化粧品,美容液,5000,税込,1,5000,担当A,指名,顧客A,1,コキャクエー,予約サイト,女性,新規",
  "20260822,140000,TX-002,通常,売上,施術,ボディ,アロマリンパ,9000,税込,1,9000,担当B,なし,顧客B,2,コキャクビー,電話,女性,再来"
].join("\n"))));
assert.equal(salonExport.sheets[0]?.suggestedRecordType, "sale");
assert.equal(salonExport.sheets[0]?.suggestedMapping?.item_name, "メニュー・店販・割引・サービス・オプション");
assert.equal(salonExport.sheets[0]?.suggestedMapping?.transaction_id, "会計ID");
assert.deepEqual(salonExport.sheets[0]?.missingRequiredFields, []);
assert.equal(salonExport.rows.filter((row) => row.question).length, 0);
assert.equal(salonExport.rows[0]?.normalizedData.staff_name, "担当A");
assert.equal(salonExport.rows[0]?.normalizedData.reservation_channel, "予約サイト");
assert.equal(parseImportDateIso(salonExport.rows[0]?.normalizedData.date, salonExport.rows[0]?.normalizedData.time), "2026-08-22T03:00:00.000Z");
assert.equal(normalizeImportBusinessDate(salonExport.rows[0]?.normalizedData.date), "2026-08-22");
const grouped = groupUnifiedSaleRows(salonExport.rows.map((row, index) => ({ id: `row-${index}`, normalized_data: row.normalizedData })));
assert.deepEqual(grouped.map((rows) => rows.length), [2, 1]);

function excelFixture(sheets, { date1904 = false, hidden = [] } = {}) {
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, sheet, name);
  workbook.Workbook = { WBProps: { date1904 }, Sheets: workbook.SheetNames.map((name) => ({ name, Hidden: hidden.includes(name) ? 1 : 0 })) };
  return arrayBuffer(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

// Generated fixtures only: no customer workbook data belongs in regression tests.
for (const date1904 of [false, true]) {
  const nativeDates = XLSX.utils.aoa_to_sheet([
    ["売上日", "商品名", "金額", "会計時間"],
    [0, "テスト商品", -1200, 0.5]
  ]);
  nativeDates.A2 = { t: "n", v: (Date.UTC(2026, 0, 2) - Date.UTC(1899, 11, 30)) / 86400000 - (date1904 ? 1462 : 0), z: "m/d/yy" };
  nativeDates.C2.z = '#,##0;(#,##0)';
  nativeDates.D2.z = "h:mm";
  const native = await parseUnifiedImportFile("native-dates.xlsx", excelFixture({ 売上: nativeDates }, { date1904 }));
  assert.equal(native.rows[0]?.normalizedData.date, "2026-01-02", `Excel calendar date must honor date1904=${date1904}`);
  assert.equal(native.rows[0]?.normalizedData.amount, "-1200", "Accounting display must not lose the raw sign");
  assert.equal(native.rows[0]?.normalizedData.time, "12:00:00");
  assert.equal(parseImportDateIso(native.rows[0]?.normalizedData.date, native.rows[0]?.normalizedData.time), "2026-01-02T03:00:00.000Z");
}

const physicalRows = await parseUnifiedImportFile("physical-rows.xlsx", excelFixture({ 売上: XLSX.utils.aoa_to_sheet([
  ["テスト用売上台帳"], [], ["売上日", "商品名", "金額"],
  ["2026-01-02", "テストA", 100], [], ["2026-01-03", "テストB", 200],
  ["売上日", "商品名", "金額"], ["2026-01-04", "テストC", 300], ["合計", "", 600]
]) }));
assert.deepEqual(physicalRows.rows.map((row) => row.rowNumber), [4, 6, 8]);
assert.equal(physicalRows.sheets[0]?.headerRowNumber, 3);
assert.ok(physicalRows.sheets[0]?.notices?.some((notice) => notice.includes("繰り返し")));
assert.ok(physicalRows.sheets[0]?.notices?.some((notice) => notice.includes("合計・小計")));

const duplicate = await parseUnifiedImportFile("duplicate.csv", arrayBuffer("日付,商品名,金額,金額\n2026-01-02,テスト商品,100,200"));
assert.deepEqual(duplicate.sheets[0]?.headers, ["日付", "商品名", "金額 [C列]", "金額 [D列]"]);
assert.equal(duplicate.rows[0]?.rawData["金額 [C列]"], "100");
assert.equal(duplicate.rows[0]?.rawData["金額 [D列]"], "200");
assert.equal(duplicate.sheets[0]?.suggestedMapping?.amount, undefined);
assert.deepEqual(duplicate.sheets[0]?.missingRequiredFields, ["amount"]);
assert.equal(duplicate.rows[0]?.question, null, "An unmapped duplicate requires one column question, not a question on every row");
assert.equal(duplicate.sheets[0]?.requiresConfirmation, true);

const csvRows = await parseUnifiedImportFile("physical.csv", arrayBuffer('\n日付,商品名,金額,備考\n2026-01-02,テストA,100,"2行の\nメモ"\n\n2026-01-03,テストB,200,\n'));
assert.deepEqual(csvRows.rows.map((row) => row.rowNumber), [3, 6]);
assert.equal(csvRows.rows[0]?.normalizedData.memo, "2行の\nメモ");
await assert.rejects(() => parseUnifiedImportFile("broken.csv", arrayBuffer('日付,商品名,金額\n2026-01-02,"テスト,100')), /引用符/);

const blocks = await parseUnifiedImportFile("blocks.xlsx", excelFixture({ 管理: XLSX.utils.aoa_to_sheet([
  ["売上日", "商品名", "金額"], ["2026-01-02", "テスト商品", 100], [],
  ["名前", "電話番号", "メール", "備考"], ["テスト顧客", "09000000000", "test@example.invalid", "テスト"]
]) }));
assert.deepEqual(blocks.sheets.map((sheet) => sheet.suggestedRecordType), ["sale", "customer"]);
assert.deepEqual(blocks.rows.map((row) => row.rowNumber), [2, 5]);
assert.equal(new Set(blocks.rows.map((row) => row.sheetName)).size, 2);
const unknownFirst = await parseUnifiedImportFile("unknown-first.csv", arrayBuffer("A,B\nfoo,bar\n\n売上日,商品名,金額\n2026-01-02,テスト商品,100"));
assert.deepEqual(unknownFirst.sheets.map((sheet) => sheet.suggestedRecordType), ["unknown", "sale"]);
assert.deepEqual(unknownFirst.rows.map((row) => row.rowNumber), [2, 5]);
const sideBySide = await parseUnifiedImportFile("side-by-side.xlsx", excelFixture({ 管理: XLSX.utils.aoa_to_sheet([
  ["売上日", "商品名", "合計", "", "支払日", "支払先", "金額"],
  ["2026-01-02", "テスト商品", 100, "", "2026-01-03", "テスト仕入先", 200]
]) }));
assert.deepEqual(sideBySide.sheets.map((sheet) => sheet.suggestedRecordType), ["sale", "expense"]);
assert.deepEqual(sideBySide.rows.map((row) => row.normalizedData.amount), ["100", "200"]);
assert.deepEqual(sideBySide.sheets.map((sheet) => sheet.sourceRange), ["A1:C2", "E1:G2"]);
const unrecognizedSide = await parseUnifiedImportFile("unrecognized-side.csv", arrayBuffer("売上日,商品名,金額,,A,B\n2026-01-02,テスト商品,100,,foo,bar"));
assert.ok(unrecognizedSide.sheets[0]?.blockingIssues?.length, "Unknown neighboring regions must not be silently discarded");
const tabCsv = await parseUnifiedImportFile("tab-export.csv", arrayBuffer("売上日\t商品名\t金額\n2026-01-02\tテスト商品\t100"));
assert.equal(tabCsv.rows[0]?.normalizedData.amount, "100");

const hidden = await parseUnifiedImportFile("hidden.xlsx", excelFixture({
  表示: XLSX.utils.aoa_to_sheet([["売上日", "商品名", "金額"], ["2026-01-02", "テスト商品", 100]]),
  非表示: XLSX.utils.aoa_to_sheet([["売上日", "商品名", "金額"], ["2026-01-02", "非表示商品", 100]])
}, { hidden: ["非表示"] }));
assert.equal(hidden.rows.length, 1);
assert.ok(hidden.notices?.some((notice) => notice.includes("非表示シート「非表示」")));

const invalidValues = await parseUnifiedImportFile("invalid.csv", arrayBuffer("売上日,商品名,金額,数量\n2026-02-30,テストA,1200,1\n2026-01-02,テストB,not-a-number,1\n2026-01-03,テストC,200,invalid"));
assert.ok(invalidValues.rows.every((row) => row.question), "Nonempty invalid dates/amounts/quantities must not be ready");
assert.deepEqual(invalidValues.rows.map((row) => row.missingFields[0]), ["date", "amount", "quantity"]);

const cellErrors = XLSX.utils.aoa_to_sheet([["売上日", "商品名", "金額", "数量"], ["2026-01-02", "テストA", 100, 1], ["2026-01-03", "テストB", 200, 1]]);
cellErrors.C2 = { t: "e", v: 7 };
cellErrors.D3 = { t: "n", f: "1+1" };
const errors = await parseUnifiedImportFile("cell-errors.xlsx", excelFixture({ 売上: cellErrors }));
assert.ok(errors.rows.every((row) => row.question), "Cell error codes and missing formula caches must not become valid numeric values");
const identifiers = XLSX.utils.aoa_to_sheet([["名前", "電話番号"], ["テスト顧客", 9000000000]]);
identifiers.B2.z = "00000000000";
const padded = await parseUnifiedImportFile("identifiers.xlsx", excelFixture({ 顧客: identifiers }));
assert.equal(padded.rows[0]?.normalizedData.phone, "09000000000");

assert.match(buildImportStorageFileName("店舗管理_マクロ付き.xlsm", "0123456789abcdef0123"), /^[a-zA-Z0-9_-]+\.xlsm$/u);
await assert.rejects(() => parseUnifiedImportFile("danger.exe", arrayBuffer("bad")), /XLSM/);
await assert.rejects(() => parseUnifiedImportFile("empty.xlsx", new ArrayBuffer(0)), /空ファイル/);

console.log("Unified import: workbook dates/epochs, accounting values, physical rows, duplicate columns, repeated totals, multiple tables, hidden sheets, semantic validation, and original compatibility tests passed.");
