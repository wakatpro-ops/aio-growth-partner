import "server-only";
import { createHash } from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { applyImportedSaleInventory } from "@/lib/inventory-operations";
import { generateDemandActionPlan } from "@/lib/phase4/demand-actions";
import { buildSuggestedMappings, groupNormalizedSalesRows, normalizeSalesRows, parseImportFile } from "@/lib/phase4/import-parser";
import { buildImportStorageFileName } from "@/lib/storage-object-name";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type {
  DataColumnMapping,
  DataImportFile,
  DataImportJob,
  ImportItemMatch,
  ImportProviderKey,
  NormalizedSalesPreviewRow,
  ParsedSalesRow,
  SalesReport,
  SalesTransactionListRow,
  StandardSalesField
} from "@/types/phase4";

const storageBucket = "import-files";
const editableRoles = new Set(["org_owner", "store_manager", "staff"]);

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101",
    industryTypeKey: "general_store",
    organizationName: "AIOデモ組織",
    storeName: "AIOサンプル店舗",
    address: "東京都渋谷区",
    phone: "03-0000-0000"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102",
    industryTypeKey: "auto_repair",
    organizationName: "AIOデモ組織",
    storeName: "AIOオート整備",
    address: "神奈川県横浜市",
    phone: "045-000-0000"
  }
} as const;

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function textValue(value: FormDataEntryValue | null, maxLength = 500) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function demoConfigFor(storeId: string) {
  return demoPersistence[storeId as keyof typeof demoPersistence];
}

async function ensureDemoPersistence(supabase: SupabaseClient, storeId: string) {
  const config = demoConfigFor(storeId);
  if (!config) return { organizationId: null, storeId };

  await supabase.from("organizations").upsert({
    id: config.organizationId,
    name: config.organizationName,
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: config.storeId,
    organization_id: config.organizationId,
    industry_type_key: config.industryTypeKey,
    name: config.storeName,
    address: config.address,
    phone: config.phone,
    status: "active",
    feature_flags: {
      pdf_export: true,
      monthly_report: true,
      marketing_drafts: true,
      instagram_draft_generation: true,
      google_business_profile_draft: true,
      ai_monthly_recommendations: true,
      image_caption_generation: false,
      demand_alerts: true,
      data_imports: true,
      csv_import: true,
      excel_import: true,
      column_mapping: true,
      sales_normalization: true,
      sales_reports: true,
      sales_ai_report: true,
      sales_anomaly_detection: true,
      demand_forecast: true,
      inventory_alerts: true,
      recommended_actions: true,
      growth_action_center: true,
      google_business_profile_drafts: true,
      instagram_drafts: true,
      review_reply_drafts: true,
      customer_message_drafts: true,
      pop_copy_drafts: true,
      line_message_drafts: true,
      growth_calendar: true,
      draft_approval_flow: true,
      draft_editing: true,
      channel_previews: true,
      external_channel_accounts: true,
      google_integrations: true,
      google_oauth_connection: true,
      google_business_profile_integration: true,
      gmail_draft_integration: true,
      google_calendar_integration: true,
      external_publish_jobs: true,
      google_sheets_import: false,
      pos_api_integrations: false,
      sales_export: false,
      sales_report_pdf: true,
      ai_sales_insights: false
    },
    profile_data: {},
    updated_at: new Date().toISOString()
  });

  return { organizationId: config.organizationId, storeId: config.storeId };
}

async function resolveStoreForRead(supabase: SupabaseClient, storeId: string) {
  const config = demoConfigFor(storeId);
  return {
    organizationId: config?.organizationId ?? null,
    storeId: config?.storeId ?? storeId
  };
}

async function resolveStoreForWrite(supabase: SupabaseClient, store: Store) {
  const demo = await ensureDemoPersistence(supabase, store.id);
  return {
    organizationId: demo.organizationId ?? store.organization_id,
    storeId: demo.storeId,
    industryTypeKey: store.industry_type_key
  };
}

function checksum(buffer: ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

function providerName(provider: string) {
  const labels: Record<string, string> = {
    manual_csv: "手動CSV",
    manual_excel: "手動Excel",
    google_sheets: "Googleスプレッドシート",
    air_regi: "Airレジ",
    smaregi: "スマレジ",
    square: "Square",
    stores_regi: "STORESレジ",
    pos_plus: "POS+",
    shopify: "Shopify",
    base: "BASE"
  };
  return labels[provider] ?? provider;
}

async function assertImportWriteAccess(store: Store) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const role = access.organizationRoles[store.organization_id] ?? access.storeRoles[store.id] ?? "viewer";
  if (!access.isPlatformAdmin && !editableRoles.has(role)) throw new Error("売上データを取り込む権限がありません。");
  return access;
}

