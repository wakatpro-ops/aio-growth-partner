import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { normalizeImportBusinessDate, parseImportDateIso } from "@/lib/import-date";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { buildImportStorageFileName } from "@/lib/storage-object-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeUnifiedRow, parseUnifiedImportFile, suggestUnifiedImportMapping, unifiedImportFields } from "@/lib/unified-import/parser";
import { groupUnifiedSaleRows } from "@/lib/unified-import/sales-groups";
import type { Store } from "@/types/domain";
import type { UnifiedImportJob, UnifiedImportQuestion, UnifiedImportRecordType, UnifiedImportRow } from "@/types/unified-import";

const storageBucket = "import-files";
const editableRoles = new Set(["org_owner", "store_manager", "staff"]);
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

function hash(value: string | ArrayBuffer | Buffer) {
  return createHash("sha256").update(value instanceof ArrayBuffer ? Buffer.from(value) : value).digest("hex");
}

function valueText(value: unknown, maxLength = 2000) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function numberValue(value: unknown, fallback = 0) {
  const normalized = String(value ?? "").replace(/[￥¥,\s]/gu, "").replace(/[()]/gu, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const role = access.organizationRoles[store.organization_id] ?? access.storeRoles[store.id] ?? "viewer";
  if (write && !access.isPlatformAdmin && !editableRoles.has(role)) throw new Error("データを取り込む権限がありません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

function questionList(
  rows: Array<{ sheetName: string; rowNumber: number; suggestedRecordType: UnifiedImportRecordType; missingFields: string[]; question: string | null }>,
  sheets: Array<{ name: string; suggestedRecordType?: UnifiedImportRecordType; missingRequiredFields?: string[] }>
) {
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
  const rowQuestions = rows.filter((row) => row.question).map((row, index): UnifiedImportQuestion => ({
    key: `row-${index + 1}`,
    sheetName: row.sheetName,
    rowNumber: row.rowNumber,
    prompt: row.question ?? "内容を確認してください。",
    field: row.missingFields[0] ?? null,
    options: row.suggestedRecordType === "unknown" ? ["sale", "expense", "customer", "item", "inventory", "ignore"] : undefined
  }));
  return [...sheetTypeQuestions, ...columnQuestions, ...rowQuestions].slice(0, 200);
}

function rowReviewStatus(row: { question: string | null }) {
  return row.question ? "question" : "ready";
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

  await logAuditEvent({ storeId: store.id, actionType: "unified_import_uploaded", targetType: "unified_import", targetId: jobId, message: `${file.name}を解析し、${parsed.rows.length}行の振り分け候補を作成しました。`, metadata: { sheets: parsed.sheets.length, macro_enabled: parsed.macroEnabled, questions: questions.length } });
  return { jobId, duplicate: false };
}

export async function listUnifiedImportJobs(storeId: string): Promise<UnifiedImportJob[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("unified_import_jobs").select("*").eq("store_id", store.id).is("archived_at", null).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`AIデータ取込履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as UnifiedImportJob[];
}

export async function getUnifiedImportJob(storeId: string, jobId: string) {
  const { store, supabase } = await context(storeId);
  const [{ data: job, error: jobError }, { data: rows, error: rowError }] = await Promise.all([
    supabase.from("unified_import_jobs").select("*").eq("store_id", store.id).eq("id", jobId).is("archived_at", null).maybeSingle(),
    supabase.from("unified_import_rows").select("*").eq("store_id", store.id).eq("import_job_id", jobId).order("sheet_name").order("row_number")
  ]);
  if (jobError || rowError) throw new Error(`AIデータ取込を取得できませんでした: ${jobError?.message ?? rowError?.message}`);
  return job ? { job: job as UnifiedImportJob, rows: (rows ?? []) as UnifiedImportRow[] } : null;
}

function selectedType(value: FormDataEntryValue | null, fallback: UnifiedImportRecordType) {
  const result = String(value ?? fallback) as UnifiedImportRecordType;
  return allowedRecordTypes.has(result) ? result : fallback;
}

export async function saveUnifiedImportReview(storeId: string, jobId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) throw new Error("AIデータ取込が見つかりません。");
  if (["importing", "completed"].includes(detail.job.status)) throw new Error("取り込み処理済みのため、分析結果を変更できません。");

  const storedSheetTypes = (detail.job.answers.sheet_types ?? {}) as Record<string, UnifiedImportRecordType>;
  const sheetKinds = new Map(detail.job.sheet_summaries.map((sheet, index) => [sheet.name, selectedType(formData.get(`sheet_type_${index}`), storedSheetTypes[sheet.name] ?? sheet.suggestedRecordType)]));
  const previousSheetKinds = new Map(detail.job.sheet_summaries.map((sheet) => [sheet.name, storedSheetTypes[sheet.name] ?? sheet.suggestedRecordType]));
  const previousMappings = (detail.job.answers.column_mappings ?? {}) as Record<string, Record<string, string>>;
  const sheetMappings = new Map<string, Record<string, string>>();
  const updatedSummaries = detail.job.sheet_summaries.map((sheet, index) => {
    const kind = sheetKinds.get(sheet.name) ?? sheet.suggestedRecordType;
    const inferred = suggestUnifiedImportMapping(sheet.headers, kind);
    const mapping: Record<string, string> = {};
    for (const field of unifiedImportFields(kind)) {
      const formKey = `sheet_mapping_${index}_${field.key}`;
      const selected = formData.has(formKey)
        ? String(formData.get(formKey) ?? "")
        : previousMappings[sheet.name]?.[field.key] ?? inferred[field.key] ?? "";
      if (selected && sheet.headers.includes(selected)) mapping[field.key] = selected;
    }
    sheetMappings.set(sheet.name, mapping);
    const missingRequiredFields = unifiedImportFields(kind).filter((field) => field.required && !mapping[field.key]).map((field) => field.key);
    return { ...sheet, suggestedRecordType: kind, suggestedMapping: mapping, missingRequiredFields };
  });
  const unresolvedSheets = updatedSummaries.filter((sheet) => sheet.suggestedRecordType === "unknown").length;
  const unresolvedColumns = updatedSummaries.reduce((count, sheet) => count + (sheet.missingRequiredFields?.length ?? 0), 0);
  let unresolved = 0;
  let approved = 0;
  const rowUpdates: Array<Record<string, unknown>> = [];
  for (const row of detail.rows) {
    const fallback = sheetKinds.get(row.sheet_name) ?? row.suggested_record_type;
    const sheetMapping = sheetMappings.get(row.sheet_name);
    const rowTypeKey = `row_type_${row.id}`;
    const sheetTypeChanged = fallback !== previousSheetKinds.get(row.sheet_name);
    const kind = formData.has(rowTypeKey)
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
    for (const field of normalized.missingFields) {
      const answerKey = `row_${row.id}_${field}`;
      if (!formData.has(answerKey)) continue;
      const answer = valueText(formData.get(answerKey));
      if (answer) corrections[field] = answer;
      else delete corrections[field];
    }
    const normalizedData = { ...normalized.normalizedData, ...corrections };
    const missingFields = normalized.missingFields.filter((field) => !valueText(normalizedData[field]));
    const missingColumnFields = new Set(unifiedImportFields(kind).filter((field) => field.required && !mapping?.[field.key]).map((field) => field.key));
    const missingRowFields = missingFields.filter((field) => !missingColumnFields.has(field));
    const question = kind !== "unknown" && missingRowFields.length > 0
        ? `${missingRowFields.map((field) => requiredLabels[field] ?? field).join("・")}を入力してください。`
        : null;
    const reviewStatus = question ? "question" : "ready";
    if (question) unresolved += 1;
    else if (kind !== "unknown" && missingColumnFields.size === 0) approved += 1;
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
  for (let index = 0; index < rowUpdates.length; index += 500) {
    const { error } = await supabase.from("unified_import_rows").upsert(rowUpdates.slice(index, index + 500), { onConflict: "id" });
    if (error) throw new Error(`確認結果を保存できませんでした: ${error.message}`);
  }

  const totalUnresolved = unresolvedSheets + unresolvedColumns + unresolved;
  const status = totalUnresolved > 0 ? "questions_required" : "review_ready";
  const answers = { sheet_types: Object.fromEntries(sheetKinds), column_mappings: Object.fromEntries(sheetMappings), reviewed_by: access.userId, reviewed_at: new Date().toISOString() };
  const questions = questionList(rowUpdates.map((row) => ({ sheetName: String(row.sheet_name), rowNumber: Number(row.row_number), suggestedRecordType: row.suggested_record_type as UnifiedImportRecordType, missingFields: row.missing_fields as string[], question: row.question as string | null })), updatedSummaries);
  const { error } = await supabase.from("unified_import_jobs").update({ status, answers, sheet_summaries: updatedSummaries, approved_rows: approved, questions, updated_at: new Date().toISOString() }).eq("id", jobId).eq("store_id", store.id);
  if (error) throw new Error(`確認状態を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "unified_import_reviewed", targetType: "unified_import", targetId: jobId, message: totalUnresolved > 0 ? `分析結果を保存しました。未回答が${totalUnresolved}件あります。` : `${approved}行の取り込み内容を確認しました。`, metadata: { approved, unresolved_rows: unresolved, unresolved_columns: unresolvedColumns, unresolved_sheets: unresolvedSheets } });
  return { unresolved: totalUnresolved, approved };
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
  const sourceRowHash = hash(`unified:${job.id}:sale:${externalTransactionId ?? rows.map((row) => row.id).sort().join(":")}:${first.date?.slice(0, 10)}`);
  const { data: existing } = await supabase.from("sales_transactions").select("id").eq("store_id", store.id).eq("source_row_hash", sourceRowHash).maybeSingle();
  if (existing?.id) return { table: "sales_transactions", id: String(existing.id) };
  const grossAmount = prepared.reduce((sum, entry) => sum + numberValue(entry.data.amount), 0);
  const taxAmount = prepared.reduce((sum, entry) => sum + numberValue(entry.data.tax_amount), 0);
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
      source_metadata: { unified_import_row_id: entry.row.id }
    })));
  if (itemError) {
    await supabase.from("sales_transactions").delete().eq("id", transaction.id);
    throw new Error(itemError.message);
  }
  for (const { entry, item, quantity } of items) {
    if (item?.id && item.is_stock_managed && quantity > 0) {
      const { error: inventoryError } = await supabase.rpc("apply_inventory_movement", {
        p_store_id: store.id,
        p_item_id: item.id,
        p_movement_type: "sale",
        p_quantity_delta: -Math.abs(quantity),
        p_reserved_delta: 0,
        p_reason: `AI共通取込: ${entry.itemName}`,
        p_reference_type: "sales_transaction",
        p_reference_id: transaction.id,
        p_movement_key: `unified-sale:${entry.row.id}`,
        p_actor_user_id: job.created_by
      });
      if (inventoryError) throw new Error(`売上は保存しましたが在庫へ反映できませんでした: ${inventoryError.message}`);
    }
  }
  return { table: "sales_transactions", id: String(transaction.id) };
}

