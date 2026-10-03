import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { normalizeImportBusinessDate, parseImportDateIso } from "@/lib/import-date";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { rebuildSalesSummaries } from "@/lib/phase4/sales-import-data";
import { getStore } from "@/lib/stores";
import { buildImportStorageFileName } from "@/lib/storage-object-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { classifyUnifiedImportRow, normalizeUnifiedRow, parseUnifiedImportFile, suggestUnifiedImportMapping, unifiedImportFields } from "@/lib/unified-import/parser";
import { groupUnifiedSaleRows, unifiedSaleGroupKey } from "@/lib/unified-import/sales-groups";
import { parseImportNumber, validateUnifiedImportValues } from "@/lib/unified-import/value-validation";
import { UNIFIED_IMPORT_PARSER_VERSION } from "@/lib/unified-import/version";
import { resolveImportClarification, selectActiveImportResolutions, type ImportClarificationResolution } from "@/lib/unified-import/clarification";
import type { Store } from "@/types/domain";
import type { UnifiedImportJob, UnifiedImportQuestion, UnifiedImportRecordType, UnifiedImportRow } from "@/types/unified-import";

const storageBucket = "import-files";
const editableRoles = new Set(["org_owner", "store_manager"]);
const allowedRecordTypes = new Set<UnifiedImportRecordType>(["sale", "expense", "customer", "item", "inventory", "unknown", "ignore"]);
const requiredLabels: Record<string, string> = {
  date: "日付",
  item_name: "商品・メニュー名",
  amount: "金額",
  vendor_name: "支払先",
  name: "名前",
  phone: "電話番号",
  quantity: "数量"
};

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const ownTableValue = <T,>(values: Record<string, T>, name: string): T | undefined => Object.hasOwn(values, name) ? values[name] : undefined;

function hash(value: string | ArrayBuffer | Buffer) {
  return createHash("sha256").update(value instanceof ArrayBuffer ? Buffer.from(value) : value).digest("hex");
}

function valueText(value: unknown, maxLength = 2000) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = parseImportNumber(value, { blankValue: fallback });
  if (parsed === null) throw new Error("金額・数量に数値として読み取れない値があります。確認画面で修正してください。");
  return parsed;
}

function booleanValue(value: unknown, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "対象", "する", "あり", "有"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "対象外", "しない", "なし", "無"].includes(normalized)) return false;
  return fallback;
}

function dateValue(value: unknown) {
  return parseImportDateIso(value);
}

function saleDateValue(data: Record<string, unknown>) {
  const date = valueText(data.date, 100);
  const time = valueText(data.time, 100);
  if (!date) return null;
  return parseImportDateIso(date, time) ?? dateValue(date);
}

function phoneValue(value: unknown) {
  return String(value ?? "").replace(/[^\d+]/gu, "");
}