function normalizedItemText(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s　_\-・]/gu, "");
}

function sourceItemKey(name: string | null | undefined, code: string | null | undefined) {
  return createHash("sha256").update(`${normalizedItemText(code)}:${normalizedItemText(name)}`).digest("hex");
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeMappingRows(rows: Array<Omit<DataColumnMapping, "id">>, organizationId: string, storeId: string, dataSourceId: string, importJobId: string) {
  return rows.map((row) => ({
    organization_id: organizationId,
    store_id: storeId,
    data_source_id: dataSourceId,
    import_job_id: importJobId,
    source_column_name: row.source_column_name,
    source_column_index: row.source_column_index,
    target_field: row.target_field,
    confidence: row.confidence,
    is_required: ["sale_date", "item_name", "gross_amount"].includes(row.target_field),
    created_by: row.created_by
  }));
}

export async function listImportJobs(storeId: string): Promise<DataImportJob[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase
    .from("data_import_jobs")
    .select("*, data_source:external_data_sources(name, provider_key)")
    .eq("store_id", resolved.storeId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as DataImportJob[];
}

export async function getImportJob(storeId: string, importJobId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data: job } = await supabase
    .from("data_import_jobs")
    .select("*, data_source:external_data_sources(name, provider_key)")
    .eq("store_id", resolved.storeId)
    .eq("id", importJobId)
    .is("archived_at", null)
    .single();
  if (!job) return null;

  const [{ data: file }, { data: mappings }, { data: errors }, { data: itemMatches }] = await Promise.all([
    supabase.from("data_import_files").select("*").eq("import_job_id", importJobId).maybeSingle(),
    supabase.from("data_column_mappings").select("*").eq("import_job_id", importJobId).order("source_column_index"),
    supabase.from("import_error_rows").select("*").eq("import_job_id", importJobId).order("row_number").limit(50),
    supabase.from("import_item_matches").select("*").eq("import_job_id", importJobId).order("source_item_name")
  ]);

  return {
    job: {
      ...job,
      detected_columns: jsonArray<string>(job.detected_columns),
      preview_rows: jsonArray<ParsedSalesRow>(job.preview_rows),
      normalized_preview: jsonArray<NormalizedSalesPreviewRow>(job.normalized_preview),
      file: file as DataImportFile | null
    } as DataImportJob,
    mappings: (mappings ?? []) as DataColumnMapping[],
    errors: errors ?? [],
    itemMatches: (itemMatches ?? []) as ImportItemMatch[]
  };
}

async function getOrCreateDataSource(supabase: SupabaseClient, organizationId: string, storeId: string, provider: ImportProviderKey) {
  const name = providerName(provider);
  const { data, error } = await supabase
    .from("external_data_sources")
    .upsert({
      organization_id: organizationId,
      store_id: storeId,
      provider_key: provider,
      connection_type: "file_upload",
      name,
      status: "active",
      settings: { phase: "4-A", file_upload: true },
      updated_at: new Date().toISOString()
    }, { onConflict: "store_id,provider_key,connection_type,name" })
    .select("id")
    .single();

  if (error || !data) throw new Error(`データ元を作成できませんでした: ${error?.message ?? "unknown error"}`);
  return data.id as string;
}

export async function uploadImportFileFromForm(storeId: string, formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("CSV、Excel、PDFのいずれかを選択してください。");
  }

  const lowerName = file.name.toLowerCase();
  const fallbackProvider = lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") ? "manual_csv" : "manual_excel";
  const provider = String(formData.get("provider_key") ?? fallbackProvider) as ImportProviderKey;
  const store = await getStore(storeId);
  await assertImportWriteAccess(store);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await resolveStoreForWrite(supabase, store);
  if (!resolved.organizationId) throw new Error("組織情報を解決できませんでした。");

  const buffer = await file.arrayBuffer();
  const parsed = await parseImportFile(file.name, buffer);
  const fileChecksum = checksum(buffer);
  const { data: duplicate } = await supabase.from("data_import_files").select("import_job_id").eq("store_id", resolved.storeId).eq("checksum", fileChecksum).limit(1).maybeSingle();
  if (duplicate?.import_job_id) throw new Error("同じ内容のファイルはすでに取り込まれています。既存の取り込み詳細を確認してください。");
  const dataSourceId = await getOrCreateDataSource(supabase, resolved.organizationId, resolved.storeId, provider);

  const { data: job, error: jobError } = await supabase
    .from("data_import_jobs")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      data_source_id: dataSourceId,
      status: "mapping_required",
      import_type: parsed.importType,
      original_filename: file.name,
      encoding: parsed.encoding,
      delimiter: parsed.delimiter,
      header_row_number: 1,
      detected_columns: parsed.headers,
      mapping_status: "pending",
      item_matching_status: "pending",
      preview_rows: parsed.sampleRows,
      total_rows: parsed.rows.length,
      source_url: textValue(formData.get("source_url"), 2000)
    })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(`取り込みジョブを作成できませんでした: ${jobError?.message ?? "unknown error"}`);

  const safeFileName = buildImportStorageFileName(file.name, fileChecksum);
  const storagePath = `organizations/${resolved.organizationId}/stores/${resolved.storeId}/imports/${job.id}/${safeFileName}`;
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: true
  });
  if (uploadError) {
    await supabase.from("data_import_jobs").update({ status: "failed", error_message: uploadError.message }).eq("id", job.id);
    throw new Error(`元ファイルをStorageに保存できませんでした。import-files bucketを確認してください: ${uploadError.message}`);
  }

  const { error: fileRecordError } = await supabase.from("data_import_files").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    import_job_id: job.id,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    file_name: file.name,
    file_type: parsed.importType,
    mime_type: file.type || null,
    file_size: file.size,
    checksum: fileChecksum
  });
  if (fileRecordError) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    await supabase.from("data_import_jobs").update({ status: "failed", error_message: fileRecordError.message }).eq("id", job.id);
    throw new Error(`取り込みファイルの記録を保存できませんでした: ${fileRecordError.message}`);
  }

  const suggested = buildSuggestedMappings(parsed.headers);
  await supabase
    .from("data_column_mappings")
    .upsert(normalizeMappingRows(suggested, resolved.organizationId, resolved.storeId, dataSourceId, job.id), {
      onConflict: "store_id,import_job_id,source_column_name"
    });

  return job.id as string;
}

