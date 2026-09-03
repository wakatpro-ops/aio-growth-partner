import { createHash } from "node:crypto";
import { parseImportDateIso } from "../import-date.ts";
import type { DataColumnMapping, NormalizedSalesPreviewRow, ParsedSalesRow, StandardSalesField } from "@/types/phase4";

export const standardSalesFields: Array<{ key: StandardSalesField; label: string; required?: boolean }> = [
  { key: "ignore", label: "取り込まない" },
  { key: "sale_date", label: "売上日", required: true },
  { key: "transaction_id", label: "取引ID" },
  { key: "item_name", label: "商品名", required: true },
  { key: "item_code", label: "商品コード" },
  { key: "category_name", label: "カテゴリ" },
  { key: "quantity", label: "数量" },
  { key: "unit_price", label: "単価" },
  { key: "subtotal", label: "小計" },
  { key: "tax_amount", label: "税額" },
  { key: "gross_amount", label: "合計", required: true },
  { key: "discount_amount", label: "値引き" },
  { key: "payment_method", label: "支払方法" },
  { key: "customer_name", label: "顧客名" },
  { key: "channel", label: "チャネル" },
  { key: "memo", label: "メモ" }
];

export type ParsedImportFile = {
  importType: "csv" | "excel" | "pdf" | "google_sheets";
  encoding: string;
  delimiter: string | null;
  headers: string[];
  rows: ParsedSalesRow[];
  sampleRows: ParsedSalesRow[];
};

export const MAX_IMPORT_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

function cleanCell(value: unknown) {
  return String(value ?? "").trim();
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function decodeCsv(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const utf8 = stripBom(new TextDecoder("utf-8").decode(bytes));
  if (!utf8.includes("\uFFFD")) return { text: utf8, encoding: "utf-8" };
  try {
    return { text: stripBom(new TextDecoder("shift_jis").decode(bytes)), encoding: "shift_jis" };
  } catch {
    return { text: utf8, encoding: "utf-8" };
  }
}

function detectDelimiter(text: string) {
  const sample = text.split(/\r?\n/u).slice(0, 10).join("\n");
  const tabs = (sample.match(/\t/gu) ?? []).length;
  const commas = (sample.match(/,/gu) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

function rowsToObjects(matrix: string[][]) {
  const headers = (matrix[0] ?? []).map((header, index) => cleanCell(header) || `column_${index + 1}`);
  const rows = matrix.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, cleanCell(line[index])])));
  return { headers, rows };
}