async function context(storeId: string, write = false) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access) throw new Error("ログインが必要です。");
  const roles = [access.organizationRoles[store.organization_id], access.storeRoles[store.id]];
  if (!access.isPlatformAdmin && !roles.some((role) => editableRoles.has(role ?? ""))) throw new Error(write ? "データを取り込む権限がありません。店舗管理者に確認してください。" : "取込元データを閲覧する権限がありません。店舗管理者に確認してください。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

function questionList(
  rows: Array<{ sheetName: string; rowNumber: number; suggestedRecordType: UnifiedImportRecordType; missingFields: string[]; question: string | null }>,
  sheets: Array<{ name: string; suggestedRecordType?: UnifiedImportRecordType; missingRequiredFields?: string[]; blockingIssues?: string[]; requiresConfirmation?: boolean }>
) {
  const structureQuestions = sheets.filter((sheet) => sheet.suggestedRecordType !== "ignore").flatMap((sheet): UnifiedImportQuestion[] => {
    if (sheet.blockingIssues?.length) return [{ key: `sheet-${sheet.name}-structure`, sheetName: sheet.name, prompt: `${sheet.name}: ${sheet.blockingIssues.join(" / ")} 元ファイルを修正して再解析するか、この表を取り込み対象から外してください。` }];
    return sheet.requiresConfirmation ? [{ key: `sheet-${sheet.name}-confirm`, sheetName: sheet.name, prompt: `${sheet.name}の対象範囲・日付・合計を確認してください。` }] : [];
  });
  const sheetTypeQuestions = sheets.filter((sheet) => sheet.suggestedRecordType === "unknown").map((sheet): UnifiedImportQuestion => ({
    key: `sheet-${sheet.name}-type`,
    sheetName: sheet.name,
    prompt: `${sheet.name}を売上・経費・顧客・商品・在庫のどれとして取り込むか一度だけ選んでください。`,
    options: ["sale", "expense", "customer", "item", "inventory", "ignore"]
  }));
  const columnQuestions = sheets.flatMap((sheet) => (sheet.missingRequiredFields ?? []).map((field): UnifiedImportQuestion => ({
    key: `sheet-${sheet.name}-${field}`,
    sheetName: sheet.name,
    field,
    prompt: `${sheet.name}で「${requiredLabels[field] ?? field}」に当たる列を一度だけ選んでください。`
  })));
  const blockedSheets = new Set(sheets.filter((sheet) => sheet.blockingIssues?.length).map((sheet) => sheet.name));
  const rowQuestions = rows.filter((row) => row.question && !blockedSheets.has(row.sheetName)).map((row, index): UnifiedImportQuestion => ({
    key: `row-${index + 1}`,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    prompt: row.question ?? "内容を確認してください。",
    field: row.missingFields[0] ?? null,
    options: row.suggestedRecordType === "unknown" ? ["sale", "expense", "customer", "item", "inventory", "ignore"] : undefined
  }));
  return [...structureQuestions, ...sheetTypeQuestions, ...columnQuestions, ...rowQuestions].slice(0, 200);
}

function rowReviewStatus(row: { question: string | null }) {
  return row.question ? "question" : "ready";
}

function headerSignature(headers: string[]) {
  return headers.map((header) => header.trim().toLowerCase().normalize("NFKC")).join("\u001f");
}

async function reuseStoreMappings(supabase: SupabaseClient, storeId: string, parsed: Awaited<ReturnType<typeof parseUnifiedImportFile>>) {
  const { data: recentJobs } = await supabase
    .from("unified_import_jobs")
    .select("id, sheet_summaries, answers")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .in("status", ["review_ready", "completed", "partial_failed"])
    .order("updated_at", { ascending: false })
    .limit(20);
  const reusedSheets: string[] = [];
  const reusedFrom: Record<string, string> = {};
  const sheetTypes: Record<string, UnifiedImportRecordType> = {};
  const columnMappings: Record<string, Record<string, string>> = {};

  for (const sheet of parsed.sheets) {
    // Layout extraction already has a source-specific mapping. A past flat
    // mapping must never override it, nor resolve ambiguous columns silently.
    if (sheet.layout === "matrix" || sheet.excludedReason || sheet.ambiguousColumns?.length || sheet.blockingIssues?.length) continue;
    const signature = headerSignature(sheet.headers);
    let match: { jobId: string; sourceName: string; type: UnifiedImportRecordType; mapping: Record<string, string> } | null = null;
    for (const candidate of recentJobs ?? []) {
      if ((candidate.answers as Record<string, unknown> | null)?.parser_version !== UNIFIED_IMPORT_PARSER_VERSION) continue;
      const summaries = (candidate.sheet_summaries ?? []) as UnifiedImportJob["sheet_summaries"];
      const source = summaries.find((entry) => headerSignature(entry.headers) === signature);
      if (!source) continue;
      const answers = (candidate.answers ?? {}) as Record<string, unknown>;
      const types = (answers.sheet_types ?? {}) as Record<string, UnifiedImportRecordType>;
      const mappings = (answers.column_mappings ?? {}) as Record<string, Record<string, string>>;
      const type = types[source.name] ?? source.suggestedRecordType;
      const mapping = mappings[source.name] ?? source.suggestedMapping ?? {};
      if (["unknown", "ignore"].includes(type) || Object.keys(mapping).length === 0) continue;
      match = { jobId: String(candidate.id), sourceName: source.name, type, mapping };
      break;
    }
    if (!match) continue;
    const validMapping = Object.fromEntries(Object.entries(match.mapping).filter(([, header]) => sheet.headers.includes(header)));
    const missingRequiredFields = unifiedImportFields(match.type).filter((field) => field.required && !validMapping[field.key]).map((field) => field.key);
    sheet.suggestedRecordType = match.type;
    sheet.suggestedMapping = validMapping;
    sheet.missingRequiredFields = missingRequiredFields;
    sheetTypes[sheet.name] = match.type;
    columnMappings[sheet.name] = validMapping;
    reusedSheets.push(sheet.name);
    reusedFrom[sheet.name] = match.jobId;
    for (const row of parsed.rows.filter((entry) => entry.sheetName === sheet.name)) {
      const classified = classifyUnifiedImportRow(row.rawData, match.type, Math.max(sheet.confidence, 0.95), validMapping);
      Object.assign(row, classified);
    }
  }
  return { reusedSheets, reusedFrom, sheetTypes, columnMappings };
}

export async function uploadUnifiedImportFile(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("CSV、Excel、PDFファイルを選択してください。");
  const buffer = await file.arrayBuffer();
  const fileSha256 = hash(buffer);
  const { data: duplicate } = await supabase.from("unified_import_jobs").select("id").eq("store_id", store.id).eq("file_sha256", fileSha256).is("archived_at", null).maybeSingle();
  if (duplicate?.id) return { jobId: String(duplicate.id), duplicate: true };

  const parsed = await parseUnifiedImportFile(file.name, buffer);
  const reused = await reuseStoreMappings(supabase, store.id, parsed);
  const jobId = randomUUID();
  const safeName = buildImportStorageFileName(file.name, fileSha256);
  const storagePath = `organizations/${store.organization_id}/stores/${store.id}/unified-imports/${jobId}/${safeName}`;
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw new Error(`元ファイルを保存できませんでした: ${uploadError.message}`);

  const questions = questionList(parsed.rows, parsed.sheets);
  const status = questions.length > 0 ? "questions_required" : "review_required";
  const { error: jobError } = await supabase.from("unified_import_jobs").insert({
    id: jobId,
    organization_id: store.organization_id,
    store_id: store.id,
    original_filename: file.name,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    file_sha256: fileSha256,
    file_type: parsed.fileType,
    mime_type: file.type || null,
    file_size: file.size,
    macro_enabled: parsed.macroEnabled,
    status,
    sheet_summaries: parsed.sheets,
    questions,
    answers: {
      parser_version: UNIFIED_IMPORT_PARSER_VERSION,
      parsing_notices: parsed.notices ?? [],
      sheet_types: reused.sheetTypes,
      column_mappings: reused.columnMappings,
      mapping_reused_sheets: reused.reusedSheets,
      mapping_reused_from: reused.reusedFrom
    },
    total_rows: parsed.rows.length,
    created_by: access.userId
  });
  if (jobError) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    throw new Error(`解析結果を保存できませんでした: ${jobError.message}`);
  }

  try {
    for (let index = 0; index < parsed.rows.length; index += 500) {
      const batch = parsed.rows.slice(index, index + 500).map((row) => ({
        import_job_id: jobId,
        organization_id: store.organization_id,
        store_id: store.id,
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        raw_data: row.rawData,
        suggested_record_type: row.suggestedRecordType,
        confidence: row.confidence,
        normalized_data: row.normalizedData,
        missing_fields: row.missingFields,
        question: row.question,
        review_status: rowReviewStatus(row),
        confirmed_record_type: row.question ? null : row.suggestedRecordType
      }));
      const { error } = await supabase.from("unified_import_rows").insert(batch);
      if (error) throw error;
    }
  } catch (error) {
    await supabase.from("unified_import_jobs").delete().eq("id", jobId);
    await supabase.storage.from(storageBucket).remove([storagePath]);
    throw new Error(`行データを保存できませんでした: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  await logAuditEvent({ storeId: store.id, actionType: "unified_import_uploaded", targetType: "unified_import", targetId: jobId, message: `${file.name}を解析し、${parsed.rows.length}行の振り分け候補を作成しました。`, metadata: { sheets: parsed.sheets.length, macro_enabled: parsed.macroEnabled, questions: questions.length, reused_mapping_sheets: reused.reusedSheets.length } });
  return { jobId, duplicate: false };
}

export async function listUnifiedImportJobs(storeId: string): Promise<UnifiedImportJob[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("unified_import_jobs").select("*").eq("store_id", store.id).is("archived_at", null).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`AIデータ取込履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as UnifiedImportJob[];
}

export async function reanalyzeUnifiedImport(storeId: string, jobId: string) {
  const { store, access, supabase } = await context(storeId, true);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) throw new Error("再解析するファイルが見つかりません。");
  const { job, rows } = detail;
  if (!["questions_required", "review_required", "review_ready"].includes(job.status) || job.success_rows > 0 || rows.some((row) => row.result_id || row.review_status === "imported" || row.review_status === "error")) {
    throw new Error("取り込み開始済みのファイルは二重登録を防ぐため再解析できません。");
  }
  const { data: original, error: downloadError } = await supabase.storage.from(job.storage_bucket).download(job.storage_path);
  if (downloadError || !original) throw new Error("保存済みの元ファイルを取得できませんでした。元の解析結果は保持しています。");
  const bytes = await original.arrayBuffer();
  if (hash(bytes) !== job.file_sha256) throw new Error("元ファイルの照合に失敗しました。データは変更していません。");
  // Validate before moving the previous review out of the active history.
  await parseUnifiedImportFile(job.original_filename, bytes);
  const archivedAt = new Date().toISOString();
  const { data: locked, error: lockError } = await supabase.from("unified_import_jobs").update({ archived_at: archivedAt, archived_by: access.userId, updated_at: archivedAt }).eq("store_id", store.id).eq("id", job.id).eq("status", job.status).eq("updated_at", job.updated_at).is("archived_at", null).select("id").maybeSingle();
  if (lockError || !locked) throw new Error("別の操作で状態が変わりました。再読み込みしてください。");
  try {
    const form = new FormData();
    form.set("file", new File([bytes], job.original_filename, { type: job.mime_type ?? "application/octet-stream" }));
    const result = await uploadUnifiedImportFile(store.id, form);
    await logAuditEvent({ storeId: store.id, actionType: "unified_import_reanalyzed", targetType: "unified_import", targetId: result.jobId, message: "保存済みファイルを再解析しました。以前の結果と元ファイルは削除済み履歴に保持しています。", metadata: { previous_job_id: job.id, parser_version: UNIFIED_IMPORT_PARSER_VERSION } });
    return result;
  } catch (error) {
    // Never delete evidence. If a replacement was committed before a later
    // audit failure, use it; otherwise put the previous review back.
    const { data: replacement } = await supabase.from("unified_import_jobs").select("id").eq("store_id", store.id).eq("file_sha256", job.file_sha256).is("archived_at", null).maybeSingle();
    if (replacement?.id) return { jobId: String(replacement.id), duplicate: false };
    const { error: restoreError } = await supabase.from("unified_import_jobs").update({ archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("store_id", store.id).eq("id", job.id).eq("archived_at", archivedAt);
    if (restoreError) throw new Error("再解析に失敗しました。元ファイルと以前の結果は削除済み履歴に保存されています。運営へご連絡ください。");
    throw error;
  }
}

export async function getUnifiedImportJob(storeId: string, jobId: string) {
  const { store, supabase } = await context(storeId);
  const { data: job, error: jobError } = await supabase.from("unified_import_jobs").select("*").eq("store_id", store.id).eq("id", jobId).is("archived_at", null).maybeSingle();
  if (jobError) throw new Error(`AIデータ取込を取得できませんでした: ${jobError.message}`);
  if (!job) return null;
  // PostgREST defaults to 1,000 rows. Reviews and execution must use the entire
  // job, never mark a truncated subset as completed.
  const rows: UnifiedImportRow[] = [];
  for (let offset = 0; offset < Number(job.total_rows); offset += 500) {
    const { data, error } = await supabase.from("unified_import_rows").select("*").eq("store_id", store.id).eq("import_job_id", jobId).order("sheet_name").order("row_number").order("id").range(offset, offset + 499);
    if (error) throw new Error(`行データを取得できませんでした: ${error.message}`);
    rows.push(...(data ?? []) as UnifiedImportRow[]);
  }
  if (rows.length !== Number(job.total_rows)) throw new Error("解析した行をすべて取得できませんでした。データは変更せず処理を停止しました。再読み込みしてください。");
  return { job: job as UnifiedImportJob, rows };
}

function selectedType(value: FormDataEntryValue | null, fallback: UnifiedImportRecordType) {
  const result = String(value ?? fallback) as UnifiedImportRecordType;
  return allowedRecordTypes.has(result) ? result : fallback;
}

function nextImportRevision(previous: string) {
  return new Date(Math.max(Date.now(), (Date.parse(previous) || 0) + 1)).toISOString();
}

function requireImportRevision(expected: unknown, actual: string) {
  if (typeof expected !== "string" || expected !== actual) throw new Error("別の操作で内容が変わりました。再読み込みして最新の内容を確認してください。");
}

function importedRow(row: UnifiedImportRow) {
  return row.review_status === "imported" || Boolean(row.result_id);
}

function currentImportQuality(job: UnifiedImportJob, sheets: UnifiedImportJob["sheet_summaries"], rows: UnifiedImportRow[], held: Set<string>, confirmations: Record<string, boolean>) {
  const originals = (job.answers.clarification_original_sheets ?? {}) as Record<string, UnifiedImportJob["sheet_summaries"][number]>;
  const ignored = sheets.filter((sheet) => sheet.excludedReason || sheet.suggestedRecordType === "ignore").map((sheet) => sheet.name);
  const history = (job.answers.clarification_resolutions ?? []) as ImportClarificationResolution[];
  const resolutions = selectActiveImportResolutions(history);
  const result = resolveImportClarification({
    sheets: sheets.map((sheet) => ownTableValue(originals, sheet.name) ?? sheet),
    rows: rows.filter((row) => row.normalized_data.clarification_adjustment !== true).map((row) => ({
      sheetName: row.sheet_name, rowNumber: row.row_number, rawData: row.raw_data,
      suggestedRecordType: row.confirmed_record_type ?? row.suggested_record_type, confidence: row.confidence,
      normalizedData: (row as UnifiedImportRow & { clarification_base_data?: UnifiedImportRow["normalized_data"] | null }).clarification_base_data ?? row.normalized_data,
      missingFields: row.missing_fields, question: row.question
    })),
    resolutions,
    heldTables: [...new Set([...held, ...ignored])]
  });
  const issues = result.issues.filter((issue) => issue.code !== "layout_confirmation" || ownTableValue(confirmations, issue.tableName) !== true);
  return {
    ...result, issues, heldTables: [...held],
    rejectedResolutions: result.rejectedResolutions.filter((rejected) => !held.has(resolutions.find((answer) => answer.id === rejected.id)?.tableName ?? "")),
    quality: result.qualityMetrics.hardThresholdTriggered || issues.some((issue) => issue.severity === "unprocessable") ? "unprocessable" : issues.length ? "clarifiable" : "normal"
  };
}

export async function saveUnifiedImportReview(storeId: string, jobId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) throw new Error("AIデータ取込が見つかりません。");
  requireImportRevision(formData.get("expected_revision"), detail.job.updated_at);
  if (!["questions_required", "review_required", "review_ready", "partial_failed", "failed"].includes(detail.job.status)) throw new Error("取り込み中または完了済みのため、分析結果を変更できません。");
  if (detail.job.answers.parser_version !== UNIFIED_IMPORT_PARSER_VERSION) throw new Error("以前の解析方式の結果です。先に「元ファイルを再解析」を実行してください。");

  const priorHeld = new Set((detail.job.answers.held_sheets ?? []) as string[]);
  const startedTables = new Set([
    ...((detail.job.answers.execution_started_tables ?? []) as string[]),
    ...detail.rows.filter((row) => importedRow(row) || row.review_status === "error").map((row) => row.sheet_name)
  ]);
  const resolvedTables = new Set(((detail.job.answers.clarification_resolutions ?? []) as Array<{ tableName: string }>).map((resolution) => resolution.tableName));
  const lockedTables = new Set([...startedTables, ...resolvedTables]);
  const heldSheets = new Set(detail.job.sheet_summaries.filter((sheet, index) => !sheet.excludedReason && formData.get(`sheet_hold_${index}`) === "on").map((sheet) => sheet.name));
  for (const name of startedTables) {
    if (heldSheets.has(name) !== priorHeld.has(name)) throw new Error(`${name}: 反映を開始した表は保留へ変更できません。失敗した行は元の内容で再実行してください。`);
  }
  const storedSheetTypes = (detail.job.answers.sheet_types ?? {}) as Record<string, UnifiedImportRecordType>;
  const sheetKinds = new Map(detail.job.sheet_summaries.map((sheet, index) => {
    const previous = ownTableValue(storedSheetTypes, sheet.name) ?? sheet.suggestedRecordType;
    const next = sheet.excludedReason ? "ignore" as const : selectedType(formData.get(`sheet_type_${index}`), previous);
    if (lockedTables.has(sheet.name) && next !== previous) throw new Error(`${sheet.name}: 承認済み・反映開始済みの表の分類は変更できません。`);
    return [sheet.name, next];
  }));
  const previousSheetKinds = new Map(detail.job.sheet_summaries.map((sheet) => [sheet.name, ownTableValue(storedSheetTypes, sheet.name) ?? sheet.suggestedRecordType]));
  const previousMappings = (detail.job.answers.column_mappings ?? {}) as Record<string, Record<string, string>>;
  const sheetMappings = new Map<string, Record<string, string>>();
  let updatedSummaries = detail.job.sheet_summaries.map((sheet, index) => {
    const kind = sheetKinds.get(sheet.name) ?? sheet.suggestedRecordType;
    const inferred = suggestUnifiedImportMapping(sheet.headers, kind);
    const mapping: Record<string, string> = {};
    for (const field of unifiedImportFields(kind)) {
      const formKey = `sheet_mapping_${index}_${field.key}`;
      const previous = ownTableValue(previousMappings, sheet.name)?.[field.key] ?? sheet.suggestedMapping?.[field.key] ?? inferred[field.key] ?? "";
      const selected = formData.has(formKey)
        ? String(formData.get(formKey) ?? "")
        : previous;
      if (lockedTables.has(sheet.name) && selected !== previous) throw new Error(`${sheet.name}: 承認済み・反映開始済みの表の列対応は変更できません。`);
      if (selected && sheet.headers.includes(selected)) mapping[field.key] = selected;
    }
    sheetMappings.set(sheet.name, mapping);
    const missingRequiredFields = unifiedImportFields(kind).filter((field) => field.required && (lockedTables.has(sheet.name)
      ? detail.rows.some((row) => row.sheet_name === sheet.name && !valueText(row.normalized_data[field.key]))
      : !mapping[field.key])).map((field) => field.key);
    return { ...sheet, suggestedRecordType: kind, suggestedMapping: mapping, missingRequiredFields };
  });
  const previousConfirmations = (detail.job.answers.layout_confirmations ?? {}) as Record<string, boolean>;
  const layoutConfirmations = Object.fromEntries(updatedSummaries.map((sheet, index) => [sheet.name, lockedTables.has(sheet.name) ? ownTableValue(previousConfirmations, sheet.name) === true : formData.get(`sheet_confirm_${index}`) === "on"]));
  const rowUpdates: Array<UnifiedImportRow & { updated_at: string }> = [];
  for (const row of detail.rows) {
    const fallback = sheetKinds.get(row.sheet_name) ?? row.suggested_record_type;
    const sheetMapping = sheetMappings.get(row.sheet_name);
    const rowTypeKey = `row_type_${row.id}`;
    if (lockedTables.has(row.sheet_name) || importedRow(row)) {
      if (formData.has(rowTypeKey) && selectedType(formData.get(rowTypeKey), row.confirmed_record_type ?? fallback) !== (row.confirmed_record_type ?? fallback)) {
        throw new Error(`${row.sheet_name}: 承認済み・反映開始済みの行は変更できません。`);
      }
      for (const [key, value] of formData.entries()) {
        if (!key.startsWith(`row_${row.id}_`)) continue;
        const field = key.slice(`row_${row.id}_`.length);
        if (String(value).trim() !== String(row.user_corrections[field] ?? row.normalized_data[field] ?? "").trim()) {
          throw new Error(`${row.sheet_name}: 承認済み・反映開始済みの値は変更できません。未反映の表は新しい説明を作成してください。`);
        }
      }
      continue;
    }
    if (heldSheets.has(row.sheet_name)) continue;
    // A held table's classification may have changed while its rows remained
    // untouched. Apply that saved classification when it is resumed.
    const sheetTypeChanged = fallback !== previousSheetKinds.get(row.sheet_name) || priorHeld.has(row.sheet_name);
    // Excluding an entire table takes precedence over stale row selectors in
    // the same submitted form; a row cannot opt back into a blocked table.
    const kind = fallback === "ignore" ? "ignore" : formData.has(rowTypeKey)
      ? selectedType(formData.get(rowTypeKey), row.confirmed_record_type ?? fallback)
      : sheetTypeChanged || row.confirmed_record_type === "unknown"
        ? fallback
        : row.confirmed_record_type ?? fallback;
    if (kind === "ignore") {
      rowUpdates.push({ ...row, confirmed_record_type: "ignore", review_status: "ignored", question: null, missing_fields: [], updated_at: new Date().toISOString() });
      continue;
    }
    const mapping = kind === fallback ? sheetMapping : suggestUnifiedImportMapping(Object.keys(row.raw_data), kind);
    const normalized = normalizeUnifiedRow(row.raw_data, kind, mapping);
    const corrections: Record<string, string> = Object.fromEntries(
      Object.entries(row.user_corrections).map(([field, value]) => [field, String(value ?? "")])
    );
    const editableFields = new Set([...normalized.missingFields, ...row.missing_fields, ...validateUnifiedImportValues(kind, normalized.normalizedData).map((issue) => issue.field)]);
    for (const field of editableFields) {
      const answerKey = `row_${row.id}_${field}`;
      if (!formData.has(answerKey)) continue;
      const answer = valueText(formData.get(answerKey));
      if (answer) corrections[field] = answer;
      else delete corrections[field];
    }
    const normalizedData = { ...normalized.normalizedData, ...corrections };
    const valueIssues = validateUnifiedImportValues(kind, normalizedData);
    const missingFields = [...new Set([...normalized.missingFields.filter((field) => !valueText(normalizedData[field])), ...valueIssues.map((issue) => issue.field)])];
    const missingColumnFields = new Set(unifiedImportFields(kind).filter((field) => field.required && !mapping?.[field.key]).map((field) => field.key));
    const missingRowFields = missingFields.filter((field) => !missingColumnFields.has(field));
    const rowValueIssues = valueIssues.filter((issue) => !missingColumnFields.has(issue.field));
    const question = rowValueIssues.length > 0 ? rowValueIssues.map((issue) => issue.message).join(" ") : kind !== "unknown" && missingRowFields.length > 0
        ? `${missingRowFields.map((field) => requiredLabels[field] ?? field).join("・")}を入力してください。`
        : null;
    const reviewStatus = question ? "question" : "ready";
    rowUpdates.push({
      ...row,
      confirmed_record_type: kind,
      normalized_data: normalizedData,
      user_corrections: corrections,
      missing_fields: missingFields,
      question,
      review_status: reviewStatus,
      updated_at: new Date().toISOString()
    });
  }
  const updatedById = new Map(rowUpdates.map((row) => [row.id, row]));
  const effectiveRows = detail.rows.map((row) => updatedById.get(row.id) ?? row);
  const quality = currentImportQuality(detail.job, updatedSummaries, effectiveRows, heldSheets, layoutConfirmations);
  // Typed row issues are recomputed from effective values. Retaining the old
  // display strings would block corrected rows and checked layout confirmations.
  // Keep the issue evidence itself so unchecking a confirmation restores its gate.
  const replayedSheets = new Map(quality.sheets.map((sheet) => [sheet.name, sheet]));
  updatedSummaries = updatedSummaries.map((sheet) => {
    const replayed = replayedSheets.get(sheet.name);
    if (!replayed) return sheet;
    return { ...sheet, clarification: replayed.clarification, requiresConfirmation: replayed.requiresConfirmation,
      blockingIssues: (replayed.clarification?.issues ?? []).filter((issue) => issue.code !== "layout_confirmation" || !layoutConfirmations[sheet.name]).map((issue) => issue.message) };
  });
  const activeSummaries = updatedSummaries.filter((sheet) => !heldSheets.has(sheet.name));
  const unresolvedSheets = activeSummaries.filter((sheet) => sheet.suggestedRecordType === "unknown").length;
  const unresolvedColumns = activeSummaries.reduce((count, sheet) => count + (sheet.missingRequiredFields?.length ?? 0), 0);
  const unresolvedLayouts = activeSummaries.filter((sheet) => sheet.suggestedRecordType !== "ignore" && (sheet.blockingIssues?.length || (sheet.requiresConfirmation && !layoutConfirmations[sheet.name]))).length;
  const blockedSheets = new Set(updatedSummaries.filter((sheet) => sheet.blockingIssues?.length).map((sheet) => sheet.name));
  const activeRows = effectiveRows.filter((row) => !heldSheets.has(row.sheet_name) && !importedRow(row) && row.review_status !== "ignored");
  const unresolved = activeRows.filter((row) => row.review_status === "question" && !blockedSheets.has(row.sheet_name)).length;
  const approved = activeRows.filter((row) => ["ready", "error"].includes(row.review_status) && row.confirmed_record_type && !["unknown", "ignore"].includes(row.confirmed_record_type) && !blockedSheets.has(row.sheet_name) && !updatedSummaries.find((sheet) => sheet.name === row.sheet_name)?.missingRequiredFields?.length).length;
  const reviewLockAt = nextImportRevision(detail.job.updated_at);
  const { data: reviewLock, error: reviewLockError } = await supabase.from("unified_import_jobs").update({ status: "analyzing", updated_at: reviewLockAt }).eq("store_id", store.id).eq("id", jobId).eq("status", detail.job.status).eq("updated_at", detail.job.updated_at).is("archived_at", null).select("id").maybeSingle();
  if (reviewLockError || !reviewLock) throw new Error("別の操作で状態が変わりました。再読み込みしてください。");
  try {
  for (let index = 0; index < rowUpdates.length; index += 500) {
    const { error } = await supabase.from("unified_import_rows").upsert(rowUpdates.slice(index, index + 500), { onConflict: "id" });
    if (error) throw new Error(`確認結果を保存できませんでした: ${error.message}`);
  }

  const totalUnresolved = Math.max(unresolvedSheets + unresolvedColumns + unresolvedLayouts + unresolved, quality.issues.length, quality.quality === "unprocessable" || quality.rejectedResolutions.length ? 1 : 0);
  const status = totalUnresolved > 0 || (heldSheets.size > 0 && approved === 0) ? "questions_required" : "review_ready";
  const answers = { ...detail.job.answers, sheet_types: Object.fromEntries(sheetKinds), column_mappings: Object.fromEntries(sheetMappings), layout_confirmations: layoutConfirmations, held_sheets: [...heldSheets], execution_started_tables: [...startedTables], clarification_pending: null,
    clarification_state: { ...(detail.job.answers.clarification_state as Record<string, unknown> ?? {}), remainingIssueIds: quality.issues.map((issue) => issue.id), heldTables: [...heldSheets], acceptedResolutionIds: quality.acceptedResolutionIds, quality: quality.quality, qualityMetrics: quality.qualityMetrics },
    reviewed_by: access.userId, reviewed_at: nextImportRevision(reviewLockAt) };
  const questions = questionList(activeRows.map((row) => ({ sheetName: row.sheet_name, rowNumber: row.row_number, suggestedRecordType: row.suggested_record_type, missingFields: row.missing_fields, question: row.question })), activeSummaries.map((sheet) => ({ ...sheet, requiresConfirmation: sheet.requiresConfirmation && !layoutConfirmations[sheet.name] })));
  const { data: saved, error } = await supabase.from("unified_import_jobs").update({ status, answers, sheet_summaries: updatedSummaries, approved_rows: approved, questions, completed_at: null, updated_at: nextImportRevision(reviewLockAt) }).eq("id", jobId).eq("store_id", store.id).eq("status", "analyzing").eq("updated_at", reviewLockAt).is("archived_at", null).select("id").maybeSingle();
  if (error || !saved) throw new Error("確認状態を保存できませんでした。内容を再確認してください。");
  await logAuditEvent({ storeId: store.id, actionType: "unified_import_reviewed", targetType: "unified_import", targetId: jobId, message: totalUnresolved > 0 ? `分析結果を保存しました。未回答が${totalUnresolved}件あります。` : `${approved}行の取り込み内容を確認しました（保留${heldSheets.size}表）。`, metadata: { approved, held: [...heldSheets], actor_id: access.userId, unresolved_rows: unresolved, unresolved_columns: unresolvedColumns, unresolved_sheets: unresolvedSheets } });
  return { unresolved: totalUnresolved, approved, held: heldSheets.size };
  } catch (error) {
    // A partly saved review must not leave a previously-ready job executable.
    await supabase.from("unified_import_jobs").update({ status: "questions_required", updated_at: nextImportRevision(reviewLockAt) }).eq("store_id", store.id).eq("id", jobId).eq("status", "analyzing").eq("updated_at", reviewLockAt).is("archived_at", null);
    throw error;
  }
}

async function findItem(supabase: SupabaseClient, storeId: string, data: Record<string, unknown>) {
  const sku = valueText(data.item_code ?? data.sku, 200);
  const name = valueText(data.item_name ?? data.name, 500);
  if (sku) {
    const { data: item } = await supabase.from("items").select("id, is_stock_managed").eq("store_id", storeId).eq("sku", sku).is("archived_at", null).maybeSingle();
    if (item) return item;
  }
  if (name) {
    const { data: item } = await supabase.from("items").select("id, is_stock_managed").eq("store_id", storeId).ilike("name", name).is("archived_at", null).limit(1).maybeSingle();
    if (item) return item;
  }
  return null;
}

async function importSaleGroup(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, rows: UnifiedImportRow[]) {
  if (rows.length === 0) throw new Error("取り込む売上明細がありません。");
  const prepared = rows.map((row) => ({
    row,
    data: row.normalized_data,
    date: saleDateValue(row.normalized_data),
    itemName: valueText(row.normalized_data.item_name, 500)
  }));
  if (prepared.some((entry) => !entry.date || !entry.itemName)) throw new Error("売上日または商品・メニュー名を確認してください。");
  const first = prepared[0];
  const externalTransactionId = valueText(first.data.transaction_id, 500);
  const sourceRowHash = hash(JSON.stringify(["unified-sale-v2", job.id, unifiedSaleGroupKey(first.row)]));
  const { data: existing, error: existingError } = await supabase.from("sales_transactions").select("id,business_date,gross_amount,tax_amount,source_metadata").eq("store_id", store.id).eq("source_row_hash", sourceRowHash).maybeSingle();
  if (existingError) throw new Error(`保存済みの売上を照合できませんでした: ${existingError.message}`);
  const grossAmount = prepared.reduce((sum, entry) => sum + numberValue(entry.data.amount), 0);
  const taxAmount = prepared.reduce((sum, entry) => sum + numberValue(entry.data.tax_amount), 0);
  const recoverMovement = async (entry: typeof prepared[number], transactionId: string, itemId: string, quantity: number) => {
    const { error } = await supabase.rpc("apply_inventory_movement", {
      p_store_id: store.id, p_item_id: itemId, p_movement_type: "sale",
      p_quantity_delta: -Math.abs(quantity), p_reserved_delta: 0,
      p_reason: `AI共通取込: ${entry.itemName}`, p_reference_type: "sales_transaction", p_reference_id: transactionId,
      p_movement_key: `unified-sale:${entry.row.id}`, p_actor_user_id: job.created_by
    });
    if (error) throw new Error(`売上は保存しましたが在庫へ反映できませんでした: ${error.message}`);
  };
  if (existing?.id) {
    const metadata = existing.source_metadata as Record<string, unknown> | null;
    const savedIds = Array.isArray(metadata?.unified_import_row_ids) ? metadata.unified_import_row_ids.map(String).sort() : [];
    const expectedIds = rows.map((row) => row.id).sort();
    if (metadata?.unified_import_job_id !== job.id || JSON.stringify(savedIds) !== JSON.stringify(expectedIds)
      || existing.business_date !== normalizeImportBusinessDate(first.data.date)
      || Number(existing.gross_amount) !== grossAmount || Number(existing.tax_amount) !== taxAmount) {
      throw new Error("保存済み売上と今回の取込内容が一致しません。既存売上は変更せず停止しました。");
    }
    // A previous attempt may have saved the sale and then failed on inventory.
    // Validate every persisted line first; never rematch a changed item master
    // or silently accept a partial/different receipt as already imported.
    const savedLines: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("sales_transaction_items").select("id,item_id,item_name,quantity,unit_price,tax_amount,total_amount,source_metadata").eq("store_id", store.id).eq("sales_transaction_id", existing.id).order("id").range(offset, offset + 499);
      if (error) throw new Error(`保存済み売上明細を照合できませんでした: ${error.message}`);
      const batch = (data ?? []) as Array<Record<string, unknown>>;
      savedLines.push(...batch);
      if (savedLines.length > prepared.length || batch.length < 500) break;
    }
    if (savedLines.length !== prepared.length) throw new Error("保存済み売上の明細件数が一致しません。既存売上は保持しています。");
    const linesByRow = new Map<string, Record<string, unknown>>();
    for (const line of savedLines) {
      const savedMetadata = line.source_metadata as Record<string, unknown> | null;
      const rowId = String(savedMetadata?.unified_import_row_id ?? "");
      if (!expectedIds.includes(rowId) || linesByRow.has(rowId)) throw new Error("保存済み売上明細の元データを照合できませんでした。");
      linesByRow.set(rowId, line);
    }
    const movements = prepared.map((entry) => {
      const line = linesByRow.get(entry.row.id)!;
      const savedMetadata = line.source_metadata as Record<string, unknown>;
      const quantity = numberValue(entry.data.quantity, 1);
      if (line.item_name !== entry.itemName || Number(line.quantity) !== quantity
        || Number(line.unit_price) !== numberValue(entry.data.unit_price)
        || Number(line.tax_amount) !== numberValue(entry.data.tax_amount)
        || Number(line.total_amount) !== numberValue(entry.data.amount)
        || typeof savedMetadata.inventory_movement_required !== "boolean"
        || (savedMetadata.inventory_movement_required && (!line.item_id || quantity <= 0 || ["日別サービス別集計", "利用者確認済み売上調整"].includes(entry.row.raw_data["データ粒度"]) || entry.data.clarification_adjustment === true))) {
        throw new Error("保存済み売上明細の数量・金額・在庫対象が一致しません。既存売上は変更していません。");
      }
      return { entry, itemId: String(line.item_id ?? ""), quantity, required: savedMetadata.inventory_movement_required };
    });
    for (const movement of movements) {
      if (movement.required) await recoverMovement(movement.entry, String(existing.id), movement.itemId, movement.quantity);
    }
    return { table: "sales_transactions", id: String(existing.id) };
  }
  const customerName = prepared.map((entry) => valueText(entry.data.customer_name, 500)).find(Boolean) ?? null;
  const paymentMethod = prepared.map((entry) => valueText(entry.data.payment_method, 200)).find(Boolean) ?? null;
  const { data: transaction, error } = await supabase.from("sales_transactions").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    external_transaction_id: externalTransactionId,
    source_row_hash: sourceRowHash,
    transaction_date: first.date,
    business_date: normalizeImportBusinessDate(first.data.date),
    customer_name: customerName,
    payment_method: paymentMethod,
    gross_amount: grossAmount,
    discount_amount: 0,
    tax_amount: taxAmount,
    net_amount: grossAmount - taxAmount,
    currency: "JPY",
    channel: "unified_import",
    source_metadata: {
      unified_import_job_id: job.id,
      unified_import_row_ids: rows.map((row) => row.id),
      original_filename: job.original_filename,
      data_grain: rows.some((row) => row.raw_data["データ粒度"] === "日別サービス別集計") ? "daily_service_summary" : "transaction",
      source_cells: rows.map((row) => ({ sheet: row.raw_data["元シート"] ?? row.sheet_name, cell: row.raw_data["元セル"] ?? String(row.row_number) })),
      staff_names: [...new Set(prepared.map((entry) => valueText(entry.data.staff_name, 200)).filter(Boolean))],
      reservation_channels: [...new Set(prepared.map((entry) => valueText(entry.data.reservation_channel, 200)).filter(Boolean))]
    }
  }).select("id").single();
  if (error || !transaction) throw new Error(error?.message ?? "売上を保存できませんでした。");
  const items = await Promise.all(prepared.map(async (entry) => {
    const item = await findItem(supabase, store.id, entry.data);
    return { entry, item, quantity: Math.max(0, numberValue(entry.data.quantity, 1)) };
  }));
  const { error: itemError } = await supabase.from("sales_transaction_items").insert(items.map(({ entry, item, quantity }) => ({
      organization_id: store.organization_id,
      store_id: store.id,
      sales_transaction_id: transaction.id,
      item_id: item?.id ?? null,
      item_match_status: item?.id ? "confirmed" : "unmatched",
      external_item_id: valueText(entry.data.item_code, 200),
      item_name: entry.itemName,
      category_name: valueText(entry.data.category_name, 200),
      quantity,
      unit_price: numberValue(entry.data.unit_price),
      tax_amount: numberValue(entry.data.tax_amount),
      total_amount: numberValue(entry.data.amount),
      source_metadata: {
        unified_import_row_id: entry.row.id,
        inventory_movement_required: !["日別サービス別集計", "利用者確認済み売上調整"].includes(entry.row.raw_data["データ粒度"]) && entry.data.clarification_adjustment !== true && Boolean(item?.id && item.is_stock_managed && quantity > 0)
      }
    })));
  if (itemError) {
    await supabase.from("sales_transactions").delete().eq("id", transaction.id);
    throw new Error(itemError.message);
  }
  for (const { entry, item, quantity } of items) {
    // Aggregated historical reports describe sales, not a new stock movement.
    if (!["日別サービス別集計", "利用者確認済み売上調整"].includes(entry.row.raw_data["データ粒度"]) && entry.data.clarification_adjustment !== true && item?.id && item.is_stock_managed && quantity > 0) {
      await recoverMovement(entry, String(transaction.id), String(item.id), quantity);
    }
  }
  return { table: "sales_transactions", id: String(transaction.id) };
}