export async function uploadGoogleSheetFromForm(storeId: string, formData: FormData) {
  const source = textValue(formData.get("sheet_url"), 2000);
  if (!source) throw new Error("GoogleスプレッドシートのURLを入力してください。");
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("GoogleスプレッドシートのURLを確認してください。");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") throw new Error("docs.google.com のスプレッドシートURLだけ利用できます。");
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/u);
  if (!match) throw new Error("GoogleスプレッドシートIDをURLから確認できませんでした。");
  const gid = String(formData.get("sheet_gid") ?? url.searchParams.get("gid") ?? "0").replace(/\D/gu, "") || "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
  let response: Response;
  try {
    response = await fetch(exportUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new Error("Googleスプレッドシートを取得できませんでした。共有設定とネットワークを確認してください。");
  }
  if (!response.ok) throw new Error("スプレッドシートを取得できませんでした。『リンクを知っている全員が閲覧可』にしてから再実行してください。");
  const buffer = await response.arrayBuffer();
  const uploadForm = new FormData();
  uploadForm.set("provider_key", "google_sheets");
  uploadForm.set("source_url", source);
  uploadForm.set("file", new File([buffer], `google-sheet-${match[1].slice(0, 12)}-${gid}.csv`, { type: "text/csv" }));
  const jobId = await uploadImportFileFromForm(storeId, uploadForm);
  const supabase = createSupabaseAdminClient();
  if (supabase) await supabase.from("data_import_jobs").update({ import_type: "google_sheets", source_url: source }).eq("id", jobId);
  return jobId;
}

