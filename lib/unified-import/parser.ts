import * as XLSX from "xlsx";
import { parseImportFile } from "../phase4/import-parser.ts";
import type { ParsedUnifiedImport, ParsedUnifiedImportRow, UnifiedImportRecordType, UnifiedImportSheetSummary } from "@/types/unified-import";

export const MAX_UNIFIED_IMPORT_FILE_SIZE = 20 * 1024 * 1024;
export const MAX_UNIFIED_IMPORT_ROWS = 50_000;

type FieldRule = { key: string; patterns: string[] };
type ConcreteRecordType = Exclude<UnifiedImportRecordType, "unknown" | "ignore">;

const concreteRecordTypes: ConcreteRecordType[] = ["sale", "expense", "customer", "item", "inventory"];

const recordTypeLabels: Record<UnifiedImportRecordType, string> = {
  sale: "売上",
  expense: "経費・仕入",
  customer: "顧客",
  item: "商品・メニュー",
  inventory: "在庫",
  unknown: "分類不明",
  ignore: "取込対象外"
};

const fieldRules: Record<ConcreteRecordType, FieldRule[]> = {
  sale: [
    { key: "date", patterns: ["売上日", "会計日", "取引日", "販売日", "日時", "日付", "date"] },
    { key: "transaction_id", patterns: ["取引id", "伝票番号", "注文番号", "transactionid", "orderid"] },
    { key: "item_name", patterns: ["商品名", "メニュー名", "サービス名", "品目", "item", "product"] },
    { key: "item_code", patterns: ["商品コード", "品番", "sku", "itemcode"] },
    { key: "quantity", patterns: ["数量", "個数", "qty", "quantity"] },
    { key: "unit_price", patterns: ["単価", "販売価格", "unitprice"] },
    { key: "tax_amount", patterns: ["税額", "消費税", "tax"] },
    { key: "amount", patterns: ["売上金額", "売上", "合計", "税込金額", "金額", "total", "amount"] },
    { key: "payment_method", patterns: ["支払方法", "決済方法", "payment"] },
    { key: "customer_name", patterns: ["顧客名", "お客様", "customer"] },
    { key: "memo", patterns: ["備考", "メモ", "摘要", "note", "memo"] }
  ],
  expense: [
    { key: "date", patterns: ["経費日", "支払日", "仕入日", "利用日", "取引日", "日付", "date"] },
    { key: "vendor_name", patterns: ["支払先", "取引先", "仕入先", "購入先", "店名", "vendor", "supplier"] },
    { key: "category_name", patterns: ["勘定科目", "経費科目", "費目", "用途", "カテゴリ", "category"] },
    { key: "subtotal_amount", patterns: ["税抜金額", "小計", "subtotal"] },
    { key: "tax_amount", patterns: ["税額", "消費税", "tax"] },
    { key: "amount", patterns: ["経費金額", "支払額", "仕入金額", "合計", "金額", "total", "amount"] },
    { key: "payment_method", patterns: ["支払方法", "決済方法", "payment"] },
    { key: "invoice_registration_number", patterns: ["登録番号", "インボイス番号", "invoice"] },
    { key: "memo", patterns: ["摘要", "備考", "メモ", "note", "memo"] }
  ],
  customer: [
    { key: "name", patterns: ["顧客名", "氏名", "お客様名", "名前", "name"] },
    { key: "company_name", patterns: ["会社名", "法人名", "勤務先", "company"] },
    { key: "phone", patterns: ["電話番号", "携帯番号", "tel", "phone"] },
    { key: "email", patterns: ["メールアドレス", "メール", "mail", "email"] },
    { key: "birth_date", patterns: ["生年月日", "誕生日", "birthday", "birthdate"] },
    { key: "gender", patterns: ["性別", "gender"] },
    { key: "occupation", patterns: ["職業", "occupation"] },
    { key: "assigned_staff_name", patterns: ["担当者", "担当スタッフ", "staff"] },
    { key: "line_account", patterns: ["line", "ライン"] },
    { key: "instagram_account", patterns: ["instagram", "インスタ"] },
    { key: "facebook_account", patterns: ["facebook", "フェイスブック"] },
    { key: "last_visit_date", patterns: ["最終来店日", "最終利用日", "lastvisit"] },
    { key: "visit_count", patterns: ["来店回数", "利用回数", "visitcount"] },
    { key: "memo", patterns: ["会話メモ", "備考", "メモ", "note", "memo"] }
  ],
  item: [
    { key: "name", patterns: ["商品名", "メニュー名", "サービス名", "品名", "item", "product"] },
    { key: "sku", patterns: ["商品コード", "品番", "sku", "code"] },
    { key: "unit", patterns: ["単位", "unit"] },
    { key: "unit_price", patterns: ["販売価格", "価格", "単価", "price"] },
    { key: "cost_price", patterns: ["原価", "仕入単価", "cost"] },
    { key: "tax_rate", patterns: ["税率", "taxrate"] },
    { key: "is_stock_managed", patterns: ["在庫管理", "在庫対象", "stockmanaged"] },
    { key: "description", patterns: ["説明", "詳細", "description"] }
  ],
  inventory: [
    { key: "item_name", patterns: ["商品名", "品名", "メニュー名", "item", "product"] },
    { key: "item_code", patterns: ["商品コード", "品番", "sku", "code"] },
    { key: "quantity", patterns: ["在庫数", "棚卸数", "入庫数", "出庫数", "数量", "stock", "quantity"] },
    { key: "movement_type", patterns: ["在庫区分", "変動区分", "入出庫区分", "movement"] },
    { key: "reorder_point", patterns: ["発注点", "最低在庫", "reorder"] },
    { key: "reason", patterns: ["理由", "摘要", "備考", "reason", "memo"] }
  ]
};

