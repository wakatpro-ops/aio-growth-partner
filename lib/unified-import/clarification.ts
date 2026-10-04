import { normalizeImportBusinessDate, parseImportDateIso } from "../import-date.ts";
import { parseImportNumber, validateUnifiedImportValues } from "./value-validation.ts";
import type { ParsedUnifiedImportRow, UnifiedImportSheetSummary } from "@/types/unified-import";

export type ImportIssueCode = "report_period" | "expense_period" | "invalid_date" | "invalid_number" | "reconciliation" | "adjustment" | "source_missing" | "source_error" | "unclaimed_structure" | "unproven_coverage" | "label_conflict" | "layout_confirmation" | "missing_field";
export type ImportQuality = "normal" | "clarifiable" | "unprocessable";
export type ImportEvidenceSource = { sheetName: string; range: string; cells?: string[] };
export type ImportClarificationIssue = {
  id: string;
  tableName: string;
  code: ImportIssueCode;
  severity: Exclude<ImportQuality, "normal">;
  message: string;
  source: ImportEvidenceSource;
  rowNumbers?: number[];
  field?: string;
  details?: { year?: number | null; month?: number | null; day?: number; expected?: number; actual?: number; delta?: number; count?: number };
};
export type ImportReconciliationCheck = { id: string; tableName: string; field: "amount" | "quantity"; expected: number; rowNumbers: number[]; source: ImportEvidenceSource };
export type ImportClarificationMetadata = {
  version: 1;
  issues: ImportClarificationIssue[];
  period?: { year: number | null; month: number | null };
  checks?: ImportReconciliationCheck[];
};
type ResolutionBase = { id: string; tableName: string; issueIds: string[]; reason: string };
export type ImportClarificationResolution = ResolutionBase & (
  | { action: "set_period"; scope: "report" | "expense"; year: number; month: number }
  | { action: "keep_expense_dates" }
  | { action: "correct_values"; corrections: { rowNumber: number; field: string; value: string | number }[] }
  | { action: "set_default"; field: "vendor_name"; value: string }
  | { action: "use_details"; observedTotals: Record<string, number> }
  | { action: "use_gross"; observedGross: number; observedAdjusted: number }
  | { action: "sales_adjustment"; date: string; signedAmount: number; itemName: string; observedGross: number; observedAdjusted: number }
  | { action: "confirm_layout" }
);
export type ImportClarificationResult = {
  sheets: UnifiedImportSheetSummary[];
  rows: ParsedUnifiedImportRow[];
  issues: ImportClarificationIssue[];
  quality: ImportQuality;
  acceptedResolutionIds: string[];
  rejectedResolutions: { id: string; message: string }[];
  heldTables: string[];
  qualityMetrics: { candidateRows: number; invalidCriticalRows: number; invalidDateRows: number; invalidNumberRows: number; invalidRatio: number; hardThresholdTriggered: boolean };
};

export const IMPORT_QUALITY_MINIMUM_CANDIDATE_ROWS = 20;
export const IMPORT_QUALITY_INVALID_RATIO_THRESHOLD = 0.8;

/** Latest explicit answer to any overlapping question supersedes the whole
 * earlier decision. Audit properties and the original history remain intact. */
export function selectActiveImportResolutions<T extends { tableName: string; issueIds: string[] }>(history: readonly T[]): T[] {
  return history.filter((answer, index) => !history.slice(index + 1).some((later) => later.tableName === answer.tableName && later.issueIds.some((id) => answer.issueIds.includes(id))));
}

const hardCodes = new Set<ImportIssueCode>(["source_missing", "source_error", "unclaimed_structure", "unproven_coverage", "label_conflict"]);
const dateFields = new Set(["date", "birth_date", "last_visit_date", "time"]);
const numberFields = new Set(["amount", "quantity", "unit_price", "tax_amount", "subtotal_amount", "cost_price", "unit_price", "tax_rate", "reorder_point", "visit_count"]);
const required: Record<string, string[]> = { sale: ["date", "item_name", "amount"], expense: ["date", "amount"], customer: ["name", "phone"], item: ["name"], inventory: ["item_name", "quantity"] };
const clean = (value: unknown) => String(value ?? "").trim();
const sameMoney = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.01;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(36);
}

