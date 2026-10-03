import type { AiSection } from "./context-rules";

export type ImportContextJob = {
  id: string; status: string; total_rows: number; approved_rows: number; updated_at: string;
  sheet_summaries: unknown; questions?: unknown; clarification_state?: unknown;
  held_sheets?: unknown; clarification_pending_id?: unknown;
};
export type ImportContextRow = { sheet_name: string; review_status: string; confirmed_record_type: string | null; missing_fields?: unknown };
const tableLimit = 30, groupLimit = 12, evidenceLimit = 4;
const codes = {
  report_period: "帳票の対象年・月を確認してください。",
  expense_period: "経費に保存された日付と帳票の対象年月のどちらが正しいか確認してください。",
  invalid_date: "読み取れなかった日付の正しい年月日を確認してください。",
  invalid_number: "読み取れなかった金額・数量を確認してください。",
  reconciliation: "明細と合計の差が調整額なのか、入力・集計の誤りなのか確認してください。",
  adjustment: "差額・控除を売上から差し引くのか、別の経費・参考情報なのか確認してください。",
  source_missing: "元セルや数式の保存済み結果がないため、この範囲を保留するか元ファイルを確認してください。",
  source_error: "元セルのエラーを確認してください。正しい値が分からない範囲は保留できます。",
  unclaimed_structure: "読み分けられなかった表の範囲を確認してください。",
  unproven_coverage: "全体と内訳が同じ売上なのか、別の売上なのか確認してください。",
  label_conflict: "全体と内訳で異なる見出しが同じ項目を指すか確認してください。",
  layout_confirmation: "読み取った対象範囲・日付・金額を確認してください。",
  missing_field: "取り込みに必要な項目の意味・値を確認してください。",
  classification: "この表をどの保存先へ取り込むか確認してください。",
  legacy_review: "以前の解析で残った確認事項です。画面の内容を確認してください。"
} as const;
type Code = keyof typeof codes;
const fields = new Set(["date", "time", "amount", "quantity", "vendor_name", "item_name", "name", "phone", "unit_price", "tax_amount", "subtotal_amount", "birth_date", "last_visit_date", "visit_count", "cost_price", "tax_rate", "reorder_point"]);
const kinds = new Set(["sale", "expense", "customer", "item", "inventory", "unknown", "ignore"]);
const states = new Set(["analyzing", "questions_required", "review_required", "review_ready", "importing", "completed", "partial_failed", "failed"]);
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function count(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function field(value: unknown) { return typeof value === "string" && fields.has(value) ? value : undefined; }
function cell(value: unknown) { return typeof value === "string" && /^[A-Z]{1,3}[1-9]\d{0,6}(?::[A-Z]{1,3}[1-9]\d{0,6})?$/u.test(value) ? value : undefined; }
function period(value: unknown) {
  const source = object(value), year = source.year, month = source.month;
  return { year: typeof year === "number" && Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null,
    month: typeof month === "number" && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null };
}
function evidence(value: unknown, tableIndex: number) {
  const issue = object(value), source = object(issue.source), details = object(issue.details);
  const numbers: Record<string, number> = {};
  for (const key of ["expected", "actual", "delta", "year", "month", "day"]) {
    const number = details[key];
    if (typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER) numbers[key] = number;
  }
  // Never copy source text, a filename, a sheet/customer/vendor name, raw cells,
  // a proposal answer, or free-form issue messages into an external AI prompt.
  return { tableIndex, range: cell(source.range), cells: list(source.cells).map(cell).filter(Boolean).slice(0, 4), ...numbers };
}
type Group = { code: Code; prompt: string; severity: "clarifiable" | "unprocessable"; field?: string; count: number; tableIndexes: number[]; evidence: ReturnType<typeof evidence>[] };

/** A strict allowlist projection. Input metadata is untrusted source data. */
export function importDetailSection(job: ImportContextJob, rows: ImportContextRow[]): AiSection {
  if (!Number.isSafeInteger(job.total_rows) || job.total_rows < 0 || rows.length !== job.total_rows) throw new Error("incomplete_import_context");
  const sheets = list(job.sheet_summaries).map(object);
  const state = object(job.clarification_state);
  const held = new Set([...list(state.heldTables), ...list(job.held_sheets)].filter((value): value is string => typeof value === "string"));
  const remainingIds = Array.isArray(state.remainingIssueIds) ? new Set(state.remainingIssueIds) : null;
  const counters = { total: rows.length, ready: 0, approved: Math.min(count(job.approved_rows), rows.length), held: 0, ignored: 0, imported: 0, failed: 0, questions: 0 };
  const tableCounts = new Map<string, typeof counters>();
  for (const row of rows) {
    const category = row.review_status === "imported" ? "imported" : held.has(row.sheet_name) ? "held"
      : row.review_status === "ignored" || row.confirmed_record_type === "ignore" ? "ignored"
        : row.review_status === "ready" || row.review_status === "approved" ? "ready"
          : row.review_status === "error" ? "failed" : "questions";
    counters[category] += 1;
    const current = tableCounts.get(row.sheet_name) ?? { total: 0, ready: 0, approved: 0, held: 0, ignored: 0, imported: 0, failed: 0, questions: 0 };
    current.total += 1; current[category] += 1; tableCounts.set(row.sheet_name, current);
  }
  const groups = new Map<string, Group>();
  function add(code: Code, tableIndex: number, severity: Group["severity"] = "clarifiable", target?: string, source?: unknown) {
    const key = `${code}:${severity}:${target ?? ""}`;
    const entry = groups.get(key) ?? { code, prompt: codes[code], severity, field: target, count: 0, tableIndexes: [], evidence: [] };
    entry.count += 1;
    if (!entry.tableIndexes.includes(tableIndex) && entry.tableIndexes.length < tableLimit) entry.tableIndexes.push(tableIndex);
    if (source && entry.evidence.length < evidenceLimit) entry.evidence.push(evidence(source, tableIndex));
    groups.set(key, entry);
  }
  sheets.forEach((sheet, index) => {
    const tableIndex = index + 1, clarification = object(sheet.clarification);
    if (held.has(String(sheet.name)) || sheet.excludedReason || sheet.suggestedRecordType === "ignore") return;
    const typedIssues = list(clarification.issues).filter((entry) => !remainingIds || remainingIds.has(object(entry).id));
    for (const value of typedIssues) {
      const issue = object(value), code = typeof issue.code === "string" && Object.hasOwn(codes, issue.code) ? issue.code as Code : "legacy_review";
      add(code, tableIndex, issue.severity === "unprocessable" ? "unprocessable" : "clarifiable", field(issue.field), issue);
    }
    // Legacy text is not a trustworthy instruction and can contain cell text.
    // Do not forward it verbatim or use it to make an unsupported resolution.
    if (!typedIssues.length && list(sheet.blockingIssues).length) add("legacy_review", tableIndex, "unprocessable");
    for (const missing of list(sheet.missingRequiredFields)) add("missing_field", tableIndex, "clarifiable", field(missing));
    if (sheet.suggestedRecordType === "unknown") add("classification", tableIndex);
  });
  // Row/column questions are represented by fixed field labels, never prompts
  // containing imported names, contact information or embedded instructions.
  for (const value of list(job.questions)) {
    const question = object(value), index = sheets.findIndex((sheet) => sheet.name === question.sheetName);
    if (index < 0 || held.has(String(sheets[index].name)) || sheets[index].excludedReason || sheets[index].suggestedRecordType === "ignore") continue;
    const target = field(question.field);
    if (target && !groups.has(`missing_field:clarifiable:${target}`)) add("missing_field", index + 1, "clarifiable", target);
    if (!target && typeof question.key === "string" && question.key.endsWith("-confirm") && !groups.has("layout_confirmation:clarifiable:")) add("layout_confirmation", index + 1);
  }
  const visibleGroups = [...groups.values()].slice(0, groupLimit);
  const tables = sheets.slice(0, tableLimit).map((sheet, index) => ({
    tableIndex: index + 1,
    kind: typeof sheet.suggestedRecordType === "string" && kinds.has(sheet.suggestedRecordType) ? sheet.suggestedRecordType : "unknown",
    held: held.has(String(sheet.name)), excluded: Boolean(sheet.excludedReason),
    sourceRange: cell(sheet.sourceRange), period: period(object(sheet.clarification).period),
    counts: tableCounts.get(String(sheet.name)) ?? { total: 0, ready: 0, approved: 0, held: 0, ignored: 0, imported: 0, failed: 0, questions: 0 }
  }));
  return { key: "import_detail", label: "選択中の取込ファイル", state: "ready",
    summary: `選択中の取り込みは${sheets.length}表・${counters.total}行です。反映済み${counters.imported}行、保留${counters.held}行、未解決の確認${groups.size}種類があります。`,
    truncated: sheets.length > tableLimit || groups.size > groupLimit,
    data: { jobId: job.id, status: states.has(job.status) ? job.status : "unknown", updatedAt: /^\d{4}-\d{2}-\d{2}T[\d:.+Z-]+$/u.test(job.updated_at) ? job.updated_at : null,
      tableCount: sheets.length, counts: counters, tables, issueGroups: visibleGroups, unresolvedGroupCount: groups.size,
      acceptedResolutionCount: list(state.acceptedResolutionIds).length, hasPendingProposal: typeof job.clarification_pending_id === "string" && Boolean(job.clarification_pending_id),
      nextQuestion: visibleGroups[0] ?? null,
      scope: "現在の店舗・URLで選択した未削除ジョブのみ。表番号は画面順。元ファイル全文・名称・個人情報・自由記入欄は会話に含めていない。確認案の承認と本データへの取り込み確定は別操作。" }
  };
}