const requiredFields: Record<ConcreteRecordType, string[]> = {
  sale: ["date", "item_name", "amount"],
  expense: ["date", "vendor_name", "amount"],
  customer: ["name", "phone"],
  item: ["name"],
  inventory: ["item_name", "quantity"]
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[\s_・\-()（）/]/gu, "");
}

function matches(header: string, patterns: string[]) {
  const value = normalized(header);
  return patterns.some((pattern) => value.includes(normalized(pattern)));
}

function mappingFor(headers: string[], kind: ConcreteRecordType) {
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const rule of fieldRules[kind]) {
    const candidates = headers
      .filter((candidate) => !usedHeaders.has(candidate))
      .map((candidate) => {
        const candidateValue = normalized(candidate);
        const scores = rule.patterns.map((pattern) => {
          const patternValue = normalized(pattern);
          if (candidateValue === patternValue) return 10_000 + patternValue.length;
          if (candidateValue.includes(patternValue)) return 1_000 + patternValue.length;
          return 0;
        });
        return { candidate, score: Math.max(...scores) };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);
    const header = candidates[0]?.candidate;
    if (header) {
      mapping[rule.key] = header;
      usedHeaders.add(header);
    }
  }
  return mapping;
}

function kindScore(headers: string[], kind: ConcreteRecordType) {
  const mapping = mappingFor(headers, kind);
  let score = Object.keys(mapping).length;
  for (const required of requiredFields[kind]) if (mapping[required]) score += 2;
  if (kind === "expense" && headers.some((header) => /経費|仕入|支払先|勘定科目/u.test(header))) score += 4;
  if (kind === "customer" && headers.some((header) => /電話|メール|誕生日|来店/u.test(header))) score += 4;
  if (kind === "inventory" && headers.some((header) => /在庫|棚卸|入庫|出庫/u.test(header))) score += 4;
  if (kind === "item" && headers.some((header) => /原価|販売価格|税率/u.test(header))) score += 3;
  if (kind === "sale" && headers.some((header) => /売上|会計|決済/u.test(header))) score += 4;
  return { score, mapping };
}

export function classifyHeaders(headers: string[]) {
  const entries = concreteRecordTypes
    .map((kind) => ({ kind, ...kindScore(headers, kind) }))
    .sort((left, right) => right.score - left.score);
  const best = entries[0];
  const second = entries[1];
  if (!best || best.score < 5) return { kind: "unknown" as const, confidence: 0.2, mapping: {} as Record<string, string> };
  const margin = best.score - (second?.score ?? 0);
  const confidence = Math.min(0.98, 0.55 + best.score * 0.025 + margin * 0.04);
  return { kind: best.kind, confidence, mapping: best.mapping };
}

function explicitRecordType(rawData: Record<string, string>) {
  const entry = Object.entries(rawData).find(([header]) => matches(header, ["区分", "種別", "データ種別", "取引区分", "収支", "type"]));
  if (!entry) return null;
  const value = normalized(entry[1]);
  if (/売上|収入|入金|sales?|income/u.test(value)) return "sale" as const;
  if (/経費|仕入|支出|出金|expense|purchase/u.test(value)) return "expense" as const;
  if (/顧客|customer|client/u.test(value)) return "customer" as const;
  if (/在庫|棚卸|入庫|出庫|inventory|stock/u.test(value)) return "inventory" as const;
  if (/商品|メニュー|サービス|item|product/u.test(value)) return "item" as const;
  return null;
}

export function normalizeUnifiedRow(rawData: Record<string, string>, kind: UnifiedImportRecordType) {
  if (kind === "unknown" || kind === "ignore") return { normalizedData: {}, missingFields: [] as string[] };
  const mapping = mappingFor(Object.keys(rawData), kind);
  const normalizedData = Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, clean(rawData[source])]));
  const missingFields = requiredFields[kind].filter((field) => !clean(normalizedData[field]));
  return { normalizedData, missingFields };
}