async function importSale(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  return importSaleGroup(supabase, store, job, [row]);
}

async function importExpense(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  const data = row.normalized_data;
  const date = normalizeImportBusinessDate(data.date);
  const vendorName = valueText(data.vendor_name, 500);
  if (!date || !vendorName) throw new Error("経費の日付または支払先を確認してください。");
  const fingerprint = hash(`unified-expense:${job.id}:${row.id}`);
  const { data: existing } = await supabase.from("expense_receipts").select("id").eq("store_id", store.id).eq("content_fingerprint", fingerprint).is("archived_at", null).maybeSingle();
  if (existing?.id) return { table: "expense_receipts", id: String(existing.id) };
  const total = numberValue(data.amount);
  const tax = numberValue(data.tax_amount);
  const { data: receipt, error } = await supabase.from("expense_receipts").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    storage_bucket: job.storage_bucket,
    storage_path: job.storage_path,
    original_file_name: `${job.original_filename} / ${row.sheet_name} ${row.row_number}行目`,
    mime_type: job.mime_type,
    file_size: job.file_size,
    status: "analyzed",
    vendor_name: vendorName,
    receipt_date: date,
    payment_method: valueText(data.payment_method, 200),
    category_name: valueText(data.category_name, 500),
    subtotal_amount: numberValue(data.subtotal_amount, total - tax),
    tax_amount: tax,
    total_amount: total,
    invoice_registration_number: valueText(data.invoice_registration_number, 200),
    extracted_items: [],
    ai_summary: ["AI共通取込から作成", valueText(data.memo, 1000)].filter(Boolean).join(" / "),
    ai_analysis_status: "success",
    freee_status: "review_required",
    approval_status: "draft",
    content_fingerprint: fingerprint,
    field_confidence: { source: "unified_import", confidence: row.confidence },
    review_notes: "内容を確認してからfreeeへ送信してください。",
    uploaded_by: job.created_by
  }).select("id").single();
  if (error || !receipt) throw new Error(error?.message ?? "経費を保存できませんでした。");
  return { table: "expense_receipts", id: String(receipt.id) };
}