/** IDs depend on source identity, never Japanese display wording or clock time. */
export function createImportClarificationIssue(input: Omit<ImportClarificationIssue, "id" | "severity"> & { severity?: ImportClarificationIssue["severity"] }): ImportClarificationIssue {
  const identity = [input.tableName, input.code, input.source.sheetName, input.source.cells?.join(",") || input.source.range, input.field ?? "", input.rowNumbers?.join(",") ?? ""].join("\u001f");
  return { ...input, id: `ici_${hash(identity)}`, severity: input.severity ?? (hardCodes.has(input.code) ? "unprocessable" : "clarifiable") };
}

function sourceFor(sheet: UnifiedImportSheetSummary, rowNumbers?: number[]): ImportEvidenceSource {
  return { sheetName: sheet.sourceSheetName ?? sheet.name, range: rowNumbers?.length ? `row:${rowNumbers.join(",")}` : sheet.sourceRange ?? `header:${sheet.headerRowNumber}` };
}

function checkIssue(check: ImportReconciliationCheck, rows: ParsedUnifiedImportRow[]) {
  const selected = rows.filter((row) => row.sheetName === check.tableName && check.rowNumbers.includes(row.rowNumber));
  const numbers = selected.map((row) => parseImportNumber(row.normalizedData[check.field]));
  if (selected.length !== check.rowNumbers.length || numbers.some((value) => value === null)) return null;
  const actual = numbers.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const issue = createImportClarificationIssue({ tableName: check.tableName, code: "reconciliation", source: check.source, field: check.field, rowNumbers: check.rowNumbers, message: `保存された合計 ${check.expected} と明細合計 ${actual} を確認してください。`, details: { expected: check.expected, actual, delta: check.expected - actual } });
  return { ...issue, id: check.id };
}

function rowIssues(sheets: UnifiedImportSheetSummary[], rows: ParsedUnifiedImportRow[], periodPending: Set<string>) {
  const result: ImportClarificationIssue[] = [];
  for (const sheet of sheets) {
    if (sheet.suggestedRecordType === "ignore") continue;
    if (sheet.suggestedRecordType === "unknown") {
      result.push(createImportClarificationIssue({ tableName: sheet.name, code: "missing_field", field: "record_type", source: sourceFor(sheet), message: "この表の列の対応が未確認です。取込先と必要な列を指定してください。" }));
      continue;
    }
    const groups = new Map<string, { code: ImportIssueCode; field: string; rows: number[]; message: string }>();
    for (const row of rows.filter((row) => row.sheetName === sheet.name)) {
      const fields = [...(required[row.suggestedRecordType] ?? [])];
      // A supplied but incomplete supplier column still needs a grouped answer.
      // A ledger with no such column is saved as a draft, not fabricated.
      if (row.suggestedRecordType === "expense" && Object.hasOwn(row.normalizedData, "vendor_name")) fields.push("vendor_name");
      if (row.suggestedRecordType === "sale" && row.rawData.データ粒度 === "日別サービス別集計") fields.push("quantity");
      const missing = fields.filter((field) => !clean(row.normalizedData[field]));
      const invalid = validateUnifiedImportValues(row.suggestedRecordType, row.normalizedData).map((issue) => ({ ...issue, code: dateFields.has(issue.field) ? "invalid_date" as const : "invalid_number" as const }));
      for (const issue of [...missing.map((field) => ({ field, code: "missing_field" as const, message: `${field}が未入力です。元の情報を確認してください。` })), ...invalid]) {
        if (issue.field === "date" && periodPending.has(sheet.name)) continue;
        const key = `${issue.code}:${issue.field}`;
        const group = groups.get(key) ?? { code: issue.code, field: issue.field, rows: [], message: issue.message };
        if (!group.rows.includes(row.rowNumber)) group.rows.push(row.rowNumber);
        groups.set(key, group);
      }
    }
    for (const group of groups.values()) {
      const cells = rows.filter((row) => row.sheetName === sheet.name && group.rows.includes(row.rowNumber)).map((row) => row.rawData.元セル).filter(Boolean);
      result.push(createImportClarificationIssue({ tableName: sheet.name, code: group.code, field: group.field, rowNumbers: group.rows, source: { ...sourceFor(sheet, group.rows), ...(cells.length ? { cells } : {}) }, message: `${group.rows.length}行: ${group.message}` }));
    }
  }
  return result;
}

