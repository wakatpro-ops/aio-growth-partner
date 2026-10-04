import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getUnifiedImportJob } from "./data";
import { resolveImportClarification, selectActiveImportResolutions, type ImportClarificationResolution } from "./clarification";
import { UNIFIED_IMPORT_PARSER_VERSION } from "./version";
import { importReviewQuestions } from "./review-groups";
import { parseImportNumber } from "./value-validation";
import type { ParsedUnifiedImportRow, UnifiedImportJob, UnifiedImportRow, UnifiedImportSheetSummary } from "@/types/unified-import";

const base = { id: z.string().uuid(), tableName: z.string().min(1).max(500), issueIds: z.array(z.string().min(1).max(100)).min(1).max(100), reason: z.string().trim().min(2).max(2000) };
const resolutionSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("set_period"), scope: z.enum(["report", "expense"]), year: z.number().int().min(1900).max(9999), month: z.number().int().min(1).max(12) }).strict(),
  z.object({ ...base, action: z.literal("keep_expense_dates") }).strict(),
  z.object({ ...base, action: z.literal("correct_values"), corrections: z.array(z.object({ rowNumber: z.number().int().positive(), field: z.string().max(80), value: z.union([z.string().max(2000), z.number().finite()]) }).strict()).min(1).max(500) }).strict(),
  z.object({ ...base, action: z.literal("set_default"), field: z.literal("vendor_name"), value: z.string().trim().min(1).max(200) }).strict(),
  z.object({ ...base, action: z.literal("use_details"), observedTotals: z.record(z.number().finite()) }).strict(),
  z.object({ ...base, action: z.literal("use_gross"), observedGross: z.number().finite(), observedAdjusted: z.number().finite() }).strict(),
  z.object({ ...base, action: z.literal("sales_adjustment"), observedGross: z.number().finite(), observedAdjusted: z.number().finite(), date: z.string().max(30), signedAmount: z.number().finite(), itemName: z.string().trim().min(1).max(200) }).strict(),
  z.object({ ...base, action: z.literal("confirm_layout") }).strict()
]);
type SnapshotRow = UnifiedImportRow & { clarification_base_data?: ParsedUnifiedImportRow["normalizedData"] | null };
type ApprovedResolution = ImportClarificationResolution & { actorId: string; approvedAt: string };
type Pending = { id: string; resolutions: ImportClarificationResolution[]; createdBy: string; createdAt: string };
export type ClarificationPreview = { id: string; revision: string; changedRows: number; addedRows: number; removedRows: number; remaining: number; quality: string; totals: { tableName: string; before: number | null; after: number | null }[]; changes: { tableName: string; rowNumber: number; field: string; before: string; after: string }[] };

const nextRevision = (previous: string) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();
const ownTableValue = <T,>(values: Record<string, T>, name: string): T | undefined => Object.hasOwn(values, name) ? values[name] : undefined;

function startedTables(job: UnifiedImportJob, rows: UnifiedImportRow[]) {
  return new Set([...(job.answers.execution_started_tables as string[] ?? []), ...rows.filter((row) => row.result_id || ["imported", "error"].includes(row.review_status)).map((row) => row.sheet_name)]);
}

/** Replay immutable per-row baselines, not the last corrected values. */
export function calculateClarification(job: UnifiedImportJob, rows: SnapshotRow[], additions: ImportClarificationResolution[] = []) {
  const originals = (job.answers.clarification_original_sheets ?? {}) as Record<string, UnifiedImportSheetSummary>;
  const sheets = job.sheet_summaries.map((sheet) => ownTableValue(originals, sheet.name) ?? sheet);
  const parsed = rows.filter((row) => row.normalized_data.clarification_adjustment !== true).map((row): ParsedUnifiedImportRow => ({
    sheetName: row.sheet_name, rowNumber: row.row_number, rawData: row.raw_data,
    suggestedRecordType: row.confirmed_record_type ?? row.suggested_record_type, confidence: row.confidence,
    normalizedData: row.clarification_base_data ?? row.normalized_data, missingFields: row.missing_fields, question: row.question
  }));
  const history = [...(job.answers.clarification_resolutions as ApprovedResolution[] ?? []), ...additions];
  // A new answer to the same question supersedes the old decision without
  // deleting its audit entry. Other answers remain replayable from originals.
  const resolutions = selectActiveImportResolutions(history);
  const result = resolveImportClarification({ sheets, rows: parsed, resolutions, heldTables: job.answers.held_sheets as string[] ?? [] });
  const confirmations = job.answers.layout_confirmations as Record<string, boolean> ?? {};
  result.issues = result.issues.filter((issue) => issue.code !== "layout_confirmation" || ownTableValue(confirmations, issue.tableName) !== true);
  for (const sheet of result.sheets) if (ownTableValue(confirmations, sheet.name) === true && sheet.clarification) {
    sheet.clarification.issues = sheet.clarification.issues.filter((issue) => issue.code !== "layout_confirmation");
    sheet.requiresConfirmation = false;
    sheet.blockingIssues = sheet.clarification.issues.map((issue) => issue.message);
  }
  result.quality = result.qualityMetrics.hardThresholdTriggered || result.issues.some((issue) => issue.severity === "unprocessable") ? "unprocessable" : result.issues.length ? "clarifiable" : "normal";
  return result;
}

