import * as XLSX from "xlsx/xlsx.mjs";
import { parseImportFile } from "../phase4/import-parser.ts";
import { validateUnifiedImportValues } from "./value-validation.ts";
import { extractWorkbookLayouts } from "./workbook-layout.ts";
import { createImportClarificationIssue, resolveImportClarification } from "./clarification.ts";
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
    { key: "time", patterns: ["会計時間", "売上時間", "取引時間", "時刻", "time"] },
    { key: "transaction_id", patterns: ["会計id", "会計番号", "取引id", "伝票番号", "注文番号", "transactionid", "orderid"] },
    { key: "item_name", patterns: ["メニュー・店販・割引・サービス・オプション", "商品名", "メニュー名", "サービス名", "品目", "メニュー", "店販", "item", "product"] },
    { key: "item_code", patterns: ["商品コード", "品番", "sku", "itemcode"] },
    { key: "category_name", patterns: ["カテゴリ", "カテゴリー", "ジャンル", "部門", "category"] },
    { key: "quantity", patterns: ["数量", "個数", "qty", "quantity"] },
    { key: "unit_price", patterns: ["単価", "販売価格", "unitprice"] },
    { key: "tax_amount", patterns: ["税額", "消費税", "tax"] },
    { key: "amount", patterns: ["売上金額", "売上", "合計", "税込金額", "金額", "total", "amount"] },
    { key: "payment_method", patterns: ["支払方法", "決済方法", "payment"] },
    { key: "customer_name", patterns: ["顧客名", "お客様", "customer"] },
    { key: "staff_name", patterns: ["担当スタッフ", "スタッフ", "施術者", "staff"] },
    { key: "reservation_channel", patterns: ["予約経路", "来店経路", "予約媒体", "channel"] },
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

export function unifiedImportFields(kind: UnifiedImportRecordType) {
  if (kind === "unknown" || kind === "ignore") return [];
  return fieldRules[kind].map((field) => ({ ...field, required: requiredFields[kind].includes(field.key) }));
}

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
  // Every copy of a repeated label is ambiguous, including the first one. Keep
  // the cell values distinct, but leave selection to one column-level question.
  const baseHeader = (header: string) => normalized(header.replace(/ \[[A-Z]+列\]$/u, ""));
  const counts = new Map<string, number>();
  for (const header of headers) counts.set(baseHeader(header), (counts.get(baseHeader(header)) ?? 0) + 1);
  for (const rule of fieldRules[kind]) {
    const candidates = headers
      .filter((candidate) => !usedHeaders.has(candidate) && counts.get(baseHeader(candidate)) === 1)
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

export function suggestUnifiedImportMapping(headers: string[], kind: UnifiedImportRecordType) {
  return kind === "unknown" || kind === "ignore" ? {} : mappingFor(headers, kind);
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

export function normalizeUnifiedRow(rawData: Record<string, string>, kind: UnifiedImportRecordType, mappingOverride?: Record<string, string>) {
  if (kind === "unknown" || kind === "ignore") return { normalizedData: {}, missingFields: [] as string[] };
  const mapping = mappingOverride ?? mappingFor(Object.keys(rawData), kind);
  const normalizedData = Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, clean(rawData[source])]));
  const missingFields = requiredFields[kind].filter((field) => !clean(normalizedData[field]));
  return { normalizedData, missingFields };
}

