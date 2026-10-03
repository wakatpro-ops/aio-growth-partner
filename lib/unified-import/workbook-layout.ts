import * as XLSX from "xlsx/xlsx.mjs";
import { parseImportNumber } from "./value-validation.ts";
import { createImportClarificationIssue } from "./clarification.ts";
import type { ImportClarificationMetadata, ImportClarificationIssue, ImportIssueCode } from "./clarification.ts";

/** A logical table is deliberately separate from a worksheet: report sheets may
 * contain several independent tables and repeated summaries of the same sales. */
export type WorkbookLayoutRow = {
  rowNumber: number;
  rawData: Record<string, string>;
  sourceRowNumber: number;
  sourceColumn: string;
  sourceRange: string;
};

export type WorkbookLayoutTable = {
  name: string;
  sourceSheetName: string;
  sourceRange: string;
  headerRowNumber: number;
  kind: "sale" | "expense" | "ignore";
  headers: string[];
  mapping: Record<string, string>;
  rows: WorkbookLayoutRow[];
  notices: string[];
  requiresConfirmation: boolean;
  blockingIssues: string[];
  excludedReason?: string;
  clarification: ImportClarificationMetadata;
};

type Matrix = {
  header: number;
  dayColumn: number;
  totalColumn: number;
  columns: { column: number; label: string }[];
  days: { day: number; row: number }[];
  subtotalRow: number | null;
  end: number;
  overall: boolean;
};

const provenanceHeaders = ["元シート", "元行", "元列", "元セル"];
const saleHeaders = ["売上日", "サービス名", "数量", "売上金額", "データ粒度", ...provenanceHeaders];
const expenseHeaders = ["経費日", "用途", "経費金額", ...provenanceHeaders];
const totalLabel = /^(?:総合計|合計|総計|小計|月計|月合計|月間合計|total)$/iu;
const key = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/\s/gu, "").trim();
const text = (value: unknown) => String(value ?? "").trim();
const address = (row: number, column: number) => XLSX.utils.encode_cell({ r: row, c: column });
const cell = (sheet: XLSX.WorkSheet, row: number, column: number): XLSX.CellObject | undefined => sheet[address(row, column)];
const value = (sheet: XLSX.WorkSheet, row: number, column: number) => cell(sheet, row, column)?.v;
const range = (r: number, c: number, er: number, ec: number) => XLSX.utils.encode_range({ s: { r, c }, e: { r: er, c: ec } });

function addIssue(table: WorkbookLayoutTable, message: string, evidence: { code: ImportIssueCode; cells?: string[]; sourceRange?: string; field?: string; rowNumbers?: number[]; details?: ImportClarificationIssue["details"] }) {
  // A malformed whole report should not produce thousands of identical prompts.
  if (!table.blockingIssues.includes(message) && table.blockingIssues.length < 30) table.blockingIssues.push(message);
  const issue = createImportClarificationIssue({ tableName: table.name, code: evidence.code, message, source: { sheetName: table.sourceSheetName, range: evidence.sourceRange ?? table.sourceRange, cells: evidence.cells }, field: evidence.field, rowNumbers: evidence.rowNumbers, details: evidence.details });
  const index = table.clarification.issues.findIndex((candidate) => candidate.id === issue.id);
  if (index >= 0) table.clarification.issues[index] = issue;
  else if (table.clarification.issues.length < 200) table.clarification.issues.push(issue);
}

function numeric(sheet: XLSX.WorkSheet, row: number, column: number, table: WorkbookLayoutTable) {
  const entry = cell(sheet, row, column);
  const source = address(row, column);
  if (entry?.t === "e") {
    addIssue(table, `${source}: Excelのエラー値があるため、元ファイルで修正してください。`, { code: "source_error", cells: [source] });
    return null;
  }
  if (entry?.f && (entry.t === "z" || entry.v === undefined || entry.v === null || entry.v === "")) {
    addIssue(table, `${source}: 数式の保存済み計算結果がありません。Excelで再計算して保存してください。`, { code: "source_missing", cells: [source] });
    return null;
  }
  if (entry?.v === undefined || entry.v === null || entry.v === "") return null;
  const number = parseImportNumber(entry.v);
  if (number === null) {
    addIssue(table, `${source}: 数値として確認できない値があります。`, { code: "invalid_number", cells: [source] });
    return null;
  }
  return number;
}