async function writableDetail(storeId: string, jobId: string, expectedRevision: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  const role = [access?.organizationRoles[store.organization_id], access?.storeRoles[store.id]].find((value) => ["org_owner", "store_manager"].includes(value ?? ""));
  if (!access || (!access.isPlatformAdmin && !["org_owner", "store_manager"].includes(role ?? ""))) throw new Error("金額・日付の確認と承認は、店舗管理者が行ってください。");
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail || detail.job.organization_id !== store.organization_id) throw new Error("解析結果が見つかりません。");
  if (!expectedRevision || detail.job.updated_at !== expectedRevision) throw new Error("別の操作で内容が変わりました。画面を更新して確認してください。");
  if (!["questions_required", "review_required", "review_ready"].includes(detail.job.status)) throw new Error("この状態では確認内容を変更できません。");
  if (detail.job.answers.parser_version !== UNIFIED_IMPORT_PARSER_VERSION) throw new Error("先に元ファイルを新しい方式で再解析してください。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("データベースに接続できません。");
  return { ...detail, store, access, supabase };
}

function validateAdditions(job: UnifiedImportJob, rows: UnifiedImportRow[], additions: ImportClarificationResolution[]) {
  const started = startedTables(job, rows);
  const previous = new Set((job.answers.clarification_resolutions as ApprovedResolution[] ?? []).map((answer) => answer.id));
  if (additions.some((answer) => started.has(answer.tableName))) throw new Error("取り込み開始済みの表は変更できません。保留中の表だけ回答できます。");
  if (additions.some((answer) => previous.has(answer.id)) || new Set(additions.map((answer) => answer.id)).size !== additions.length) throw new Error("重複した回答です。画面を更新してください。");
  const result = calculateClarification(job, rows, additions);
  const rejectedNew = result.rejectedResolutions.filter((answer) => additions.some((addition) => addition.id === answer.id));
  if (rejectedNew.length) throw new Error(rejectedNew.map((answer) => answer.message).join(" "));
  return result;
}

function proposalSummary(job: UnifiedImportJob, rows: UnifiedImportRow[], result: ReturnType<typeof calculateClarification>, id: string, revision: string): ClarificationPreview {
  const key = (sheet: string, row: number) => JSON.stringify([sheet, row]);
  const existing = new Map(rows.map((row) => [key(row.sheet_name, row.row_number), row]));
  let changedRows = 0, addedRows = 0;
  const changes: ClarificationPreview["changes"] = [];
  for (const row of result.rows) {
    const before = existing.get(key(row.sheetName, row.rowNumber));
    if (!before) addedRows++;
    else if (JSON.stringify(before.normalized_data) !== JSON.stringify(row.normalizedData)) changedRows++;
    for (const [field, value] of Object.entries(row.normalizedData)) if (before?.normalized_data[field] !== value && changes.length < 30) changes.push({ tableName: row.sheetName, rowNumber: row.rowNumber, field, before: String(before?.normalized_data[field] ?? "未入力"), after: String(value ?? "") });
  }
  const totals = job.sheet_summaries.filter((sheet) => ["sale", "expense"].includes(sheet.suggestedRecordType)).map((sheet) => ({ tableName: sheet.name,
    before: rows.filter((row) => row.sheet_name === sheet.name).reduce<number | null>((sum, row) => { const value = parseImportNumber(row.normalized_data.amount); return sum === null || value === null ? null : sum + value; }, 0),
    after: result.rows.filter((row) => row.sheetName === sheet.name).reduce<number | null>((sum, row) => { const value = parseImportNumber(row.normalizedData.amount); return sum === null || value === null ? null : sum + value; }, 0)
  })).filter((entry) => entry.before !== entry.after);
  const removedRows = rows.filter((row) => row.normalized_data.clarification_adjustment === true && !result.rows.some((after) => after.normalizedData.source_resolution_id === row.normalized_data.source_resolution_id)).length;
  return { id, revision, changedRows, addedRows, removedRows, remaining: importReviewQuestions(result.issues).length, quality: result.quality, totals, changes };
}