async function importCustomer(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  const data = row.normalized_data;
  const name = valueText(data.name, 500);
  const phone = valueText(data.phone, 100);
  const phoneNormalized = phoneValue(phone);
  if (!name || phoneNormalized.length < 8) throw new Error("顧客の名前と電話番号を確認してください。");
  const { data: existing } = await supabase.from("customers").select("id").eq("store_id", store.id).eq("phone_normalized", phoneNormalized).is("archived_at", null).maybeSingle();
  if (existing?.id) return { table: "customers", id: String(existing.id) };
  const { data: customer, error } = await supabase.from("customers").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    name,
    company_name: valueText(data.company_name, 500),
    phone,
    phone_normalized: phoneNormalized,
    email: valueText(data.email, 500),
    birth_date: normalizeImportBusinessDate(data.birth_date),
    gender: valueText(data.gender, 100),
    occupation: valueText(data.occupation, 200),
    assigned_staff_name: valueText(data.assigned_staff_name, 200),
    line_account: valueText(data.line_account, 500),
    instagram_account: valueText(data.instagram_account, 500),
    facebook_account: valueText(data.facebook_account, 500),
    last_visit_date: normalizeImportBusinessDate(data.last_visit_date),
    visit_count: Math.max(0, Math.trunc(numberValue(data.visit_count))),
    import_source: `unified_import:${job.id}`,
    metadata: { unified_import_row_id: row.id }
  }).select("id").single();
  if (error || !customer) throw new Error(error?.message ?? "顧客を保存できませんでした。");
  const memo = valueText(data.memo, 5000);
  if (memo) await supabase.from("customer_notes").insert({ organization_id: store.organization_id, store_id: store.id, customer_id: customer.id, body: memo, created_by: job.created_by });
  return { table: "customers", id: String(customer.id) };
}