function classifyRow(rawData: Record<string, string>, sheetKind: UnifiedImportRecordType, sheetConfidence: number): Omit<ParsedUnifiedImportRow, "sheetName" | "rowNumber"> {
  const explicit = explicitRecordType(rawData);
  const suggestedRecordType = explicit ?? sheetKind;
  const confidence = explicit ? 0.99 : sheetConfidence;
  const { normalizedData, missingFields } = normalizeUnifiedRow(rawData, suggestedRecordType);
  const question = suggestedRecordType === "unknown"
    ? "この行が売上・経費・顧客・商品・在庫のどれかを選んでください。"
    : missingFields.length > 0
      ? `${recordTypeLabels[suggestedRecordType]}として取り込むため、${missingFields.join("・")}を確認してください。`
      : confidence < 0.7
        ? `この行を${recordTypeLabels[suggestedRecordType]}として取り込んでよいか確認してください。`
        : null;
  return { rawData, suggestedRecordType, confidence, normalizedData, missingFields, question };
}

function headerRowIndex(matrix: string[][]) {
  const candidates = matrix.slice(0, 20).map((row, index) => {
    const values = row.filter(Boolean);
    const known = values.filter((value) => concreteRecordTypes
      .some((kind) => fieldRules[kind].some((rule) => matches(value, rule.patterns)))).length;
    return { index, score: known * 10 + new Set(values).size };
  });
  return candidates.sort((left, right) => right.score - left.score)[0]?.index ?? 0;
}

function parseMatrix(sheetName: string, matrixInput: unknown[][], macroEnabled: boolean) {
  const matrix = matrixInput.map((row) => row.map(clean)).filter((row) => row.some(Boolean));
  if (matrix.length < 2) return { summary: null, rows: [] as ParsedUnifiedImportRow[] };
  const headerIndex = headerRowIndex(matrix);
  const headers = matrix[headerIndex].map((header, index) => header || `column_${index + 1}`);
  const rawRows = matrix.slice(headerIndex + 1).filter((row) => row.some(Boolean));
  const classified = classifyHeaders(headers);
  const rows = rawRows.map((values, index) => {
    const rawData = Object.fromEntries(headers.map((header, column) => [header, clean(values[column])]));
    return { sheetName, rowNumber: headerIndex + index + 2, ...classifyRow(rawData, classified.kind, classified.confidence) };
  });
  const summary: UnifiedImportSheetSummary = {
    name: sheetName,
    headerRowNumber: headerIndex + 1,
    headers,
    rowCount: rows.length,
    suggestedRecordType: classified.kind,
    confidence: classified.confidence,
    macroNotice: macroEnabled ? "マクロは実行せず、保存済みのセル値だけを読み取りました。" : null
  };
  return { summary, rows };
}

export async function parseUnifiedImportFile(fileName: string, buffer: ArrayBuffer): Promise<ParsedUnifiedImport> {
  if (buffer.byteLength === 0) throw new Error("空ファイルは取り込めません。");
  if (buffer.byteLength > MAX_UNIFIED_IMPORT_FILE_SIZE) throw new Error("ファイルは20MB以下にしてください。");
  const lower = fileName.toLowerCase();
  const macroEnabled = lower.endsWith(".xlsm");
  const supported = [".csv", ".tsv", ".xlsx", ".xls", ".xlsm", ".pdf"].some((extension) => lower.endsWith(extension));
  if (!supported) throw new Error("CSV、TSV、XLSX、XLS、XLSM、PDFのいずれかを選択してください。");

  if (lower.endsWith(".pdf")) {
    const parsed = await parseImportFile(fileName, buffer);
    if (parsed.rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
    const classified = classifyHeaders(parsed.headers);
    const rows = parsed.rows.map((rawData, index) => ({ sheetName: "PDF", rowNumber: index + 2, ...classifyRow(rawData, classified.kind, classified.confidence) }));
    return { fileType: "pdf", macroEnabled: false, sheets: [{ name: "PDF", headerRowNumber: 1, headers: parsed.headers, rowCount: rows.length, suggestedRecordType: classified.kind, confidence: classified.confidence }], rows };
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const parsed = await parseImportFile(fileName, buffer);
    if (parsed.rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
    const classified = classifyHeaders(parsed.headers);
    const rows = parsed.rows.map((rawData, index) => ({ sheetName: "データ", rowNumber: index + 2, ...classifyRow(rawData, classified.kind, classified.confidence) }));
    return { fileType: "csv", macroEnabled: false, sheets: [{ name: "データ", headerRowNumber: 1, headers: parsed.headers, rowCount: rows.length, suggestedRecordType: classified.kind, confidence: classified.confidence }], rows };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellFormula: false, bookVBA: false });
  } catch (error) {
    throw new Error(`Excelファイルを読み取れませんでした。パスワード保護や破損がないか確認してください: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const sheets: UnifiedImportSheetSummary[] = [];
  const rows: ParsedUnifiedImportRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "", blankrows: false });
    const parsed = parseMatrix(sheetName, matrix, macroEnabled);
    if (parsed.summary) sheets.push(parsed.summary);
    rows.push(...parsed.rows);
    if (rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
  }
  if (rows.length === 0) throw new Error("取り込める表形式のデータがありません。見出し行とデータ行を確認してください。");
  return { fileType: "excel", macroEnabled, sheets, rows };
}