export async function previewUnifiedImportClarification(storeId: string, jobId: string, formData: FormData) {
  const { job, rows, access, supabase } = await writableDetail(storeId, jobId, String(formData.get("expected_revision") ?? ""));
  const input = String(formData.get("resolutions") ?? "");
  if (input.length > 100000) throw new Error("回答が多すぎます。表ごとに分けて確認してください。");
  let additions: ImportClarificationResolution[];
  try { additions = z.array(resolutionSchema).min(1).max(100).parse(JSON.parse(input)); }
  catch { throw new Error("回答の形式を確認してください。必要な項目と理由を入力してください。"); }
  const result = validateAdditions(job, rows, additions);
  const revision = nextRevision(job.updated_at);
  const pending: Pending = { id: randomUUID(), resolutions: additions, createdBy: access.userId, createdAt: revision };
  const { data, error } = await supabase.from("unified_import_jobs").update({ answers: { ...job.answers, clarification_pending: pending }, updated_at: revision }).eq("id", job.id).eq("store_id", storeId).eq("updated_at", job.updated_at).eq("status", job.status).is("archived_at", null).select("id, updated_at").maybeSingle();
  if (error || !data) throw new Error("修正案を保存できませんでした。画面を更新してください。");
  return proposalSummary(job, rows, result, pending.id, data.updated_at);
}

export async function applyUnifiedImportClarification(storeId: string, jobId: string, formData: FormData) {
  const { job, rows, store, access, supabase } = await writableDetail(storeId, jobId, String(formData.get("expected_revision") ?? ""));
  const pending = job.answers.clarification_pending as Pending | undefined;
  if (formData.get("approved") !== "on" || !pending || pending.id !== formData.get("proposal_id") || pending.createdBy !== access.userId) throw new Error("ご自身が確認した最新の修正案を承認してください。");
  const additions = z.array(resolutionSchema).min(1).max(100).parse(pending.resolutions);
  const result = validateAdditions(job, rows, additions);
  const revision = nextRevision(job.updated_at);
  const activeTables = new Set(additions.map((answer) => answer.tableName));
  const originalSheets: Record<string, UnifiedImportSheetSummary> = Object.assign(Object.create(null), job.answers.clarification_original_sheets ?? {});
  for (const sheet of job.sheet_summaries) if (activeTables.has(sheet.name) && !Object.hasOwn(originalSheets, sheet.name)) originalSheets[sheet.name] = sheet;
  const existing = new Map(rows.map((row) => [JSON.stringify([row.sheet_name, row.row_number]), row]));
  const updates = result.rows.filter((row) => activeTables.has(row.sheetName)).map((row) => {
    const old = row.normalizedData.clarification_adjustment === true
      ? rows.find((candidate) => candidate.sheet_name === row.sheetName && candidate.normalized_data.source_resolution_id === row.normalizedData.source_resolution_id)
      : existing.get(JSON.stringify([row.sheetName, row.rowNumber]));
    return { id: old?.id ?? randomUUID(), sheet_name: row.sheetName, row_number: row.rowNumber, raw_data: row.rawData,
      normalized_data: row.normalizedData, suggested_record_type: row.suggestedRecordType, confidence: row.confidence,
      missing_fields: row.missingFields, question: row.question, review_status: row.suggestedRecordType === "ignore" ? "ignored" : row.question ? "question" : "ready", confirmed_record_type: row.suggestedRecordType };
  });
  const answers = { ...job.answers, clarification_pending: null, clarification_original_sheets: originalSheets,
    clarification_resolutions: [...(job.answers.clarification_resolutions as ApprovedResolution[] ?? []), ...additions.map((answer) => ({ ...answer, actorId: access.userId, approvedAt: revision }))],
    clarification_state: { remainingIssueIds: result.issues.map((issue) => issue.id), heldTables: result.heldTables, acceptedResolutionIds: result.acceptedResolutionIds, quality: result.quality },
    layout_confirmations: { ...(job.answers.layout_confirmations as Record<string, boolean> ?? {}), ...Object.fromEntries(result.sheets.filter((sheet) => activeTables.has(sheet.name)).map((sheet) => [sheet.name, !sheet.requiresConfirmation])) }
  };
  // One transaction: source snapshots, normalized proposals, durable approval history
  // and the job revision must commit together, or none of them may change.
  const { error } = await supabase.rpc("apply_unified_import_clarification", { p_job_id: job.id, p_store_id: store.id, p_organization_id: store.organization_id, p_expected_revision: job.updated_at, p_revision: revision, p_rows: updates, p_answers: answers, p_sheets: result.sheets, p_questions: importReviewQuestions(result.issues) });
  if (error) throw new Error("修正案を反映できませんでした。元データは変更せず停止しました。画面を更新して再確認してください。");
  return { remaining: importReviewQuestions(result.issues).length };
}
