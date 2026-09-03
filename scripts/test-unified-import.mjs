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

assert.match(buildImportStorageFileName("店舗管理_マクロ付き.xlsm", "0123456789abcdef0123"), /^[a-zA-Z0-9_-]+\.xlsm$/u);
await assert.rejects(() => parseUnifiedImportFile("danger.exe", arrayBuffer("bad")), /XLSM/);
await assert.rejects(() => parseUnifiedImportFile("empty.xlsx", new ArrayBuffer(0)), /空ファイル/);

console.log("Unified XLSM, multi-sheet classification, question, and safe filename tests passed.");