function hasContent(sheet: XLSX.WorkSheet, row: number, column: number) {
  const entry = cell(sheet, row, column);
  return Boolean(entry && (entry.f || entry.t === "e" || (entry.v !== undefined && entry.v !== null && entry.v !== "")));
}

function makeTable(sheetName: string, suffix: string, kind: WorkbookLayoutTable["kind"], sourceRange: string, header: number): WorkbookLayoutTable {
  const table: WorkbookLayoutTable = {
    name: `${sheetName}｜${suffix}`,
    sourceSheetName: sheetName,
    sourceRange,
    headerRowNumber: header + 1,
    kind,
    headers: kind === "sale" ? saleHeaders : kind === "expense" ? expenseHeaders : [],
    mapping: kind === "sale"
      ? { date: "売上日", item_name: "サービス名", quantity: "数量", amount: "売上金額" }
      : kind === "expense" ? { date: "経費日", category_name: "用途", amount: "経費金額" } : {},
    rows: [],
    notices: [],
    requiresConfirmation: kind !== "ignore",
    blockingIssues: [],
    clarification: { version: 1, issues: [], checks: [] }
  };
  if (kind !== "ignore") table.clarification.issues.push(createImportClarificationIssue({ tableName: table.name, code: "layout_confirmation", source: { sheetName, range: sourceRange }, message: "抽出した表の範囲・日別集計の意味を確認してください。" }));
  return table;
}

function addRow(table: WorkbookLayoutTable, sourceRow: number, sourceColumn: number, sourceRange: string, values: Record<string, string>) {
  const column = XLSX.utils.encode_col(sourceColumn);
  table.rows.push({
    rowNumber: table.rows.length + 1,
    sourceRowNumber: sourceRow + 1,
    sourceColumn: column,
    sourceRange,
    rawData: { ...values, 元シート: table.sourceSheetName, 元行: String(sourceRow + 1), 元列: column, 元セル: sourceRange }
  });
}

function reportYearCandidates(sheet: XLSX.WorkSheet) {
  const years = new Set<number>();
  for (const [coordinate, entry] of Object.entries(sheet)) {
    if (coordinate.startsWith("!") || !/^[A-Z]+\d+$/u.test(coordinate)) continue;
    if (XLSX.utils.decode_cell(coordinate).r > 10 || typeof entry.v !== "string") continue;
    // Only explicit report-year labels, never dates on unrelated expense rows.
    const match = key(entry.v).match(/^((?:19|20)\d{2})年(?:分|度|度分|売上|売上表|集計|\d{1,2}月)?$/u);
    if (match) years.add(Number(match[1]));
  }
  return years;
}

function monthFor(sheetName: string, sheet: XLSX.WorkSheet) {
  const candidates = new Set<number>();
  const consider = (candidate: unknown) => {
    const match = key(candidate).match(/^(?:(?:19|20)\d{2}年)?(\d{1,2})月(?:分|売上|売上表)?$/u);
    if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) candidates.add(Number(match[1]));
  };
  consider(sheetName);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 10; column++) consider(value(sheet, row, column));
  return candidates.size === 1 ? [...candidates][0] : null;
}