function assertUsableRows(headers: string[], rows: ParsedSalesRow[]) {
  if (headers.length === 0 || rows.length === 0) throw new Error("売上データの行を確認できませんでした。空ファイルまたは見出しだけのファイルは取り込めません。");
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`一度に取り込めるのは${MAX_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
}

async function parsePdf(buffer: ArrayBuffer): Promise<ParsedImportFile> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const tableResult = await parser.getTable();
    let matrix = tableResult.mergedTables.flatMap((table) => table.filter((row) => row.some((cell) => cleanCell(cell))));
    if (matrix.length < 2) {
      const textResult = await parser.getText();
      const extracted = textResult.text
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => Boolean(line) && !/^--\s*\d+\s+of\s+\d+\s*--$/iu.test(line))
        .map((line) => line.split(/\t|\s{2,}|,/u).map(cleanCell).filter(Boolean))
        .map((cells) => cells.length === 1 ? cells[0].split(/\s+/u).map(cleanCell).filter(Boolean) : cells)
        .filter((row) => row.length >= 2);
      const headerIndex = extracted.findIndex((row) => row.filter((cell) => suggestSalesField(cell).field !== "ignore").length >= 2);
      if (headerIndex >= 0) {
        const headers = extracted[headerIndex];
        const itemColumn = headers.findIndex((header) => ["item_name", "customer_name"].includes(suggestSalesField(header).field));
        matrix = [headers, ...extracted.slice(headerIndex + 1).map((row) => {
          if (row.length <= headers.length || itemColumn < 0) return row;
          const overflow = row.length - headers.length;
          return [...row.slice(0, itemColumn), row.slice(itemColumn, itemColumn + overflow + 1).join(" "), ...row.slice(itemColumn + overflow + 1)];
        }).filter((row) => row.join("|") !== headers.join("|"))];
      } else {
        matrix = extracted;
      }
    }
    const { headers, rows } = rowsToObjects(matrix);
    assertUsableRows(headers, rows);
    return { importType: "pdf", encoding: "pdf-text", delimiter: null, headers, rows, sampleRows: rows.slice(0, 10) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDFを解析できませんでした。";
    throw new Error(`PDFから表形式の売上データを読み取れませんでした。文字を選択できる売上帳票か確認してください: ${message}`);
  } finally {
    await parser.destroy();
  }
}

export async function parseImportFile(fileName: string, buffer: ArrayBuffer): Promise<ParsedImportFile> {
  const lowerName = fileName.toLowerCase();
  if (buffer.byteLength === 0) throw new Error("空ファイルは取り込めません。");
  if (buffer.byteLength > MAX_IMPORT_FILE_SIZE) throw new Error("ファイルは4MB以下にしてください。");
  if (lowerName.endsWith(".pdf")) return parsePdf(buffer);
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".xlsm")) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: false, bookVBA: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
    const { headers, rows } = rowsToObjects(matrix.map((row) => row.map(cleanCell)));
    assertUsableRows(headers, rows);
    return {
      importType: "excel",
      encoding: "binary",
      delimiter: null,
      headers,
      rows,
      sampleRows: rows.slice(0, 10)
    };
  }

  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".tsv")) throw new Error("CSV、TSV、Excel、PDF（ExcelはXLSX・XLS・XLSM）のいずれかを選択してください。");

  const decoded = decodeCsv(buffer);
  const delimiter = detectDelimiter(decoded.text);
  const matrix = parseDelimitedRows(decoded.text, delimiter);
  const { headers, rows } = rowsToObjects(matrix);
  assertUsableRows(headers, rows);
  return {
    importType: "csv",
    encoding: decoded.encoding,
    delimiter,
    headers,
    rows,
    sampleRows: rows.slice(0, 10)
  };
}

function normalizeColumnName(value: string) {
  return value.toLowerCase().replace(/[\s_・\-()（）]/gu, "");
}

export function suggestSalesField(columnName: string): { field: StandardSalesField; confidence: number } {
  const normalized = normalizeColumnName(columnName);
  const rules: Array<{ field: StandardSalesField; confidence: number; patterns: string[] }> = [
    { field: "sale_date", confidence: 0.96, patterns: ["会計日時", "会計日", "売上日", "売上日時", "取引日", "日時", "date", "datetime"] },
    { field: "transaction_id", confidence: 0.9, patterns: ["会計id", "会計番号", "取引id", "取引番号", "伝票番号", "transactionid", "orderid", "注文番号"] },
    { field: "item_name", confidence: 0.94, patterns: ["メニュー・店販・割引・サービス・オプション", "商品名", "品目", "メニュー名", "サービス名", "メニュー", "店販", "item", "product", "name"] },
    { field: "item_code", confidence: 0.86, patterns: ["商品コード", "品番", "sku", "code"] },
    { field: "category_name", confidence: 0.86, patterns: ["カテゴリ", "カテゴリー", "部門", "category"] },
    { field: "quantity", confidence: 0.94, patterns: ["数量", "個数", "qty", "quantity"] },
    { field: "unit_price", confidence: 0.9, patterns: ["単価", "価格", "unitprice", "price"] },
    { field: "subtotal", confidence: 0.86, patterns: ["小計", "税抜", "subtotal"] },
    { field: "tax_amount", confidence: 0.9, patterns: ["税額", "消費税", "tax"] },
    { field: "gross_amount", confidence: 0.94, patterns: ["税込金額", "合計", "総額", "total", "amount", "売上金額"] },
    { field: "discount_amount", confidence: 0.86, patterns: ["値引", "割引", "discount"] },
    { field: "payment_method", confidence: 0.92, patterns: ["支払方法", "決済方法", "payment", "paymethod"] },
    { field: "customer_name", confidence: 0.8, patterns: ["顧客名", "お客様", "customer"] },
    { field: "channel", confidence: 0.8, patterns: ["チャネル", "販売経路", "channel"] },
    { field: "memo", confidence: 0.75, patterns: ["メモ", "備考", "note", "memo"] }
  ];

  for (const rule of rules) {
    if (rule.patterns.some((pattern) => normalized.includes(normalizeColumnName(pattern)))) {
      return { field: rule.field, confidence: rule.confidence };
    }
  }
  return { field: "ignore", confidence: 0.2 };
}

export function buildSuggestedMappings(headers: string[]): Array<Omit<DataColumnMapping, "id">> {
  const used = new Set<StandardSalesField>();
  return headers.map((header, index) => {
    const suggestion = suggestSalesField(header);
    const target = suggestion.field !== "ignore" && used.has(suggestion.field) ? "ignore" : suggestion.field;
    if (target !== "ignore") used.add(target);
    return {
      source_column_name: header,
      source_column_index: index,
      target_field: target,
      confidence: target === "ignore" ? 0.2 : suggestion.confidence,
      created_by: "system"
    };
  });
}

function parseNumber(value: string | null | undefined, fallback = 0) {
  const normalized = String(value ?? "")
    .replace(/[¥￥,\s円]/gu, "")
    .replace(/[△▲]/gu, "-")
    .trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: string | null | undefined) {
  const iso = parseImportDateIso(value);
  return iso ? new Date(iso) : null;
}

function valueFor(row: ParsedSalesRow, mappings: DataColumnMapping[], field: StandardSalesField) {
  const mapping = mappings.find((item) => item.target_field === field);
  return mapping ? row[mapping.source_column_name] ?? null : null;
}

export function hashSalesRow(storeId: string, dataSourceId: string | null, row: ParsedSalesRow, externalId: string | null) {
  const source = externalId && externalId.length > 0 ? `${externalId}:${JSON.stringify(row)}` : JSON.stringify(row);
  return createHash("sha256").update(`${storeId}:${dataSourceId ?? "source"}:${source}`).digest("hex");
}

export function groupNormalizedSalesRows(rows: NormalizedSalesPreviewRow[]) {
  const groups = new Map<string, NormalizedSalesPreviewRow[]>();
  for (const row of rows) {
    const businessDate = row.sale_date?.slice(0, 10) ?? "unknown-date";
    const key = row.transaction_id ? `${businessDate}:${row.transaction_id}` : `row:${row.source_row_hash}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

export function normalizeSalesRows(
  rows: ParsedSalesRow[],
  mappings: DataColumnMapping[],
  storeId: string,
  dataSourceId: string | null
): NormalizedSalesPreviewRow[] {
  return rows.map((row, index) => {
    const saleDate = parseDate(valueFor(row, mappings, "sale_date"));
    const quantity = parseNumber(valueFor(row, mappings, "quantity"), 1) || 1;
    const gross = parseNumber(valueFor(row, mappings, "gross_amount"));
    const subtotal = parseNumber(valueFor(row, mappings, "subtotal"), gross);
    const tax = parseNumber(valueFor(row, mappings, "tax_amount"));
    const discount = parseNumber(valueFor(row, mappings, "discount_amount"));
    const unitPrice = parseNumber(valueFor(row, mappings, "unit_price"), quantity ? gross / quantity : gross);
    const itemName = valueFor(row, mappings, "item_name");
    const externalId = valueFor(row, mappings, "transaction_id");
    const errors: string[] = [];

    if (!saleDate) errors.push("売上日を判定できません。");
    if (!itemName) errors.push("商品名が空です。");
    if (!gross && !subtotal && !unitPrice) errors.push("金額を判定できません。");
    if (quantity <= 0) errors.push("数量が0以下です。");

    return {
      rowNumber: index + 2,
      sale_date: saleDate ? saleDate.toISOString() : null,
      transaction_id: externalId,
      item_name: itemName,
      item_code: valueFor(row, mappings, "item_code"),
      category_name: valueFor(row, mappings, "category_name"),
      quantity,
      unit_price: unitPrice,
      subtotal,
      tax_amount: tax,
      gross_amount: gross || subtotal + tax - discount,
      discount_amount: discount,
      payment_method: valueFor(row, mappings, "payment_method"),
      customer_name: valueFor(row, mappings, "customer_name"),
      channel: valueFor(row, mappings, "channel"),
      memo: valueFor(row, mappings, "memo"),
      source_row_hash: hashSalesRow(storeId, dataSourceId, row, externalId),
      errors
    };
  });
}