export function classifyUnifiedImportRow(rawData: Record<string, string>, sheetKind: UnifiedImportRecordType, sheetConfidence: number, sheetMapping?: Record<string, string>): Omit<ParsedUnifiedImportRow, "sheetName" | "rowNumber"> {
  const explicit = sheetKind === "ignore" ? null : explicitRecordType(rawData);
  const suggestedRecordType = explicit ?? sheetKind;
  const confidence = explicit ? 0.99 : sheetConfidence;
  const mapping = explicit && explicit !== sheetKind ? suggestUnifiedImportMapping(Object.keys(rawData), explicit) : sheetMapping ?? suggestUnifiedImportMapping(Object.keys(rawData), suggestedRecordType);
  const { normalizedData, missingFields } = normalizeUnifiedRow(rawData, suggestedRecordType, mapping);
  const missingColumns = new Set(suggestedRecordType === "unknown" || suggestedRecordType === "ignore"
    ? []
    : requiredFields[suggestedRecordType].filter((field) => !mapping?.[field]));
  const missingRowValues = missingFields.filter((field) => !missingColumns.has(field));
  const invalidValues = suggestedRecordType === "unknown" || suggestedRecordType === "ignore" ? []
    : validateUnifiedImportValues(suggestedRecordType, normalizedData)
      .filter(({ field }) => !missingColumns.has(field) && !missingRowValues.includes(field));
  const question = invalidValues.length > 0
      ? invalidValues.map(({ message }) => message).join(" ")
      : suggestedRecordType !== "unknown" && missingRowValues.length > 0
      ? `${recordTypeLabels[suggestedRecordType]}として取り込むため、${missingRowValues.join("・")}を確認してください。`
      : suggestedRecordType !== "unknown" && suggestedRecordType !== "ignore" && confidence < 0.7 && missingColumns.size === 0
        ? `この行を${recordTypeLabels[suggestedRecordType]}として取り込んでよいか確認してください。`
        : null;
  return { rawData, suggestedRecordType, confidence, normalizedData, missingFields: [...new Set([...missingFields, ...invalidValues.map(({ field }) => field)])], question };
}

type MatrixRow = { values: string[]; rowNumber: number; sourceIssues?: { column: number; code: "source_missing" | "source_error" }[] };
type FlatBlock = { header: MatrixRow; data: MatrixRow[]; repeated: number; columnOffset: number; blockingIssues?: string[] };
const MAX_WORKSHEET_CELLS = 2_000_000;

function looksLikeHeader(values: string[]) {
  const cells = values.filter(Boolean);
  const known = cells.filter((value) => concreteRecordTypes.some((kind) => fieldRules[kind]
    .some((rule) => rule.patterns.some((pattern) => normalized(value) === normalized(pattern))))).length;
  // Data values such as 商品A or a numeric amount must not look like headers
  // simply because a substring resembles a field name.
  return known >= 2 && known / cells.length >= 0.5;
}

function uniqueHeaders(values: string[], width: number, columnOffset = 0) {
  const originals = Array.from({ length: width }, (_, index) => values[index] || `column_${index + 1}`);
  const counts = new Map<string, number>();
  for (const header of originals) counts.set(normalized(header), (counts.get(normalized(header)) ?? 0) + 1);
  const ambiguousColumns = [...new Set(originals.filter((header) => (counts.get(normalized(header)) ?? 0) > 1))];
  const headers = originals.map((header, index) => (counts.get(normalized(header)) ?? 0) > 1
    ? `${header} [${XLSX.utils.encode_col(index + columnOffset)}列]` : header);
  // A source label may literally contain our suffix. Never let that overwrite
  // another source cell either.
  const used = new Set<string>();
  return { ambiguousColumns, headers: headers.map((header, index) => {
    let candidate = header;
    while (used.has(candidate)) candidate = `${candidate} [${XLSX.utils.encode_col(index + columnOffset)}列]`;
    used.add(candidate);
    return candidate;
  }) };
}

function isTotalRow(values: string[]) {
  const label = normalized(values.find(Boolean) ?? "");
  return /^(?:(?:売上|経費|支出|仕入)?(?:小計|合計|総計)|総合計|日計|月計|月合計|月間合計|年計|年間合計|累計|subtotal|grandtotal|total)(?:税込|税抜|税別|円)?$/u.test(label);
}