function matricesIn(sheet: XLSX.WorkSheet): Matrix[] {
  const bounds = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const starts = Object.keys(sheet)
    .filter((coordinate) => /^[A-Z]+\d+$/u.test(coordinate) && key(sheet[coordinate]?.v) === "1日")
    .map((coordinate) => XLSX.utils.decode_cell(coordinate)).sort((a, b) => a.r - b.r || a.c - b.c);
  const result: Matrix[] = [];
  for (const start of starts) {
    if (start.r < 1 || start.c < 1 || !/^(件数|数量|個数)$/u.test(key(value(sheet, start.r, start.c - 1))) || !/^(金額|売上金額)$/u.test(key(value(sheet, start.r + 1, start.c - 1)))) continue;
    const columns: Matrix["columns"] = [];
    let totalColumn = -1;
    for (let c = start.c + 1; c <= Math.min(bounds.e.c, start.c + 200); c++) {
      const label = text(value(sheet, start.r - 1, c));
      if (totalLabel.test(key(label))) { totalColumn = c; break; }
      if (!label) break;
      columns.push({ column: c, label });
    }
    if (columns.length === 0 || totalColumn === -1) continue;
    const days: Matrix["days"] = [];
    for (let day = 1; day <= 31; day++) {
      const r = start.r + (day - 1) * 2;
      if (key(value(sheet, r, start.c)) !== `${day}日`) break;
      days.push({ day, row: r });
    }
    if (!days.length) continue;
    const after = days[days.length - 1].row + 2;
    const subtotalRow = totalLabel.test(key(value(sheet, after, start.c))) ? after : null;
    const overall = [start.r - 2, start.r - 3].some((r) => r >= 0 && /^(総合計|全体|全体合計|全社合計|売上総合計)$/u.test(key(value(sheet, r, start.c))));
    result.push({ header: start.r - 1, dayColumn: start.c, totalColumn, columns, days, subtotalRow, end: subtotalRow === null ? after - 1 : subtotalRow + 1, overall });
  }
  return result;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function reconcile(table: WorkbookLayoutTable, sheet: XLSX.WorkSheet, row: number, column: number, actual: number, label: string, field: "amount" | "quantity", rowNumbers = table.rows.map((record) => record.rowNumber)) {
  const declared = numeric(sheet, row, column, table);
  if (declared === null) {
    addIssue(table, `${address(row, column)}: ${label}の保存値を確認できないため、明細との照合ができません。`, { code: "source_missing", cells: [address(row, column)], field });
  } else if (Math.abs(declared - actual) > 0.01) {
    addIssue(table, `${address(row, column)}: ${label}（${declared}）と抽出明細の合計（${actual}）が一致しません。`, { code: "reconciliation", cells: [address(row, column)], field, rowNumbers, details: { expected: declared, actual, delta: declared - actual } });
  }
  if (declared !== null) {
    const source = { sheetName: table.sourceSheetName, range: table.sourceRange, cells: [address(row, column)] };
    const issue = createImportClarificationIssue({ tableName: table.name, code: "reconciliation", message: label, source, field, rowNumbers });
    table.clarification.checks!.push({ id: issue.id, tableName: table.name, field, expected: declared, rowNumbers, source });
  }
  return declared;
}

function extractSales(sheetName: string, sheet: XLSX.WorkSheet, matrix: Matrix, year: number | null, month: number | null) {
  const table = makeTable(sheetName, `日別売上 ${address(matrix.header, matrix.dayColumn + 1)}`, "sale", range(matrix.header, matrix.dayColumn - 1, matrix.end, matrix.totalColumn), matrix.header);
  table.clarification.period = { year, month };
  if (year === null || month === null) addIssue(table, "帳票の対象年・月を一意に確認できません。対象年月を確認してください（現在年は補完していません）。", { code: "report_period", details: { year, month } });
  if (!matrix.overall) addIssue(table, "全体の売上集計であることを確認できません。担当者別の明細との重複を確認してください。", { code: "unproven_coverage" });
  const amountTotals = new Map<number, number>();
  const quantityTotals = new Map<number, number>();
  let blanks = 0;
  let zeros = 0;
  let negative = 0;
  for (const { day, row } of matrix.days) {
    let dayAmount = 0;
    let dayQuantity = 0;
    for (const { column, label } of matrix.columns) {
      const quantity = numeric(sheet, row, column, table);
      const amount = numeric(sheet, row + 1, column, table);
      const present = hasContent(sheet, row, column) || hasContent(sheet, row + 1, column);
      if (quantity === null && amount === null && !present) { blanks++; continue; }
      if (quantity === 0 && amount === 0) { zeros++; continue; }
      if ((quantity === null || quantity === 0) && (amount === null || amount === 0) && !cell(sheet, row, column)?.f && !cell(sheet, row + 1, column)?.f && cell(sheet, row, column)?.t !== "e" && cell(sheet, row + 1, column)?.t !== "e") { zeros++; continue; }
      if (quantity === null) addIssue(table, `${address(row, column)}: 件数が未入力または読取不能です。1件には補完していません。`, { code: "missing_field", cells: [address(row, column)], field: "quantity" });
      if (amount === null) addIssue(table, `${address(row + 1, column)}: 売上金額が未入力または読取不能です。0円には補完していません。`, { code: "missing_field", cells: [address(row + 1, column)], field: "amount" });
      if (quantity !== null && quantity < 0 || amount !== null && amount < 0) negative++;
      if (year !== null && month !== null && !validDate(year, month, day)) addIssue(table, `${address(row, matrix.dayColumn)}: ${year}年${month}月${day}日は存在しない日付ですが、売上値があります。`, { code: "invalid_date", cells: [address(row, matrix.dayColumn)], field: "date", details: { year, month, day } });
      const date = year !== null && month !== null ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : `${month ?? "?"}月${day}日`;
      addRow(table, row + 1, column, range(row, column, row + 1, column), { 売上日: date, サービス名: label, 数量: quantity === null ? "" : String(quantity), 売上金額: amount === null ? "" : String(amount), データ粒度: "日別サービス別集計", 元日: String(day) });
      dayAmount += amount ?? 0;
      dayQuantity += quantity ?? 0;
      amountTotals.set(column, (amountTotals.get(column) ?? 0) + (amount ?? 0));
      quantityTotals.set(column, (quantityTotals.get(column) ?? 0) + (quantity ?? 0));
    }
    const dayRows = table.rows.filter((record) => record.sourceRowNumber === row + 2).map((record) => record.rowNumber);
    reconcile(table, sheet, row, matrix.totalColumn, dayQuantity, `${day}日の件数合計`, "quantity", dayRows);
    reconcile(table, sheet, row + 1, matrix.totalColumn, dayAmount, `${day}日の金額合計`, "amount", dayRows);
  }
  const total = [...amountTotals.values()].reduce((sum, number) => sum + number, 0);
  if (matrix.subtotalRow === null) {
    addIssue(table, "月合計行を確認できないため、月全体との照合ができません。", { code: "source_missing" });
  } else {
    for (const { column } of matrix.columns) {
      const columnRows = table.rows.filter((record) => record.sourceColumn === XLSX.utils.encode_col(column)).map((record) => record.rowNumber);
      reconcile(table, sheet, matrix.subtotalRow, column, quantityTotals.get(column) ?? 0, "サービス別の月間件数", "quantity", columnRows);
      reconcile(table, sheet, matrix.subtotalRow + 1, column, amountTotals.get(column) ?? 0, "サービス別の月間金額", "amount", columnRows);
    }
    reconcile(table, sheet, matrix.subtotalRow, matrix.totalColumn, [...quantityTotals.values()].reduce((sum, number) => sum + number, 0), "月間件数合計", "quantity");
    const declared = reconcile(table, sheet, matrix.subtotalRow + 1, matrix.totalColumn, total, "月間売上合計", "amount");
    if (declared !== null) table.notices.push(`月合計 ${address(matrix.subtotalRow + 1, matrix.totalColumn)}: 保存値 ${declared} / 抽出合計 ${total}。`);
  }
  table.notices.push(`件数・金額の2行組を日付×サービスの明細に変換しました。空欄 ${blanks}組、件数・金額とも0または空欄 ${zeros}組は売上として追加しません。`);
  if (new Set(matrix.columns.map(({ label }) => label)).size < matrix.columns.length) table.notices.push("同名サービス列を統合せず、元列・元セルを付けて別明細として保持しました。");
  if (negative) table.notices.push(`負数の明細 ${negative}件を符号を変えずに保持しました。返品・値引き等の意味を確認してください。`);
  table.notices.push("月次・日次合計は照合用です。単価、控除・差引・集計欄は取引明細へ変換していません。抽出した全体売上の範囲を確認してください。");
  return table;
}

function referencesMatrix(sheet: XLSX.WorkSheet, overall: Matrix, detail: Matrix) {
  if (overall.columns.length !== detail.columns.length) return false;
  // Do not infer that an arbitrary table below another table is a duplicate.
  // Require a direct same-sheet reference from the overall amounts to the detail.
  let references = 0;
  for (const [index, { row }] of overall.days.entries()) for (const [columnIndex, { column }] of overall.columns.entries()) {
    const detailDay = detail.days[index];
    if (!detailDay) return false;
    for (const offset of [0, 1]) {
      const targetCell = cell(sheet, detailDay.row + offset, detail.columns[columnIndex].column);
      const formula = cell(sheet, row + offset, column)?.f ?? "";
      const target = address(detailDay.row + offset, detail.columns[columnIndex].column);
      const linked = new RegExp(`(?:^|[^A-Z0-9_!])${target}(?![0-9])`, "u").test(formula.replace(/\$/gu, ""));
      if (linked) references++;
      const targetValue = parseImportNumber(targetCell?.v);
      const explicitlyEmpty = !hasContent(sheet, detailDay.row + offset, detail.columns[columnIndex].column);
      const calculatedZero = targetValue === 0 && targetCell?.t !== "e" && targetCell?.t !== "z";
      if (!linked && !explicitlyEmpty && !calculatedZero) return false;
    }
  }
  // A single unmatched nonzero detail value prevents exclusion of the table.
  return references > 0;
}

function unclaimedTableHeaders(sheet: XLSX.WorkSheet, claimedHeaders: string[] = []) {
  const claimed = new Set(claimedHeaders);
  const findings: string[] = [];
  for (const [coordinate, entry] of Object.entries(sheet)) {
    if (!/^[A-Z]+\d+$/u.test(coordinate) || claimed.has(coordinate) || typeof entry.v !== "string") continue;
    const label = key(entry.v).toLowerCase();
    const date = /^(日付|売上日|会計日|取引日|支払日|経費日|仕入日|date)$/u.test(label);
    const person = /^(顧客名|氏名|名前|name)$/u.test(label);
    const item = /^(商品名|品名|サービス名|メニュー名|item|product)$/u.test(label);
    if (!date && !person && !item) continue;
    const point = XLSX.utils.decode_cell(coordinate);
    const nearby = Array.from({ length: 8 }, (_, offset) => key(value(sheet, point.r, point.c + offset + 1)).toLowerCase());
    if (date && nearby.some((header) => /^(金額|合計|売上金額|経費金額|支払額|amount|total)$/u.test(header)) || person && nearby.some((header) => /^(電話番号|電話|メール|email|phone)$/u.test(header)) || item && nearby.some((header) => /^(単価|価格|販売価格|在庫数|棚卸数|数量|price|quantity)$/u.test(header))) findings.push(coordinate);
  }
  return findings;
}

function dateValue(entry: XLSX.CellObject | undefined, date1904: boolean) {
  if (!entry || entry.t === "e" || entry.t === "z" || entry.v === null || entry.v === undefined || entry.v === "") return "";
  if (entry.v instanceof Date) return `${entry.v.getUTCFullYear()}-${String(entry.v.getUTCMonth() + 1).padStart(2, "0")}-${String(entry.v.getUTCDate()).padStart(2, "0")}`;
  if (typeof entry.v === "number") {
    const parsed = XLSX.SSF.parse_date_code(entry.v, { date1904 });
    if (parsed && validDate(parsed.y, parsed.m, parsed.d)) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    return text(entry.v);
  }
  const match = key(entry.v).match(/^((?:19|20)\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?$/u);
  if (match && validDate(Number(match[1]), Number(match[2]), Number(match[3]))) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return text(entry.v);
}

function extractExpenses(sheetName: string, sheet: XLSX.WorkSheet, year: number | null, month: number | null, date1904: boolean, main: Matrix) {
  const bounds = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  const headers = Object.keys(sheet)
    .filter((coordinate) => /^[A-Z]+\d+$/u.test(coordinate) && /^(日付|支払日|経費日)$/u.test(key(sheet[coordinate]?.v)))
    .map((coordinate) => XLSX.utils.decode_cell(coordinate))
    .filter(({ r, c }) => c > main.totalColumn && /^(用途|摘要|費目|勘定科目)$/u.test(key(value(sheet, r, c + 1))) && /^(金額|支払額|経費金額)$/u.test(key(value(sheet, r, c + 2))));
  const tables: WorkbookLayoutTable[] = [];
  for (const { r, c } of headers) {
    const table = makeTable(sheetName, `経費 ${address(r, c)}`, "expense", range(r, c, bounds.e.r, c + 2), r);
    table.clarification.period = { year, month };
    if (month === null) addIssue(table, "帳票の月表示が不明または複数あるため、経費の日付との整合性を確認できません。保存された日付は変更していません。", { code: "expense_period", details: { year, month } });
    let lastRow = r;
    let mismatches = 0;
    let amountTotal = 0;
    let aggregateCount = 0;
    for (let row = r + 1; row <= bounds.e.r; row++) {
      if (headers.some((header) => header.c === c && header.r === row)) break;
      const fields = [c, c + 1, c + 2];
      if (!fields.some((column) => hasContent(sheet, row, column))) continue;
      lastRow = row;
      // Expense totals can have a label immediately to the left of the date column.
      if ([c - 1, c, c + 1].some((column) => totalLabel.test(key(value(sheet, row, column))))) {
        reconcile(table, sheet, row, c + 2, amountTotal, "経費合計", "amount");
        aggregateCount++;
        // Rows after the explicit total are outside this expense ledger.
        break;
      }
      const dateCell = cell(sheet, row, c);
      if (dateCell?.f && (dateCell.t === "z" || dateCell.v === undefined || dateCell.v === null || dateCell.v === "")) addIssue(table, `${address(row, c)}: 日付の数式に保存済み計算結果がありません。`, { code: "source_missing", cells: [address(row, c)], field: "date" });
      const date = dateValue(dateCell, date1904);
      const purpose = text(value(sheet, row, c + 1));
      const amount = numeric(sheet, row, c + 2, table);
      if (!date && !purpose && amount === 0) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) addIssue(table, `${address(row, c)}: 年を含む有効な経費日を確認できません。帳票の年・月からは補完していません。`, { code: "invalid_date", cells: [address(row, c)], field: "date" });
      else if (year !== null && Number(date.slice(0, 4)) !== year || month !== null && /^\d{4}-\d{2}-\d{2}$/u.test(date) && Number(date.slice(5, 7)) !== month) mismatches++;
      if (amount === null) addIssue(table, `${address(row, c + 2)}: 経費金額を確認できません。0円には補完していません。`, { code: "missing_field", cells: [address(row, c + 2)], field: "amount" });
      addRow(table, row, c, range(row, c, row, c + 2), { 経費日: date, 用途: purpose, 経費金額: amount === null ? "" : String(amount) });
      amountTotal += amount ?? 0;
    }
    table.sourceRange = range(r, c, lastRow, c + 2);
    if (mismatches) addIssue(table, `${mismatches}件の経費日が帳票の対象年月（${year ?? "年不明"}年${month ?? "月不明"}月）と一致しません。保存された日付を保持しています。元ファイルを確認してください。`, { code: "expense_period", details: { year, month, count: mismatches } });
    table.notices.push("用途を支払先とはみなしていません。支払先列がないため、取り込み時の確認が必要です。");
    if (aggregateCount) table.notices.push("経費合計行は照合のみに使用し、明細には追加していません。合計行より下の値はこの経費台帳の範囲外です。");
    tables.push(table);
  }
  return tables;
}

export function extractWorkbookLayouts(workbook: XLSX.WorkBook): { tables: WorkbookLayoutTable[]; handledSheetNames: string[]; notices: string[] } {
  const tables: WorkbookLayoutTable[] = [];
  const handled = new Set<string>();
  const notices: string[] = [];
  const visible = workbook.SheetNames.filter((name) => !workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name)?.Hidden);
  const years = new Set(visible.flatMap((name) => workbook.Sheets[name] ? [...reportYearCandidates(workbook.Sheets[name])] : []));
  const globalYear = years.size === 1 ? [...years][0] : null;
  const monthlySheets = new Set<string>();
  const monthlyLayouts = new Map<string, { main: Matrix; sales: WorkbookLayoutTable; nextMatrixHeader: number }>();
  for (const sheetName of visible) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const bounds = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    if (bounds.e.r >= 100_000 || (bounds.e.r - bounds.s.r + 1) * (bounds.e.c - bounds.s.c + 1) > 2_000_000) continue;
    const matrices = matricesIn(sheet);
    if (!matrices.length) continue;
    const main = matrices.find((matrix) => matrix.overall) ?? matrices[0];
    const ownYears = reportYearCandidates(sheet);
    const year = ownYears.size === 1 ? [...ownYears][0] : ownYears.size > 1 ? null : globalYear;
    const month = monthFor(sheetName, sheet);
    const sales = extractSales(sheetName, sheet, main, year, month);
    for (const detail of matrices.filter((matrix) => matrix !== main)) {
      const sourceRange = range(detail.header, detail.dayColumn - 1, detail.end, detail.totalColumn);
      if (main.overall && referencesMatrix(sheet, main, detail)) {
        sales.notices.push(`${sourceRange}: 全体売上の数式が参照する内訳表のため、重複計上を避けて追加していません。`);
        if (main.columns.some((column, index) => column.label !== detail.columns[index]?.label)) addIssue(sales, `${sourceRange}: 全体と内訳で同じ参照列のサービス見出しが異なります。名称・集計区分を元ファイルで確認してください。`, { code: "label_conflict", sourceRange });
      } else {
        addIssue(sales, `${sourceRange}: 別の売上表がありますが、全体との重複・独立を判定できません。自動追加していません。`, { code: "unproven_coverage", sourceRange });
      }
    }
    const expenses = extractExpenses(sheetName, sheet, year, month, Boolean(workbook.Workbook?.WBProps?.date1904), main);
    for (const coordinate of unclaimedTableHeaders(sheet, expenses.map((table) => table.sourceRange.split(":")[0]))) {
      addIssue(sales, `${coordinate}: 自動抽出した売上・経費表のほかに取引・台帳の見出しがあります。取り落としを避けるため停止しました。この表を別シートに分けて確認してください。`, { code: "unclaimed_structure", cells: [coordinate] });
    }
    tables.push(sales, ...expenses);
    handled.add(sheetName);
    monthlySheets.add(sheetName);
    monthlyLayouts.set(sheetName, { main, sales, nextMatrixHeader: matrices.find((matrix) => matrix.header > main.end)?.header ?? bounds.e.r + 1 });
  }
  // Annual/cumulative formula reports reference monthly details, rather than
  // introducing new transactions. A title alone never suffices for exclusion.
  for (const sheetName of visible) {
    if (handled.has(sheetName) || !/(累計|年間|年計|集計|summary)/iu.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const independentHeaders = unclaimedTableHeaders(sheet);
    if (independentHeaders.length) {
      notices.push(`${sheetName}: 集計以外の取引・台帳見出し（${independentHeaders.join("、")}）があるため、シート全体を参照集計として除外していません。`);
      continue;
    }
    const references = new Set<string>();
    for (const [coordinate, entry] of Object.entries(sheet)) {
      if (coordinate.startsWith("!") || !entry?.f) continue;
      for (const match of entry.f.matchAll(/(?:'((?:[^']|'')+)'|([^\s'+\-*/(),:=]+))!/gu)) references.add((match[1] ?? match[2]).replace(/''/gu, "'"));
      for (const match of entry.f.matchAll(/(?:'((?:[^']|'')+)'|([^\s'+\-*/(),:=]+))!(\$?[A-Z]+\$?\d+)/gu)) {
        const sourceSheetName = (match[1] ?? match[2]).replace(/''/gu, "'");
        const layout = monthlyLayouts.get(sourceSheetName);
        if (!layout) continue;
        const target = XLSX.utils.decode_cell(match[3].replace(/\$/gu, ""));
        // A cumulative report may intentionally reference the adjusted total
        // below the gross daily matrix. Never silently call gross sales net.
        if (target.c !== layout.main.totalColumn || target.r <= layout.main.end || target.r >= layout.nextMatrixHeader) continue;
        // SUM(blank) placeholders for later months are not adjusted totals.
        // A formula stub is still content and must take the missing-cache path.
        if (!hasContent(workbook.Sheets[sourceSheetName], target.r, target.c)) continue;
        const adjusted = numeric(workbook.Sheets[sourceSheetName], target.r, target.c, layout.sales);
        const gross = layout.sales.rows.reduce((sum, row) => sum + Number(row.rawData.売上金額 || 0), 0);
        if (adjusted === null) {
          addIssue(layout.sales, `${sheetName}!${coordinate}が参照する${address(target.r, target.c)}の調整後合計を確認できません。日別明細との整合性を確認してください。`, { code: "source_missing", cells: [address(target.r, target.c)] });
        } else if (Math.abs(adjusted - gross) > 0.01) {
          addIssue(layout.sales, `${sheetName}!${coordinate}が参照する${address(target.r, target.c)}の調整後合計（${adjusted}）と日別明細合計（${gross}）に差額（${adjusted - gross}）があります。調整・控除の用途を確認するまで取り込めません。`, { code: "adjustment", cells: [address(target.r, target.c)], details: { expected: adjusted, actual: gross, delta: adjusted - gross } });
          const notice = `日別明細合計 ${gross} / 累計が参照する調整後合計 ${adjusted}。差額を新しい売上や値引きとして自動作成していません。`;
          if (!layout.sales.notices.includes(notice)) layout.sales.notices.push(notice);
        }
      }
    }
    if (![...references].some((name) => monthlySheets.has(name)) || [...references].some((name) => !monthlySheets.has(name) && name !== sheetName)) continue;
    const table = makeTable(sheetName, "参照集計（対象外）", "ignore", sheet["!ref"] ?? "A1", 0);
    table.excludedReason = "月別売上表を参照する累計・年間集計です。同じ売上の二重計上を避けるため、取引明細には追加していません。";
    table.notices.push(table.excludedReason);
    tables.push(table);
    handled.add(sheetName);
  }
  return { tables, handledSheetNames: [...handled], notices };
}