function total(rows: ParsedUnifiedImportRow[], tableName: string) {
  const values = rows.filter((row) => row.sheetName === tableName && row.normalizedData.clarification_adjustment !== true).map((row) => parseImportNumber(row.normalizedData.amount));
  return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function sourceDay(row: ParsedUnifiedImportRow) {
  const explicit = Number(row.rawData.元日);
  if (Number.isInteger(explicit) && explicit >= 1 && explicit <= 31) return explicit;
  const input = clean(row.normalizedData.date).normalize("NFKC");
  const iso = input.match(/^\d{4}[-/.年]\d{1,2}[-/.月](\d{1,2})(?:日|$)/u);
  const partial = input.match(/^(?:\d{1,2}|\?)月(\d{1,2})日$/u) ?? input.match(/^\d{1,2}[/-](\d{1,2})$/u);
  const day = Number(iso?.[1] ?? partial?.[1]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

/** Replay ORIGINAL rows/summaries and complete resolution history. Pure, no I/O.
 * The returned rawData is never changed; only normalizedData is corrected.
 * Financial decisions are evidence-bound and cannot waive missing source cells. */
export function resolveImportClarification(input: { sheets: UnifiedImportSheetSummary[]; rows: ParsedUnifiedImportRow[]; resolutions?: ImportClarificationResolution[]; heldTables?: string[] }): ImportClarificationResult {
  const sheets = structuredClone(input.sheets);
  let rows = structuredClone(input.rows);
  const heldTables = [...new Set(input.heldTables ?? [])].filter((name) => sheets.some((sheet) => sheet.name === name));
  const original = sheets.flatMap((sheet) => sheet.clarification?.issues ?? []);
  const originalChecks = sheets.flatMap((sheet) => sheet.clarification?.checks ?? []);
  const baselineDynamic = rowIssues(sheets, rows, new Set(original.filter((issue) => issue.code === "report_period").map((issue) => issue.tableName)));
  const known = new Map([...original, ...baselineDynamic, ...originalChecks.map((check) => checkIssue(check, rows)).filter((issue): issue is ImportClarificationIssue => issue !== null)].map((issue) => [issue.id, issue]));
  const resolved = new Set<string>();
  const acceptedResolutionIds: string[] = [];
  const rejectedResolutions: ImportClarificationResult["rejectedResolutions"] = [];
  const financialDecisions: { resolution: ImportClarificationResolution; issues: ImportClarificationIssue[] }[] = [];
  const seenResolutionIds = new Map<string, string>();
  const financialTables = new Set<string>();
  const periodTables = new Set<string>();
  const reject = (id: string, message: string) => rejectedResolutions.push({ id, message });

  for (const resolution of input.resolutions ?? []) {
    if (!resolution || typeof resolution !== "object" || typeof resolution.id !== "string" || !clean(resolution.id) || typeof resolution.tableName !== "string" || typeof resolution.reason !== "string") { reject("", "回答ID・対象表・理由を確認してください。"); continue; }
    if (seenResolutionIds.has(resolution.id)) {
      if (seenResolutionIds.get(resolution.id) !== JSON.stringify(resolution)) reject(resolution.id, "同じ回答IDに異なる内容があります。");
      continue;
    }
    seenResolutionIds.set(resolution.id, JSON.stringify(resolution));
    const sheet = sheets.find((candidate) => candidate.name === resolution.tableName);
    if (!sheet || sheet.suggestedRecordType === "ignore") { reject(resolution.id, "対象の表がありません。"); continue; }
    if (clean(resolution.reason).length < 2 || clean(resolution.reason).length > 2000) { reject(resolution.id, "判断の理由を2〜2000文字で入力してください。"); continue; }
    for (const issue of rowIssues(sheets, rows, new Set())) known.set(issue.id, issue);
    for (const check of originalChecks) { const issue = checkIssue(check, rows); if (issue) known.set(issue.id, issue); }
    if (!Array.isArray(resolution.issueIds) || !resolution.issueIds.length || resolution.issueIds.some((id) => !known.has(id) || known.get(id)?.tableName !== sheet.name)) { reject(resolution.id, "確認対象が元の表と一致しません。最新の確認画面を開き直してください。"); continue; }
    const targets = [...new Set(resolution.issueIds)].map((id) => known.get(id)!);
    if (targets.some((issue) => issue.severity === "unprocessable" || hardCodes.has(issue.code))) { reject(resolution.id, "元データ不足・構造未確認の問題は回答だけで解除できません。元ファイルを直すか表全体を保留してください。"); continue; }
    const tableRows = rows.filter((row) => row.sheetName === sheet.name);
    const only = (...codes: ImportIssueCode[]) => targets.every((issue) => codes.includes(issue.code));
    let error = "";
    if (resolution.action === "set_period") {
      if (!only("report_period", "expense_period", "invalid_date") || !Number.isInteger(resolution.year) || resolution.year < 1900 || resolution.year > 9999 || !Number.isInteger(resolution.month) || resolution.month < 1 || resolution.month > 12 || (resolution.scope === "report" ? sheet.suggestedRecordType !== "sale" : sheet.suggestedRecordType !== "expense")) error = "対象年・月または表の種類が正しくありません。";
      else if (periodTables.has(sheet.name)) error = "同じ表に複数の年月回答があります。回答を置き換えてください。";
      else if (tableRows.some((row) => sourceDay(row) === null)) error = "元の日を確認できない行があります。行ごとの日付を先に修正してください。";
      else {
        for (const row of tableRows) row.normalizedData.date = `${resolution.year}-${String(resolution.month).padStart(2, "0")}-${String(sourceDay(row)).padStart(2, "0")}`;
        periodTables.add(sheet.name);
        if (sheet.clarification) sheet.clarification.period = { year: resolution.year, month: resolution.month };
      }
    } else if (resolution.action === "keep_expense_dates") {
      if (sheet.suggestedRecordType !== "expense" || !only("expense_period")) error = "経費日付の確認にだけ使える回答です。";
      else if (tableRows.some((row) => !normalizeImportBusinessDate(row.normalizedData.date) || !parseImportDateIso(row.normalizedData.date))) error = "無効・不明な日付があります。その行を修正してください。";
    } else if (resolution.action === "correct_values") {
      if (!only("invalid_date", "invalid_number", "missing_field") || !Array.isArray(resolution.corrections) || !resolution.corrections.length || resolution.corrections.length > 50000) error = "修正する行と値を指定してください。";
      else {
        const replacements = new Map<ParsedUnifiedImportRow, Record<string, string | number | boolean | null>>();
        for (const correction of resolution.corrections) {
          if (!correction || typeof correction !== "object" || !Number.isInteger(correction.rowNumber) || typeof correction.field !== "string" || !["string", "number"].includes(typeof correction.value)) { error = "修正する行・項目・値が正しくありません。"; break; }
          const row = tableRows.find((candidate) => candidate.rowNumber === correction.rowNumber);
          if (!row || !targets.some((issue) => issue.field === correction.field && issue.rowNumbers?.includes(correction.rowNumber)) || (!dateFields.has(correction.field) && !numberFields.has(correction.field) && !["vendor_name", "item_name", "name", "phone"].includes(correction.field))) { error = "確認対象でない行・項目は修正できません。"; break; }
          const data = { ...(replacements.get(row) ?? row.normalizedData), [correction.field]: correction.value };
          const invalid = validateUnifiedImportValues(row.suggestedRecordType, data).some((issue) => issue.field === correction.field);
          if (!clean(correction.value) || invalid || numberFields.has(correction.field) && parseImportNumber(correction.value) === null) { error = "修正値が有効な日付・数値ではありません。"; break; }
          replacements.set(row, data);
        }
        if (!error) for (const [row, data] of replacements) row.normalizedData = data;
      }
    } else if (resolution.action === "set_default") {
      if (sheet.suggestedRecordType !== "expense" || resolution.field !== "vendor_name" || !only("missing_field") || targets.some((issue) => issue.field !== "vendor_name") || typeof resolution.value !== "string" || !clean(resolution.value) || clean(resolution.value).length > 200) error = "経費の未入力の支払先に対する回答を指定してください。";
      else for (const row of tableRows) if (!clean(row.normalizedData.vendor_name)) row.normalizedData.vendor_name = clean(resolution.value);
    } else if (resolution.action === "confirm_layout") {
      if (!only("layout_confirmation")) error = "範囲確認だけで未解決のデータ問題は解除できません。";
    } else if (resolution.action === "use_details") {
      if (!only("reconciliation") || targets.some((issue) => issue.details?.actual === undefined || !sameMoney(resolution.observedTotals?.[issue.id], issue.details.actual))) error = "画面で確認した明細合計と現在の値が一致しません。合計と理由を確認してください。";
      else financialDecisions.push({ resolution, issues: targets });
    } else if (resolution.action === "use_gross" || resolution.action === "sales_adjustment") {
      const gross = total(rows, sheet.name);
      if (sheet.suggestedRecordType !== "sale" || !only("adjustment") || gross === null || !sameMoney(gross, resolution.observedGross) || targets.some((issue) => issue.details?.expected === undefined || !sameMoney(issue.details.expected, resolution.observedAdjusted))) error = "確認した明細合計・調整後合計と現在の値が一致しません。";
      else if (financialTables.has(sheet.name)) error = "同じ表の調整方法が複数指定されています。どちらを採用するか確認してください。";
      else if (resolution.action === "sales_adjustment" && (!normalizeImportBusinessDate(resolution.date) || !parseImportDateIso(resolution.date) || parseImportNumber(resolution.signedAmount) === null || resolution.signedAmount === 0 || !sameMoney(resolution.signedAmount, resolution.observedAdjusted - gross) || !clean(resolution.itemName) || clean(resolution.itemName).length > 200)) error = "調整日・名称・符号付き金額を確認してください。金額は確認中の差額と一致する必要があります。";
      else { financialTables.add(sheet.name); financialDecisions.push({ resolution, issues: targets }); }
    } else error = "対応していない回答です。";
    if (error) { reject(resolution.id, error); continue; }
    acceptedResolutionIds.push(resolution.id);
    for (const target of targets) resolved.add(target.id);
  }

  // Re-evaluate monetary consents after EVERY correction, even a later one.
  for (const decision of financialDecisions) {
    const { resolution, issues } = decision;
    const gross = total(rows, resolution.tableName);
    const valid = resolution.action === "use_details"
      ? issues.every((issue) => {
          const check = originalChecks.find((candidate) => candidate.id === issue.id);
          const current = check ? checkIssue(check, rows) : issue;
          return current?.details?.actual !== undefined && sameMoney(resolution.observedTotals[issue.id], current.details.actual);
        })
      : (resolution.action === "use_gross" || resolution.action === "sales_adjustment") && gross !== null && sameMoney(gross, resolution.observedGross);
    if (!valid) {
      for (const issue of issues) resolved.delete(issue.id);
      acceptedResolutionIds.splice(acceptedResolutionIds.indexOf(resolution.id), 1);
      reject(resolution.id, "後続の修正で金額が変わったため、合計について再確認が必要です。");
    } else if (resolution.action === "sales_adjustment") {
      rows.push({ sheetName: resolution.tableName, rowNumber: Math.max(0, ...rows.filter((row) => row.sheetName === resolution.tableName).map((row) => row.rowNumber)) + 1,
        rawData: { データ粒度: "利用者確認済み売上調整", 確認回答ID: resolution.id, 確認理由: clean(resolution.reason), 調整日: resolution.date, 調整金額: String(resolution.signedAmount) },
        normalizedData: { date: normalizeImportBusinessDate(resolution.date), item_name: clean(resolution.itemName), amount: resolution.signedAmount, quantity: 1, memo: clean(resolution.reason), transaction_id: `clarification:${resolution.id}`, clarification_adjustment: true, source_resolution_id: resolution.id },
        suggestedRecordType: "sale", confidence: 1, missingFields: [], question: null });
    }
  }
  const pendingPeriod = new Set(original.filter((issue) => issue.code === "report_period" && !resolved.has(issue.id)).map((issue) => issue.tableName));
  const remaining = original.filter((issue) => !resolved.has(issue.id) && !["invalid_date", "invalid_number", "missing_field", "reconciliation"].includes(issue.code)).map((issue) => {
    if (issue.code !== "adjustment") return issue;
    const currentGross = total(rows, issue.tableName);
    return currentGross !== null && issue.details?.expected !== undefined ? { ...issue, details: { ...issue.details, actual: currentGross, delta: issue.details.expected - currentGross } } : issue;
  });
  for (const check of originalChecks) {
    const issue = checkIssue(check, rows);
    if (issue && !resolved.has(issue.id) && !sameMoney(issue.details!.expected!, issue.details!.actual!)) remaining.push(issue);
  }
  // Legacy typed reconciliation evidence remains actionable even without checks.
  for (const issue of original.filter((issue) => issue.code === "reconciliation" && !originalChecks.some((check) => check.id === issue.id) && !resolved.has(issue.id))) remaining.push(issue);
  remaining.push(...rowIssues(sheets, rows, pendingPeriod));
  for (const sheet of sheets) {
    const issues = remaining.filter((issue) => issue.tableName === sheet.name);
    if (!sheet.clarification && sheet.blockingIssues?.length) {
      const legacy = createImportClarificationIssue({ tableName: sheet.name, code: "source_missing", source: sourceFor(sheet), message: "旧解析結果には解決可能な根拠情報がありません。ファイルを再解析してください。" });
      issues.push(legacy); remaining.push(legacy);
    }
    sheet.clarification = { ...(sheet.clarification ?? {}), version: 1, issues };
    sheet.blockingIssues = issues.map((issue) => issue.message);
    sheet.requiresConfirmation = issues.some((issue) => issue.code === "layout_confirmation");
    sheet.rowCount = rows.filter((row) => row.sheetName === sheet.name).length;
  }
  const activeIssues = remaining.filter((issue) => !heldTables.includes(issue.tableName));
  const criticalRows = rows.filter((row) => !heldTables.includes(row.sheetName) && ["sale", "expense"].includes(row.suggestedRecordType) && row.normalizedData.clarification_adjustment !== true);
  const invalidDates = new Set<string>();
  const invalidNumbers = new Set<string>();
  for (const row of criticalRows) {
    const sheet = sheets.find((candidate) => candidate.name === row.sheetName)!;
    const rowKey = `${row.sheetName}\u001f${row.rowNumber}`;
    if (!pendingPeriod.has(row.sheetName) && sheet.suggestedMapping?.date && (!normalizeImportBusinessDate(row.normalizedData.date) || !parseImportDateIso(row.normalizedData.date))) invalidDates.add(rowKey);
    if (sheet.suggestedMapping?.amount && parseImportNumber(row.normalizedData.amount) === null) invalidNumbers.add(rowKey);
  }
  const invalidCriticalRows = new Set([...invalidDates, ...invalidNumbers]).size;
  const invalidRatio = criticalRows.length ? invalidCriticalRows / criticalRows.length : 0;
  const qualityMetrics = { candidateRows: criticalRows.length, invalidCriticalRows, invalidDateRows: invalidDates.size, invalidNumberRows: invalidNumbers.size, invalidRatio,
    hardThresholdTriggered: criticalRows.length >= IMPORT_QUALITY_MINIMUM_CANDIDATE_ROWS && invalidRatio > IMPORT_QUALITY_INVALID_RATIO_THRESHOLD && invalidDates.size > 0 && invalidNumbers.size > 0 };
  for (const row of rows) {
    const issues = activeIssues.filter((issue) => issue.tableName === row.sheetName && issue.rowNumbers?.includes(row.rowNumber));
    row.missingFields = [...new Set(issues.map((issue) => issue.field).filter((field): field is string => Boolean(field)))];
    const mapping = sheets.find((sheet) => sheet.name === row.sheetName)?.suggestedMapping;
    const rowValueIssues = issues.filter((issue) => issue.field && mapping?.[issue.field]);
    row.question = rowValueIssues.length ? rowValueIssues.map((issue) => issue.message).join(" ") : null;
  }
  rows = rows.map((row) => ({ ...row, rawData: { ...row.rawData } }));
  return { sheets, rows, issues: activeIssues, quality: qualityMetrics.hardThresholdTriggered || activeIssues.some((issue) => issue.severity === "unprocessable") ? "unprocessable" : activeIssues.length ? "clarifiable" : "normal", acceptedResolutionIds, rejectedResolutions, heldTables, qualityMetrics };
}