function splitHorizontalTables(block: FlatBlock): FlatBlock[] {
  const width = block.data.reduce((maximum, row) => Math.max(maximum, row.values.length), block.header.values.length);
  const spans: Array<{ start: number; end: number }> = [];
  let start: number | null = null;
  for (let column = 0; column <= width; column += 1) {
    const used = column < width && (block.header.values[column] || block.data.some((row) => row.values[column]));
    if (used && start === null) start = column;
    if (!used && start !== null) { spans.push({ start, end: column }); start = null; }
  }
  if (spans.length < 2) return [block];
  if (!spans.every(({ start, end }) => looksLikeHeader(block.header.values.slice(start, end)))) {
    return [{ ...block, blockingIssues: ["空列で分かれた複数の領域がありますが、すべての見出しを確定できません。別の表を取り落とさないため自動取り込みを停止しました。各表を別シートに分けて再解析してください。"] }];
  }
  return spans.map(({ start, end }) => ({
    header: { ...block.header, values: block.header.values.slice(start, end) },
    data: block.data.map((row) => ({ ...row, values: row.values.slice(start, end) })).filter((row) => row.values.some(Boolean)),
    repeated: block.repeated, columnOffset: block.columnOffset + start
  }));
}

function parseMatrix(sheetName: string, matrix: MatrixRow[], macroEnabled: boolean) {
  const sheets: UnifiedImportSheetSummary[] = [];
  const rows: ParsedUnifiedImportRow[] = [];
  const firstNonempty = matrix.findIndex((row) => row.values.some(Boolean));
  if (firstNonempty < 0) return { sheets, rows };
  const firstHeader = matrix.findIndex((row) => looksLikeHeader(row.values));
  const firstPossibleTable = matrix.findIndex((row) => row.values.filter(Boolean).length >= 2);
  // An unrecognised earlier table is still evidence. A better known header
  // later in the sheet must not make us silently discard that first table.
  const start = firstPossibleTable >= 0 && (firstHeader < 0 || firstPossibleTable < firstHeader)
    ? firstPossibleTable : firstHeader < 0 ? firstNonempty : firstHeader;
  const verticalBlocks: FlatBlock[] = [];
  let current: FlatBlock = { header: matrix[start], data: [], repeated: 0, columnOffset: 0 };
  for (const row of matrix.slice(start + 1)) {
    if (!row.values.some(Boolean)) continue;
    const sameHeader = row.values.map(normalized).join("|") === current.header.values.map(normalized).join("|");
    if (sameHeader) { current.repeated += 1; continue; }
    if (looksLikeHeader(row.values)) {
      verticalBlocks.push(current);
      current = { header: row, data: [], repeated: 0, columnOffset: 0 };
    } else {
      current.data.push(row);
    }
  }
  verticalBlocks.push(current);
  const blocks = verticalBlocks.flatMap(splitHorizontalTables);
  for (const [index, block] of blocks.entries()) {
    if (block.data.length === 0) continue;
    const width = block.data.reduce((maximum, row) => Math.max(maximum, row.values.length), block.header.values.length);
    const { headers, ambiguousColumns } = uniqueHeaders(block.header.values, width, block.columnOffset);
    const classified = classifyHeaders(headers);
    const missingRequiredFields = classified.kind === "unknown" ? [] : requiredFields[classified.kind].filter((field) => !classified.mapping[field]);
    const name = blocks.length > 1 ? `${sheetName}（表${index + 1}・${block.header.rowNumber}行目）` : sheetName;
    const totals = block.data.filter((row) => isTotalRow(row.values));
    const dataRows = block.data.filter((row) => !isTotalRow(row.values));
    const notices: string[] = [];
    if (blocks.length > 1) notices.push("同じシートの複数の表を、見出しごとに分けて読み取りました。");
    if (block.repeated) notices.push(`繰り返しの見出し${block.repeated}行を除外しました。`);
    if (totals.length) notices.push(`二重計上を避けるため、合計・小計${totals.length}行を除外しました（元行: ${totals.map((row) => row.rowNumber).join("、")}）。`);
    if (ambiguousColumns.length) notices.push(`同じ見出し「${ambiguousColumns.join("・")}」が複数あります。列を自動選択せず、元の列位置を区別しました。`);
    if (classified.kind === "unknown") notices.push("この表の用途を確定できません。分類と列の対応を確認するまで取り込みません。");
    if (index === 0 && start > firstNonempty) notices.push(`${matrix[firstNonempty].rowNumber}〜${block.header.rowNumber - 1}行目は表の見出しより前のタイトル・注記として除外しました。`);
    const sheetRows = dataRows.map(({ values, rowNumber }) => {
      const rawData = Object.fromEntries(headers.map((header, column) => [header, clean(values[column])]));
      return { sheetName: name, rowNumber, ...classifyUnifiedImportRow(rawData, classified.kind, classified.confidence, classified.mapping) };
    });
    const summary: UnifiedImportSheetSummary = {
      name, sourceSheetName: sheetName, sourceRange: `${XLSX.utils.encode_col(block.columnOffset)}${block.header.rowNumber}:${XLSX.utils.encode_col(block.columnOffset + width - 1)}${block.data.at(-1)!.rowNumber}`,
      headerRowNumber: block.header.rowNumber, headers, rowCount: sheetRows.length,
      suggestedRecordType: classified.kind, confidence: classified.confidence, suggestedMapping: classified.mapping, missingRequiredFields,
      layout: "flat", notices, ambiguousColumns, requiresConfirmation: ambiguousColumns.length > 0,
      blockingIssues: block.blockingIssues,
      macroNotice: macroEnabled ? "マクロは実行せず、保存済みのセル値だけを読み取りました。" : null
    };
    summary.clarification = { version: 1, issues: [] };
    for (const message of block.blockingIssues ?? []) summary.clarification.issues.push(createImportClarificationIssue({ tableName: name, code: "unclaimed_structure", message, source: { sheetName, range: summary.sourceRange! } }));
    for (const sourceRow of block.data) for (const issue of sourceRow.sourceIssues ?? []) {
      if (issue.column < block.columnOffset || issue.column >= block.columnOffset + width) continue;
      const coordinate = `${XLSX.utils.encode_col(issue.column)}${sourceRow.rowNumber}`;
      summary.clarification.issues.push(createImportClarificationIssue({ tableName: name, code: issue.code, message: issue.code === "source_missing" ? `${coordinate}: 数式の保存済み結果がありません。元ファイルを再計算・保存してください。` : `${coordinate}: 元ファイルにExcelエラー値があります。`, source: { sheetName, range: summary.sourceRange!, cells: [coordinate] }, rowNumbers: [sourceRow.rowNumber] }));
    }
    if (summary.requiresConfirmation) summary.clarification.issues.push(createImportClarificationIssue({ tableName: name, code: "layout_confirmation", message: "同名の見出しを元の列位置で区別しました。列の対応を確認してください。", source: { sheetName, range: summary.sourceRange! } }));
    sheets.push(summary);
    rows.push(...sheetRows);
  }
  return { sheets, rows };
}