async function importItem(supabase: SupabaseClient, store: Store, row: UnifiedImportRow) {
  const data = row.normalized_data;
  const name = valueText(data.name, 500);
  if (!name) throw new Error("商品・メニュー名を確認してください。");
  const existing = await findItem(supabase, store.id, data);
  if (existing?.id) return { table: "items", id: String(existing.id) };
  const { data: item, error } = await supabase.from("items").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    industry_type_key: store.industry_type_key,
    item_type: "product",
    name,
    sku: valueText(data.sku, 200),
    description: valueText(data.description, 2000),
    unit: valueText(data.unit, 100) ?? "個",
    unit_price: numberValue(data.unit_price),
    cost_price: numberValue(data.cost_price),
    tax_rate: numberValue(data.tax_rate, 10),
    is_stock_managed: booleanValue(data.is_stock_managed),
    metadata: { unified_import_row_id: row.id }
  }).select("id").single();
  if (error || !item) throw new Error(error?.message ?? "商品・メニューを保存できませんでした。");
  if (booleanValue(data.is_stock_managed)) await supabase.from("inventory_stocks").upsert({ organization_id: store.organization_id, store_id: store.id, item_id: item.id, quantity: 0, reorder_point: 0 }, { onConflict: "item_id" });
  return { table: "items", id: String(item.id) };
}