export async function saveMappingsFromForm(storeId: string, importJobId: string, formData: FormData) {
  const detail = await getImportJob(storeId, importJobId);
  if (!detail) throw new Error("取り込みジョブが見つかりません。");
  const store = await getStore(storeId);
  await assertImportWriteAccess(store);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");

  const mappings = detail.job.detected_columns.map((column, index) => ({
    organization_id: detail.job.organization_id,
    store_id: detail.job.store_id,
    data_source_id: detail.job.data_source_id,
    import_job_id: detail.job.id,
    source_column_name: column,
    source_column_index: index,
    target_field: String(formData.get(`target_field_${index}`) ?? "ignore") as StandardSalesField,
    confidence: detail.mappings.find((mapping) => mapping.source_column_name === column)?.confidence ?? null,
    is_required: ["sale_date", "item_name", "gross_amount"].includes(String(formData.get(`target_field_${index}`))),
    created_by: "user"
  }));
  for (const required of ["sale_date", "item_name", "gross_amount"] as const) {
    if (!mappings.some((mapping) => mapping.target_field === required)) throw new Error("売上日・商品名・合計の3項目は必ず対応付けてください。");
  }

  const { error } = await supabase
    .from("data_column_mappings")
    .upsert(mappings, { onConflict: "store_id,import_job_id,source_column_name" });
  if (error) throw new Error(`列マッピングを保存できませんでした: ${error.message}`);

  if (!detail.job.file) throw new Error("取り込み元ファイルが見つかりません。");
  const parsed = await parseStoredFile(supabase, detail.job.file);
  const normalizedRows = normalizeSalesRows(
    parsed.rows,
    mappings.map((mapping) => ({ ...mapping, id: `${mapping.source_column_index}` })) as DataColumnMapping[],
    detail.job.store_id,
    detail.job.data_source_id
  );

  await prepareImportItemMatches(supabase, detail.job, normalizedRows);

  await supabase
    .from("data_import_jobs")
    .update({
      mapping_status: "confirmed",
      status: "preview_ready",
      item_matching_status: "pending",
      normalized_preview: normalizedRows.slice(0, 20),
      updated_at: new Date().toISOString()
    })
    .eq("id", importJobId);
}

async function prepareImportItemMatches(supabase: SupabaseClient, job: DataImportJob, rows: NormalizedSalesPreviewRow[]) {
  const { data: items } = await supabase.from("items").select("id, name, sku, is_stock_managed").eq("store_id", job.store_id).is("archived_at", null);
  const unique = new Map<string, { name: string; code: string | null }>();
  for (const row of rows) {
    if (!row.item_name) continue;
    const key = sourceItemKey(row.item_name, row.item_code);
    if (!unique.has(key)) unique.set(key, { name: row.item_name, code: row.item_code });
  }
  const records = Array.from(unique.entries()).map(([key, source]) => {
    const code = normalizedItemText(source.code);
    const name = normalizedItemText(source.name);
    const exactCode = code ? (items ?? []).find((item) => normalizedItemText(item.sku) === code) : null;
    const exactName = (items ?? []).find((item) => normalizedItemText(item.name) === name);
    const partial = name ? (items ?? []).find((item) => normalizedItemText(item.name).includes(name) || name.includes(normalizedItemText(item.name))) : null;
    const suggested = exactCode ?? exactName ?? partial ?? null;
    return {
      organization_id: job.organization_id,
      store_id: job.store_id,
      import_job_id: job.id,
      source_item_key: key,
      source_item_name: source.name,
      source_item_code: source.code,
      suggested_item_id: suggested?.id ?? null,
      confirmed_item_id: null,
      status: "pending",
      confidence: exactCode ? 0.99 : exactName ? 0.95 : partial ? 0.65 : null,
      confirmed_by: null,
      confirmed_at: null,
      updated_at: new Date().toISOString()
    };
  });
  if (records.length > 0) {
    const { error } = await supabase.from("import_item_matches").upsert(records, { onConflict: "import_job_id,source_item_key" });
    if (error) throw new Error(`商品候補を準備できませんでした: ${error.message}`);
  }
}