function worksheetMatrix(worksheet: XLSX.WorkSheet, date1904: boolean): MatrixRow[] {
  if (!worksheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(worksheet["!ref"]!);
  if (range.e.r - range.s.r > 100_000 || (range.e.r - range.s.r + 1) * (range.e.c + 1) > MAX_WORKSHEET_CELLS) {
    throw new Error("表の範囲が大きすぎます。不要な行・列の書式を削除するか、ファイルを分割してください。");
  }
  const matrix: MatrixRow[] = [];
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const values: string[] = [];
    const sourceIssues: NonNullable<MatrixRow["sourceIssues"]> = [];
    for (let column = 0; column <= range.e.c; column += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined;
      if (cell?.t === "e") sourceIssues.push({ column, code: "source_error" });
      else if (cell?.f && (cell.t === "z" || cell.v === undefined || cell.v === null || cell.v === "")) sourceIssues.push({ column, code: "source_missing" });
      let value = cell?.t === "e" ? cell.w || "#CELL_ERROR!"
        : cell?.f && (cell.t === "z" || cell.v === undefined || cell.v === null || cell.v === "") ? "#数式の保存済み結果なし"
        : cell?.t === "z" ? ""
        : clean(cell?.v);
      if (cell?.t === "d" && cell.v instanceof Date) value = cell.v.toISOString().replace(/T00:00:00\.000Z$/u, "");
      if (cell?.t === "n" && typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(String(cell.z))) {
        const parsed = XLSX.SSF.parse_date_code(cell.v, { date1904 });
        if (parsed) {
          const pad = (part: number) => String(part).padStart(2, "0");
          const time = `${pad(parsed.H)}:${pad(parsed.M)}:${pad(parsed.S)}`;
          const format = String(cell.z).replace(/"[^"]*"|\\./gu, "");
          value = /[hs]/iu.test(format) && !/[dy]/iu.test(format)
            ? time
            : `${String(parsed.y).padStart(4, "0")}-${pad(parsed.m)}-${pad(parsed.d)}${parsed.H || parsed.M || parsed.S ? `T${time}` : ""}`;
        }
      } else if (cell?.t === "n" && typeof cell.v === "number" && /^0+(?:[- ]0+)*$/u.test(String(cell.z ?? "")) && String(cell.z).replace(/[^0]/gu, "").length > 1) {
        // Explicit zero-padding often carries identifier/telephone semantics.
        // Preserve it without accepting accounting display text as a number.
        value = XLSX.SSF.format(String(cell.z), cell.v);
      }
      // Read v, not the locale-formatted w: accounting displays may hide the
      // minus sign in parentheses or decorate the number with currency text.
      values.push(value);
    }
    matrix.push({ rowNumber: row + 1, values, sourceIssues });
  }
  return matrix;
}