async function importInventory(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  const data = row.normalized_data;
  const item = await findItem(supabase, store.id, data);
  if (!item?.id) throw new Error("在庫を反映する商品・メニューが見つかりません。先に商品を登録してください。");
  const quantity = numberValue(data.quantity);
  const movement = String(data.movement_type ?? "stocktake").toLowerCase();
  const movementType = /入庫|仕入|receipt|in/u.test(movement) ? "receipt" : /出庫|廃棄|out|waste/u.test(movement) ? "waste" : "stocktake";
  const { data: stock } = await supabase.from("inventory_stocks").select("quantity").eq("item_id", item.id).maybeSingle();
  const delta = movementType === "stocktake" ? quantity - Number(stock?.quantity ?? 0) : movementType === "waste" ? -Math.abs(quantity) : Math.abs(quantity);
  const { data: movementId, error } = await supabase.rpc("apply_inventory_movement", {
    p_store_id: store.id,
    p_item_id: item.id,
    p_movement_type: movementType,
    p_quantity_delta: delta,
    p_reserved_delta: 0,
    p_reason: valueText(data.reason, 1000) ?? `AI共通取込: ${job.original_filename}`,
    p_reference_type: "unified_import",
    p_reference_id: job.id,
    p_movement_key: `unified-inventory:${row.id}`,
    p_actor_user_id: job.created_by
  });
  if (error) throw new Error(error.message);
  const reorderPoint = numberValue(data.reorder_point, -1);
  if (reorderPoint >= 0) await supabase.from("inventory_stocks").update({ reorder_point: reorderPoint, updated_at: new Date().toISOString() }).eq("item_id", item.id);
  return { table: "inventory_movements", id: String(movementId) };
}