export async function saveImportItemMatchesFromForm(storeId: string, importJobId: string, formData: FormData) {
  const store = await getStore(storeId);
  const access = await assertImportWriteAccess(store);
  const detail = await getImportJob(storeId, importJobId);
  if (!detail) throw new Error("取り込みジョブが見つかりません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const { data: validItems } = await supabase.from("items").select("id").eq("store_id", detail.job.store_id).is("archived_at", null);
  const validIds = new Set((validItems ?? []).map((item) => String(item.id)));
  for (const match of detail.itemMatches) {
    const choice = String(formData.get(`item_match_${match.id}`) ?? "");
    if (!choice) throw new Error("すべての商品について、登録済み商品か『在庫連動しない』を選択してください。");
    if (choice !== "ignore" && !validIds.has(choice)) throw new Error("選択した商品を確認できませんでした。");
    const { error } = await supabase.from("import_item_matches").update({
      confirmed_item_id: choice === "ignore" ? null : choice,
      status: choice === "ignore" ? "ignored" : "confirmed",
      confirmed_by: access.userId,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", match.id).eq("store_id", detail.job.store_id);
    if (error) throw new Error(`商品対応を保存できませんでした: ${error.message}`);
  }
  await supabase.from("data_import_jobs").update({ item_matching_status: "confirmed", updated_at: new Date().toISOString() }).eq("id", importJobId);
}

async function parseStoredFile(supabase: SupabaseClient, file: DataImportFile) {
  const { data, error } = await supabase.storage.from(file.storage_bucket).download(file.storage_path);
  if (error || !data) throw new Error(`Storageから元ファイルを取得できませんでした: ${error?.message ?? "unknown error"}`);
  return parseImportFile(file.file_name, await data.arrayBuffer());
}

function businessDate(isoDate: string) {
  return isoDate.slice(0, 10);
}

export async function executeImportJob(storeId: string, importJobId: string, options: { retryErrorsOnly?: boolean } = {}) {
  const store = await getStore(storeId);
  await assertImportWriteAccess(store);
  const detail = await getImportJob(storeId, importJobId);
  if (!detail?.job.file) throw new Error("取り込み元ファイルが見つかりません。");
  if (detail.mappings.length === 0) throw new Error("列マッピングを保存してから取り込みを実行してください。");
  if (detail.job.item_matching_status !== "confirmed" || detail.itemMatches.some((match) => match.status === "pending")) {
    throw new Error("商品と在庫の対応をすべて確認してから取り込みを実行してください。");
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  await supabase.from("data_import_jobs").update({ status: "importing", started_at: new Date().toISOString() }).eq("id", importJobId);
  try {
    const { data: retryErrorRows } = options.retryErrorsOnly
      ? await supabase.from("import_error_rows").select("row_number").eq("import_job_id", importJobId)
      : { data: null };
    const retryRows = options.retryErrorsOnly ? new Set((retryErrorRows ?? []).map((row) => Number(row.row_number))) : null;
    await supabase.from("import_error_rows").delete().eq("import_job_id", importJobId);

  const parsed = await parseStoredFile(supabase, detail.job.file);
  const allRows = normalizeSalesRows(parsed.rows, detail.mappings, detail.job.store_id, detail.job.data_source_id);
  const normalizedRows = retryRows ? allRows.filter((row) => retryRows.has(row.rowNumber)) : allRows;
  if (retryRows && normalizedRows.length === 0) throw new Error("再実行するエラー行がありません。");
  const { count: existingSuccess } = await supabase.from("sales_transactions").select("id", { count: "exact", head: true }).eq("import_job_id", importJobId);
  let successRows = options.retryErrorsOnly ? Number(detail.job.success_rows ?? existingSuccess ?? 0) : 0;
  let errorRows = 0;
  const matchByKey = new Map(detail.itemMatches.map((match) => [match.source_item_key, match]));
  const confirmedIds = detail.itemMatches.map((match) => match.confirmed_item_id).filter(Boolean) as string[];
  const { data: matchedItems } = confirmedIds.length > 0
    ? await supabase.from("items").select("id, is_stock_managed").eq("store_id", detail.job.store_id).in("id", confirmedIds)
    : { data: [] };
  const stockManagedIds = new Set((matchedItems ?? []).filter((item) => item.is_stock_managed).map((item) => String(item.id)));

  for (const group of groupNormalizedSalesRows(normalizedRows)) {
    const invalidRows = group.filter((row) => row.errors.length > 0 || !row.sale_date || !row.item_name);
    if (invalidRows.length > 0) {
      errorRows += group.length;
      await supabase.from("import_error_rows").insert(group.map((row) => ({
        organization_id: detail.job.organization_id, store_id: detail.job.store_id, import_job_id: detail.job.id,
        row_number: row.rowNumber, raw_row: parsed.rows[row.rowNumber - 2] ?? {}, error_code: "validation_error",
        error_message: row.errors.join(" / ") || "同じ会計IDの明細に必須項目の不足があります。", suggested_fix: {}
      })));
      continue;
    }
    const first = group[0];
    const groupHash = createHash("sha256").update(group.map((row) => row.source_row_hash).sort().join(":"), "utf8").digest("hex");
    const grossAmount = group.reduce((sum, row) => sum + row.gross_amount, 0);
    const discountAmount = group.reduce((sum, row) => sum + row.discount_amount, 0);
    const taxAmount = group.reduce((sum, row) => sum + row.tax_amount, 0);
    const matches = group.map((row) => ({ row, match: matchByKey.get(sourceItemKey(row.item_name ?? "", row.item_code)) }));
    if (matches.some(({ match }) => !match || match.status === "pending")) {
      errorRows += group.length;
      await supabase.from("import_error_rows").insert(group.map((row) => ({ organization_id: detail.job.organization_id, store_id: detail.job.store_id, import_job_id: detail.job.id, row_number: row.rowNumber, raw_row: parsed.rows[row.rowNumber - 2] ?? {}, error_code: "item_match_required", error_message: "商品の対応確認が必要です。", suggested_fix: {} })));
      continue;
    }
    const { data: transaction, error } = await supabase
      .from("sales_transactions")
      .insert({
        organization_id: detail.job.organization_id,
        store_id: detail.job.store_id,
        data_source_id: detail.job.data_source_id,
        import_job_id: detail.job.id,
        external_transaction_id: first.transaction_id,
        source_row_hash: groupHash,
        transaction_date: first.sale_date,
        business_date: businessDate(first.sale_date ?? ""),
        customer_name: group.map((row) => row.customer_name).find(Boolean) ?? null,
        payment_method: group.map((row) => row.payment_method).find(Boolean) ?? null,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        net_amount: grossAmount - taxAmount,
        currency: "JPY",
        channel: group.map((row) => row.channel).find(Boolean) ?? null,
        source_metadata: { row_numbers: group.map((row) => row.rowNumber), memos: group.map((row) => row.memo).filter(Boolean) }
      })
      .select("id")
      .single();

    if (error || !transaction) {
      errorRows += group.length;
      await supabase.from("import_error_rows").insert(group.map((row) => ({
        organization_id: detail.job.organization_id, store_id: detail.job.store_id, import_job_id: detail.job.id,
        row_number: row.rowNumber, raw_row: parsed.rows[row.rowNumber - 2] ?? {},
        error_code: error?.code === "23505" ? "duplicate_row" : "insert_error",
        error_message: error?.code === "23505" ? "重複する会計としてスキップしました。" : error?.message ?? "保存できませんでした。", suggested_fix: {}
      })));
      continue;
    }
    const { error: itemError } = await supabase.from("sales_transaction_items").insert(matches.map(({ row, match }) => ({
      organization_id: detail.job.organization_id, store_id: detail.job.store_id, sales_transaction_id: transaction.id,
      item_id: match?.confirmed_item_id ?? null, item_match_status: match?.status ?? "unmatched",
      external_item_id: row.item_code, item_name: row.item_name, category_name: row.category_name,
      quantity: row.quantity, unit_price: row.unit_price, discount_amount: row.discount_amount,
      tax_amount: row.tax_amount, total_amount: row.gross_amount, source_metadata: { source_row_hash: row.source_row_hash }
    })));
    if (itemError) {
      await supabase.from("sales_transactions").delete().eq("id", transaction.id);
      errorRows += group.length;
      await supabase.from("import_error_rows").insert(group.map((row) => ({ organization_id: detail.job.organization_id, store_id: detail.job.store_id, import_job_id: detail.job.id, row_number: row.rowNumber, raw_row: parsed.rows[row.rowNumber - 2] ?? {}, error_code: "item_insert_error", error_message: itemError.message, suggested_fix: {} })));
      continue;
    }
    let inventoryMessage: string | null = null;
    for (const { row, match } of matches) if (match?.confirmed_item_id && stockManagedIds.has(match.confirmed_item_id)) {
      try {
        await applyImportedSaleInventory({ storeId, itemId: match.confirmed_item_id, transactionId: transaction.id, rowHash: row.source_row_hash, quantity: row.quantity, itemName: row.item_name ?? "商品" });
      } catch (inventoryError) {
        inventoryMessage = inventoryError instanceof Error ? inventoryError.message : "在庫へ反映できませんでした。";
        break;
      }
    }
    if (inventoryMessage) {
      errorRows += group.length;
      await supabase.from("import_error_rows").insert(group.map((row) => ({ organization_id: detail.job.organization_id, store_id: detail.job.store_id, import_job_id: detail.job.id, row_number: row.rowNumber, raw_row: parsed.rows[row.rowNumber - 2] ?? {}, error_code: "inventory_sync_error", error_message: inventoryMessage, suggested_fix: {} })));
      continue;
    }
    successRows += group.length;
  }

  const status = errorRows > 0 && successRows > 0 ? "partial_failed" : errorRows > 0 ? "failed" : "completed";
  await supabase
    .from("data_import_jobs")
    .update({
      status,
      total_rows: allRows.length,
      success_rows: successRows,
      error_rows: errorRows,
      error_message: null,
      completed_at: new Date().toISOString(),
      normalized_preview: normalizedRows.slice(0, 20),
      updated_at: new Date().toISOString()
    })
    .eq("id", importJobId);

    await rebuildSalesSummaries(supabase, detail.job.organization_id, detail.job.store_id);
    await generateDemandActionPlan(storeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取り込み処理に失敗しました。";
    await supabase.from("data_import_jobs").update({ status: "failed", error_message: message.slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", importJobId);
    throw error;
  }
}

function buildSalesSummaryRows(
  organizationId: string,
  storeId: string,
  transactions: Array<Record<string, unknown>>,
  items: Array<Record<string, unknown>>
) {
  const summaries = new Map<string, Record<string, unknown>>();
  for (const transaction of transactions) {
    const date = String(transaction.business_date);
    const month = date.slice(0, 7);
    const payment = String(transaction.payment_method ?? "未設定");
    const amount = Number(transaction.gross_amount ?? 0);
    const keys = [
      `daily:${date}`,
      `monthly:${month}`,
      `payment_method:${payment}`
    ];
    for (const key of keys) {
      const [type, label] = key.split(":");
      const current = summaries.get(key) ?? {
        organization_id: organizationId,
        store_id: storeId,
        summary_type: type,
        summary_date: type === "daily" ? label : null,
        summary_month: type === "monthly" ? label : null,
        payment_method: type === "payment_method" ? label : null,
        transaction_count: 0,
        quantity: 0,
        gross_amount: 0,
        discount_amount: 0,
        tax_amount: 0,
        net_amount: 0,
        metadata: {}
      };
      current.transaction_count = Number(current.transaction_count) + 1;
      current.gross_amount = Number(current.gross_amount) + amount;
      current.discount_amount = Number(current.discount_amount) + Number(transaction.discount_amount ?? 0);
      current.tax_amount = Number(current.tax_amount) + Number(transaction.tax_amount ?? 0);
      current.net_amount = Number(current.net_amount) + Number(transaction.net_amount ?? 0);
      summaries.set(key, current);
    }
  }

  for (const item of items) {
    const name = String(item.item_name ?? "未設定");
    const key = `item:${name}`;
    const current = summaries.get(key) ?? {
      organization_id: organizationId,
      store_id: storeId,
      summary_type: "item",
      item_name: name,
      category_name: item.category_name ?? null,
      transaction_count: 0,
      quantity: 0,
      gross_amount: 0,
      discount_amount: 0,
      tax_amount: 0,
      net_amount: 0,
      metadata: {}
    };
    current.transaction_count = Number(current.transaction_count) + 1;
    current.quantity = Number(current.quantity) + Number(item.quantity ?? 0);
    current.gross_amount = Number(current.gross_amount) + Number(item.total_amount ?? 0);
    current.discount_amount = Number(current.discount_amount) + Number(item.discount_amount ?? 0);
    current.tax_amount = Number(current.tax_amount) + Number(item.tax_amount ?? 0);
    current.net_amount = Number(current.net_amount) + Number(item.total_amount ?? 0) - Number(item.tax_amount ?? 0);
    summaries.set(key, current);
  }

  return Array.from(summaries.values());
}

export async function rebuildSalesSummaries(supabase: SupabaseClient, organizationId: string, storeId: string) {
  const [{ data: transactions, error: transactionError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from("sales_transactions").select("*").eq("store_id", storeId),
    supabase.from("sales_transaction_items").select("*").eq("store_id", storeId)
  ]);
  if (transactionError || itemError) {
    throw new Error(`売上集計の元データを取得できませんでした: ${transactionError?.message ?? itemError?.message}`);
  }
  const rows = buildSalesSummaryRows(organizationId, storeId, transactions ?? [], items ?? []);
  const { error: deleteError } = await supabase.from("normalized_sales_summaries").delete().eq("store_id", storeId);
  if (deleteError) throw new Error(`以前の売上集計を更新できませんでした: ${deleteError.message}`);
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("normalized_sales_summaries").insert(rows);
    if (insertError) throw new Error(`売上集計を保存できませんでした: ${insertError.message}`);
  }
}

export async function listSalesTransactions(storeId: string): Promise<SalesTransactionListRow[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase
    .from("sales_transactions")
    .select("*, data_source:external_data_sources(name, provider_key), items:sales_transaction_items(item_name, quantity, total_amount)")
    .eq("store_id", resolved.storeId)
    .order("business_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as SalesTransactionListRow[];
}

function emptyReport(): SalesReport {
  return {
    totalSales: 0,
    transactionCount: 0,
    averageTransactionAmount: 0,
    daily: [],
    monthly: [],
    items: [],
    paymentMethods: []
  };
}

export async function getSalesReport(storeId: string): Promise<SalesReport> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return emptyReport();
  const resolved = await resolveStoreForRead(supabase, storeId);
  const [{ data, error: summaryError }, { data: transactionRows, count: storedTransactionCount, error: transactionError }] = await Promise.all([
    supabase.from("normalized_sales_summaries").select("*").eq("store_id", resolved.storeId),
    supabase.from("sales_transactions").select("organization_id", { count: "exact" }).eq("store_id", resolved.storeId).limit(1)
  ]);
  if (summaryError || transactionError) {
    throw new Error(`売上レポートを取得できませんでした: ${summaryError?.message ?? transactionError?.message}`);
  }
  let summaries = data ?? [];
  const summarizedTransactionCount = summaries
    .filter((row) => row.summary_type === "monthly")
    .reduce((sum, row) => sum + Number(row.transaction_count ?? 0), 0);
  const actualTransactionCount = storedTransactionCount ?? 0;
  const organizationId = String(transactionRows?.[0]?.organization_id ?? resolved.organizationId ?? "");

  // Older unified imports saved the transaction details without rebuilding this
  // derived cache. Detect that condition on read so existing production data is
  // repaired automatically, while the normal import path keeps it current.
  if (organizationId && summarizedTransactionCount !== actualTransactionCount) {
    await rebuildSalesSummaries(supabase, organizationId, resolved.storeId);
    const { data: refreshed, error: refreshError } = await supabase
      .from("normalized_sales_summaries")
      .select("*")
      .eq("store_id", resolved.storeId);
    if (refreshError) throw new Error(`更新した売上レポートを取得できませんでした: ${refreshError.message}`);
    summaries = refreshed ?? [];
  }
  if (!summaries.some((row) => row.summary_type === "monthly")) {
    const [{ data: transactions, error: fallbackTransactionError }, { data: items, error: fallbackItemError }] = await Promise.all([
      supabase.from("sales_transactions").select("*").eq("store_id", resolved.storeId),
      supabase.from("sales_transaction_items").select("*").eq("store_id", resolved.storeId)
    ]);
    if (fallbackTransactionError || fallbackItemError) {
      throw new Error(`売上明細からレポートを作成できませんでした: ${fallbackTransactionError?.message ?? fallbackItemError?.message}`);
    }
    if ((transactions ?? []).length > 0) {
      const fallbackOrganizationId = String(transactions?.[0]?.organization_id ?? organizationId);
      summaries = buildSalesSummaryRows(fallbackOrganizationId, resolved.storeId, transactions ?? [], items ?? []);
    }
  }
  const monthly = summaries.filter((row) => row.summary_type === "monthly");
  const totalSales = monthly.reduce((sum, row) => sum + Number(row.gross_amount ?? 0), 0);
  const transactionCount = monthly.reduce((sum, row) => sum + Number(row.transaction_count ?? 0), 0);

  return {
    totalSales,
    transactionCount,
    averageTransactionAmount: transactionCount > 0 ? totalSales / transactionCount : 0,
    daily: summaries
      .filter((row) => row.summary_type === "daily")
      .sort((a, b) => String(a.summary_date).localeCompare(String(b.summary_date)))
      .map((row) => ({ label: String(row.summary_date), amount: Number(row.gross_amount ?? 0), count: Number(row.transaction_count ?? 0) })),
    monthly: monthly
      .sort((a, b) => String(a.summary_month).localeCompare(String(b.summary_month)))
      .map((row) => ({ label: String(row.summary_month), amount: Number(row.gross_amount ?? 0), count: Number(row.transaction_count ?? 0) })),
    items: summaries
      .filter((row) => row.summary_type === "item")
      .sort((a, b) => Number(b.gross_amount ?? 0) - Number(a.gross_amount ?? 0))
      .map((row) => ({ label: String(row.item_name), amount: Number(row.gross_amount ?? 0), quantity: Number(row.quantity ?? 0) })),
    paymentMethods: summaries
      .filter((row) => row.summary_type === "payment_method")
      .sort((a, b) => Number(b.gross_amount ?? 0) - Number(a.gross_amount ?? 0))
      .map((row) => ({ label: String(row.payment_method), amount: Number(row.gross_amount ?? 0), count: Number(row.transaction_count ?? 0) }))
  };
}