function delimitedMatrix(buffer: ArrayBuffer, delimiter: string): MatrixRow[] {
  const bytes = new Uint8Array(buffer);
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("shift_jis").decode(bytes);
  text = text.replace(/^\uFEFF/u, "");
  if (!delimiter) {
    const sample = text.slice(0, 16_384).split(/\r?\n/u).slice(0, 10).join("\n");
    delimiter = (sample.match(/\t/gu) ?? []).length > (sample.match(/,/gu) ?? []).length ? "\t" : ",";
  }
  const rows: MatrixRow[] = [];
  let values: string[] = [], cell = "", quoted = false, line = 1, startLine = 1;
  let cells = 0;
  const pushRow = () => {
    values.push(clean(cell));
    cells += values.length;
    if (cells > MAX_WORKSHEET_CELLS || rows.length >= 100_000) throw new Error("表の範囲が大きすぎます。ファイルを分割して再解析してください。");
    rows.push({ values, rowNumber: startLine });
    values = []; cell = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (quoted || !cell) quoted = !quoted;
      else cell += char;
    } else if (!quoted && char === delimiter) { values.push(clean(cell)); cell = ""; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      if (quoted) cell += "\n";
      else pushRow();
      line += 1;
      if (!quoted) startLine = line;
    } else cell += char;
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません。ファイルの書き出し形式を確認してください。");
  if (cell || values.length) pushRow();
  return rows;
}