async function importSale(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  return importSaleGroup(supabase, store, job, [row]);
}

async function importExpense(supabase: SupabaseClient, store: Store, job: UnifiedImportJob, row: UnifiedImportRow) {
  const data = row.normalized_data;
  const date = dateValue(data.date);
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
    receipt_date: date.slice(0, 10),
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
    birth_date: dateValue(data.birth_date)?.slice(0, 10) ?? null,
    gender: valueText(data.gender, 100),
    occupation: valueText(data.occupation, 200),
    assigned_staff_name: valueText(data.assigned_staff_name, 200),
    line_account: valueText(data.line_account, 500),
    instagram_account: valueText(data.instagram_account, 500),
    facebook_account: valueText(data.facebook_account, 500),
    last_visit_date: dateValue(data.last_visit_date)?.slice(0, 10) ?? null,
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

export async function executeUnifiedImport(storeId: string, jobId: string) {
  const { store, supabase } = await context(storeId, true);
  const detail = await getUnifiedImportJob(store.id, jobId);
  if (!detail) throw new Error("AIデータ取込が見つかりません。");
  if (detail.job.status === "completed") return { success: detail.job.success_rows, errors: detail.job.error_rows };
  if (!["review_ready", "partial_failed", "failed"].includes(detail.job.status)) throw new Error("不明点への回答と分析結果の確認を完了してください。");
  const processingOrder: Record<UnifiedImportRecordType, number> = { item: 0, customer: 1, sale: 2, expense: 3, inventory: 4, unknown: 5, ignore: 6 };
  const rows = detail.rows
    .filter((row) => row.review_status === "ready" || row.review_status === "error")
    .sort((left, right) => processingOrder[left.confirmed_record_type ?? "unknown"] - processingOrder[right.confirmed_record_type ?? "unknown"]);
  if (rows.length === 0) throw new Error("取り込む行がありません。");
  const { error: startingError } = await supabase.from("unified_import_jobs").update({ status: "importing", approved_rows: rows.length, completed_at: null, updated_at: new Date().toISOString() }).eq("id", jobId).eq("store_id", store.id);
  if (startingError) throw new Error(`取り込みを開始できませんでした: ${startingError.message}`);
  let success = detail.rows.filter((row) => row.review_status === "imported").length;
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
  const status = errors === 0 ? "completed" : success > 0 ? "partial_failed" : "failed";
  await supabase.from("unified_import_jobs").update({ status, success_rows: success, error_rows: errors, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId).eq("store_id", store.id);
  await logAuditEvent({ storeId: store.id, actionType: "unified_import_completed", targetType: "unified_import", targetId: jobId, message: `AI共通取込を実行しました（成功${success}件・失敗${errors}件）。`, metadata: { success, errors } });
  return { success, errors };
}