async function importRow(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  const kind = row.confirmed_record_type;
  if (kind === "sale") return importSale(supabase, store, job, row);
  if (kind === "expense") return importExpense(supabase, store, job, row);
  if (kind === "customer") return importCustomer(supabase, store, job, row);
  if (kind === "item") return importItem(supabase, store, row);
  if (kind === "inventory") return importInventory(supabase, store, job, row);
  throw new Error("取り込み先が確定していません。");
}

export async function executeUnifiedImport(storeId: string, jobId: string, expectedRevision: string) {
  const { store, supabase } = await context(storeId, true);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) throw new Error("AIデータ取込が見つかりません。");
  requireImportRevision(expectedRevision, detail.job.updated_at);
  const heldSheets = new Set((detail.job.answers.held_sheets ?? []) as string[]);
  const held = heldSheets.size;
  if (detail.job.status === "completed") {
    if (detail.rows.some((row) => row.confirmed_record_type === "sale" && row.review_status === "imported")) {
      await rebuildSalesSummaries(supabase, store.organization_id, store.id);
    }
    return { success: detail.job.success_rows, errors: detail.job.error_rows, held };
  }
  if (!["review_ready", "partial_failed", "failed"].includes(detail.job.status)) throw new Error("不明点への回答と分析結果の確認を完了してください。");
  if (detail.job.answers.parser_version !== UNIFIED_IMPORT_PARSER_VERSION) throw new Error("以前の解析方式の結果です。未反映のファイルは再解析してください。");
  const confirmations = (detail.job.answers.layout_confirmations ?? {}) as Record<string, boolean>;
  const kinds = (detail.job.answers.sheet_types ?? {}) as Record<string, UnifiedImportRecordType>;
  const quality = currentImportQuality(detail.job, detail.job.sheet_summaries.map((sheet) => ({ ...sheet, suggestedRecordType: ownTableValue(kinds, sheet.name) ?? sheet.suggestedRecordType })), detail.rows, heldSheets, confirmations);
  if (detail.job.sheet_summaries.some((sheet) => !heldSheets.has(sheet.name) && (ownTableValue(kinds, sheet.name) ?? sheet.suggestedRecordType) !== "ignore" && (sheet.blockingIssues?.length || (sheet.requiresConfirmation && ownTableValue(confirmations, sheet.name) !== true)))) {
    throw new Error("表の対象範囲・日付・合計に未確認の項目があります。確認画面へ戻ってください。");
  }
  const processingOrder: Record<UnifiedImportRecordType, number> = { item: 0, customer: 1, sale: 2, expense: 3, inventory: 4, unknown: 5, ignore: 6 };
  const rows = detail.rows
    .filter((row) => !heldSheets.has(row.sheet_name) && !importedRow(row) && (row.review_status === "ready" || row.review_status === "error"))
    .sort((left, right) => processingOrder[left.confirmed_record_type ?? "unknown"] - processingOrder[right.confirmed_record_type ?? "unknown"]);
  const alreadyImported = detail.rows.filter(importedRow).length;
  // A summary/final-state failure may happen after every business row was
  // saved. Retrying that job must finish bookkeeping without importing again.
  const retryFinalization = rows.length === 0 && alreadyImported > 0 && ["partial_failed", "failed"].includes(detail.job.status);
  if (rows.length === 0 && !retryFinalization) throw new Error("取り込む行がありません。");
  if (detail.rows.some((row) => !heldSheets.has(row.sheet_name) && !importedRow(row) && (row.review_status === "question" || !row.confirmed_record_type || row.confirmed_record_type === "unknown"))) throw new Error("未確認の行が残っています。内容を確認してから取り込んでください。");
  const sheetsByName = new Map(detail.job.sheet_summaries.map((sheet) => [sheet.name, sheet]));
  for (const row of rows) {
    const sheet = sheetsByName.get(row.sheet_name);
    const sheetKind = sheet ? ownTableValue(kinds, sheet.name) ?? sheet.suggestedRecordType : "unknown";
    if (!sheet || sheet.excludedReason || sheetKind === "ignore" || sheetKind === "unknown" || row.confirmed_record_type === "ignore") {
      throw new Error(`${row.sheet_name}: 取り込み対象外または未確認の表に反映予定の行があります。確認画面で分類を保存し直してください。`);
    }
    if (sheet.blockingIssues?.length || (sheet.requiresConfirmation && ownTableValue(confirmations, sheet.name) !== true)) {
      throw new Error(`${row.sheet_name}: 表の対象範囲・日付・合計に未確認の項目があります。`);
    }
    const requiredMissing = unifiedImportFields(row.confirmed_record_type ?? "unknown").filter((field) => field.required && !valueText(row.normalized_data[field.key]));
    if (requiredMissing.length) throw new Error(`${row.sheet_name}: ${requiredMissing.map((field) => requiredLabels[field.key] ?? field.key).join("・")}が未入力です。`);
    const issues = validateUnifiedImportValues(row.confirmed_record_type ?? "unknown", row.normalized_data);
    if (issues.length) throw new Error(`${row.sheet_name}: ${issues.map((issue) => issue.message).join(" ")}`);
  }
  if (quality.rejectedResolutions.length || quality.issues.length || quality.quality === "unprocessable") throw new Error("表の品質・説明に未確認の項目があります。最新の修正案を確認するか、対象の表を保留してください。");
  const executionLockAt = nextImportRevision(detail.job.updated_at);
  const startedTables = [...new Set([...((detail.job.answers.execution_started_tables ?? []) as string[]), ...detail.rows.filter((row) => importedRow(row) || row.review_status === "error").map((row) => row.sheet_name), ...rows.map((row) => row.sheet_name)])];
  const executionAnswers = { ...detail.job.answers, execution_started_tables: startedTables, clarification_pending: null };
  const { data: started, error: startingError } = await supabase.from("unified_import_jobs").update({ status: "importing", answers: executionAnswers, approved_rows: retryFinalization ? detail.job.approved_rows : rows.length, error_message: null, completed_at: null, updated_at: executionLockAt }).eq("id", jobId).eq("store_id", store.id).eq("status", detail.job.status).eq("updated_at", detail.job.updated_at).is("archived_at", null).select("id").maybeSingle();
  if (startingError || !started) throw new Error("別の操作で取り込み状態が変わりました。二重処理を防ぐため停止しました。再読み込みしてください。");
  let success = alreadyImported;
  let errors = 0;
  const saleRows = rows.filter((row) => row.confirmed_record_type === "sale");
  for (const groupRows of groupUnifiedSaleRows(saleRows)) {
    try {
      const result = await importSaleGroup(supabase, store, detail.job, groupRows);
      const { error: resultError } = await supabase.from("unified_import_rows").update({ review_status: "imported", result_table: result.table, result_id: result.id, error_message: null, updated_at: new Date().toISOString() }).in("id", groupRows.map((row) => row.id)).eq("store_id", store.id);
      if (resultError) throw resultError;
      success += groupRows.length;
    } catch (error) {
      await supabase.from("unified_import_rows").update({ review_status: "error", error_message: error instanceof Error ? error.message.slice(0, 2000) : "取り込みに失敗しました。", updated_at: new Date().toISOString() }).in("id", groupRows.map((row) => row.id)).eq("store_id", store.id);
      errors += groupRows.length;
    }
  }
  for (const recordType of ["item", "customer", "expense", "inventory"] as UnifiedImportRecordType[]) {
    const typeRows = rows.filter((row) => row.confirmed_record_type === recordType);
    for (let index = 0; index < typeRows.length; index += 10) {
      await Promise.all(typeRows.slice(index, index + 10).map(async (row) => {
        try {
          const result = await importRow(supabase, store, detail.job, row);
          const { error: resultError } = await supabase.from("unified_import_rows").update({ review_status: "imported", result_table: result.table, result_id: result.id, error_message: null, updated_at: new Date().toISOString() }).eq("id", row.id).eq("store_id", store.id);
          if (resultError) throw resultError;
          success += 1;
        } catch (error) {
          await supabase.from("unified_import_rows").update({ review_status: "error", error_message: error instanceof Error ? error.message.slice(0, 2000) : "取り込みに失敗しました。", updated_at: new Date().toISOString() }).eq("id", row.id).eq("store_id", store.id);
          errors += 1;
        }
      }));
    }
  }
  const status = errors === 0 ? held > 0 ? "questions_required" : "completed" : success > 0 ? "partial_failed" : "failed";
  try {
    if (saleRows.length > 0 || detail.rows.some((row) => row.review_status === "imported" && row.confirmed_record_type === "sale")) {
      await rebuildSalesSummaries(supabase, store.organization_id, store.id);
    }
    const { data: finished, error: finishError } = await supabase.from("unified_import_jobs").update({ status, success_rows: success, error_rows: errors, error_message: null, completed_at: status === "completed" ? nextImportRevision(executionLockAt) : null, updated_at: nextImportRevision(executionLockAt) }).eq("id", jobId).eq("store_id", store.id).eq("status", "importing").eq("updated_at", executionLockAt).is("archived_at", null).select("id").maybeSingle();
    if (finishError || !finished) throw new Error(`取り込み結果の確定状態を保存できませんでした${finishError?.message ? `: ${finishError.message}` : "。"}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取り込み後の集計・結果保存に失敗しました。";
    const { data: recovered, error: recoveryError } = await supabase.from("unified_import_jobs").update({
      status: success > 0 ? "partial_failed" : "failed", success_rows: success, error_rows: errors,
      error_message: `${message} 取込済みの行は保持しています。再実行では未反映の行と集計・結果保存だけを処理します。`.slice(0, 2000),
      completed_at: null, updated_at: nextImportRevision(executionLockAt)
    }).eq("id", jobId).eq("store_id", store.id).eq("status", "importing").eq("updated_at", executionLockAt).is("archived_at", null).select("id").maybeSingle();
    if (recoveryError || !recovered) throw new Error(`${message} 取込済みデータは保持していますが、再試行状態を確認できませんでした。再読み込みし、取込中のままの場合は運営へご連絡ください。`);
    throw new Error(`${message} 取込済みデータは保持しています。失敗した処理だけ再実行してください。`);
  }
  await logAuditEvent({ storeId: store.id, actionType: "unified_import_completed", targetType: "unified_import", targetId: jobId, message: `AI共通取込を実行しました（成功${success}件・失敗${errors}件・保留${held}表）。`, metadata: { success, errors, held, held_sheets: [...heldSheets] } });
  return { success, errors, held };
}