function withClarification(parsed: ParsedUnifiedImport): ParsedUnifiedImport {
  const evaluated = resolveImportClarification({ sheets: parsed.sheets, rows: parsed.rows });
  return { ...parsed, sheets: evaluated.sheets, rows: evaluated.rows };
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
    const missingRequiredFields = classified.kind === "unknown" ? [] : requiredFields[classified.kind].filter((field) => !classified.mapping[field]);
    const rows = parsed.rows.map((rawData, index) => ({ sheetName: "PDF", rowNumber: index + 2, ...classifyUnifiedImportRow(rawData, classified.kind, classified.confidence, classified.mapping) }));
    return withClarification({ fileType: "pdf", macroEnabled: false, sheets: [{ name: "PDF", headerRowNumber: 1, headers: parsed.headers, rowCount: rows.length, suggestedRecordType: classified.kind, confidence: classified.confidence, suggestedMapping: classified.mapping, missingRequiredFields, clarification: { version: 1, issues: [] } }], rows });
  }

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const parsed = parseMatrix("データ", delimitedMatrix(buffer, lower.endsWith(".tsv") ? "\t" : ""), false);
    if (parsed.rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
    if (!parsed.rows.length) throw new Error("取り込める表形式のデータがありません。見出し行とデータ行を確認してください。");
    return withClarification({ fileType: "csv", macroEnabled: false, ...parsed });
  }

  let workbook: XLSX.WorkBook;
  try {
    // Formula expressions are inspected solely for provenance/deduplication;
    // no formulas, external links, or VBA are executed or recalculated.
    workbook = XLSX.read(buffer, { type: "array", cellDates: false, cellNF: true, cellFormula: true, sheetStubs: true, bookVBA: false });
  } catch (error) {
    throw new Error(`Excelファイルを読み取れませんでした。パスワード保護や破損がないか確認してください: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const sheets: UnifiedImportSheetSummary[] = [];
  const rows: ParsedUnifiedImportRow[] = [];
  const notices: string[] = [];
  const hiddenSheets = new Set((workbook.Workbook?.Sheets ?? []).filter((sheet) => sheet.Hidden).map((sheet) => sheet.name));
  for (const sheetName of hiddenSheets) notices.push(`非表示シート「${sheetName}」は取り込み対象から除外しました。必要な場合はExcelで表示してから再解析してください。`);
  // The report adapter runs before generic header inference. It explicitly
  // claims handled sheets so a pivot/matrix report cannot become fake rows.
  const layouts = extractWorkbookLayouts(workbook);
  notices.push(...layouts.notices);
  for (const table of layouts.tables) {
    if (hiddenSheets.has(table.sourceSheetName)) continue;
    const tableRows = table.rows.map((row) => ({
      sheetName: table.name, rowNumber: row.rowNumber,
      ...classifyUnifiedImportRow(row.rawData, table.kind, table.kind === "ignore" ? 1 : 0.9, table.mapping)
    }));
    sheets.push({
      name: table.name, sourceSheetName: table.sourceSheetName, sourceRange: table.sourceRange,
      headerRowNumber: table.headerRowNumber, headers: table.headers, rowCount: tableRows.length,
      suggestedRecordType: table.kind, confidence: table.kind === "ignore" ? 1 : 0.9, suggestedMapping: table.mapping,
      missingRequiredFields: table.kind === "ignore" ? [] : requiredFields[table.kind].filter((field) => !table.mapping[field]),
      layout: "matrix", notices: table.notices, requiresConfirmation: table.requiresConfirmation,
      blockingIssues: table.blockingIssues, excludedReason: table.excludedReason,
      clarification: table.clarification,
      macroNotice: macroEnabled ? "マクロは実行せず、保存済みのセル値だけを読み取りました。" : null
    });
    rows.push(...tableRows);
  }
  for (const sheetName of workbook.SheetNames) {
    if (hiddenSheets.has(sheetName) || layouts.handledSheetNames.includes(sheetName)) continue;
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const matrix = worksheetMatrix(worksheet, Boolean(workbook.Workbook?.WBProps?.date1904));
    const parsed = parseMatrix(sheetName, matrix, macroEnabled);
    sheets.push(...parsed.sheets);
    rows.push(...parsed.rows);
    if (rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
  }
  if (rows.length > MAX_UNIFIED_IMPORT_ROWS) throw new Error(`一度に解析できるのは${MAX_UNIFIED_IMPORT_ROWS.toLocaleString("ja-JP")}行までです。ファイルを分割してください。`);
  if (rows.length === 0) throw new Error(`取り込める表形式のデータがありません。見出し行とデータ行を確認してください。${notices.join(" ")}`);
  return withClarification({ fileType: "excel", macroEnabled, sheets, rows, notices });
}
