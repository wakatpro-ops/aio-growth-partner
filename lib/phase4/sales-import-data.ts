import "server-only";
import { createHash } from "node:crypto";
import { buildSuggestedMappings, normalizeSalesRows, parseImportFile } from "@/lib/phase4/import-parser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type {
  DataColumnMapping,
  DataImportFile,
  DataImportJob,
  ImportProviderKey,
  NormalizedSalesPreviewRow,
  ParsedSalesRow,
  SalesReport,
  SalesTransactionListRow,
  StandardSalesField
} from "@/types/phase4";

const storageBucket = "import-files";

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
  return ensureDemoPersistence(supabase, storeId);
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
    .single();
  if (!job) return null;

  const [{ data: file }, { data: mappings }, { data: errors }] = await Promise.all([
    supabase.from("data_import_files").select("*").eq("import_job_id", importJobId).maybeSingle(),
    supabase.from("data_column_mappings").select("*").eq("import_job_id", importJobId).order("source_column_index"),
    supabase.from("import_error_rows").select("*").eq("import_job_id", importJobId).order("row_number").limit(50)
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
    errors: errors ?? []
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
    throw new Error("CSVまたはExcelファイルを選択してください。");
  }

  const provider = String(formData.get("provider_key") ?? (file.name.toLowerCase().endsWith(".csv") ? "manual_csv" : "manual_excel")) as ImportProviderKey;
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await resolveStoreForWrite(supabase, store);
  if (!resolved.organizationId) throw new Error("組織情報を解決できませんでした。");

  const buffer = await file.arrayBuffer();
  const parsed = await parseImportFile(file.name, buffer);
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
      preview_rows: parsed.sampleRows,
      total_rows: parsed.rows.length
    })
    .select("id")
    .single();

  if (jobError || !job) throw new Error(`取り込みジョブを作成できませんでした: ${jobError?.message ?? "unknown error"}`);

  const storagePath = `organizations/${resolved.organizationId}/stores/${resolved.storeId}/imports/${job.id}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from(storageBucket).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: true
  });
  if (uploadError) {
    await supabase.from("data_import_jobs").update({ status: "failed", error_message: uploadError.message }).eq("id", job.id);
    throw new Error(`元ファイルをStorageに保存できませんでした。import-files bucketを確認してください: ${uploadError.message}`);
  }

  await supabase.from("data_import_files").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    import_job_id: job.id,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    file_name: file.name,
    file_type: parsed.importType,
    mime_type: file.type || null,
    file_size: file.size,
    checksum: checksum(buffer)
  });

  const suggested = buildSuggestedMappings(parsed.headers);
  await supabase
    .from("data_column_mappings")
    .upsert(normalizeMappingRows(suggested, resolved.organizationId, resolved.storeId, dataSourceId, job.id), {
      onConflict: "store_id,import_job_id,source_column_name"
    });

  return job.id as string;
}

export async function saveMappingsFromForm(storeId: string, importJobId: string, formData: FormData) {
  const detail = await getImportJob(storeId, importJobId);
  if (!detail) throw new Error("取り込みジョブが見つかりません。");
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

  const { error } = await supabase
    .from("data_column_mappings")
    .upsert(mappings, { onConflict: "store_id,import_job_id,source_column_name" });
  if (error) throw new Error(`列マッピングを保存できませんでした: ${error.message}`);

  const normalizedPreview = normalizeSalesRows(
    detail.job.preview_rows,
    mappings.map((mapping) => ({ ...mapping, id: `${mapping.source_column_index}` })) as DataColumnMapping[],
    detail.job.store_id,
    detail.job.data_source_id
  );

  await supabase
    .from("data_import_jobs")
    .update({
      mapping_status: "confirmed",
      status: "preview_ready",
      normalized_preview: normalizedPreview,
      updated_at: new Date().toISOString()
    })
    .eq("id", importJobId);
}

async function parseStoredFile(supabase: SupabaseClient, file: DataImportFile) {
  const { data, error } = await supabase.storage.from(file.storage_bucket).download(file.storage_path);
  if (error || !data) throw new Error(`Storageから元ファイルを取得できませんでした: ${error?.message ?? "unknown error"}`);
  return parseImportFile(file.file_name, await data.arrayBuffer());
}

function businessDate(isoDate: string) {
  return isoDate.slice(0, 10);
}

export async function executeImportJob(storeId: string, importJobId: string) {
  const detail = await getImportJob(storeId, importJobId);
  if (!detail?.job.file) throw new Error("取り込み元ファイルが見つかりません。");
  if (detail.mappings.length === 0) throw new Error("列マッピングを保存してから取り込みを実行してください。");

  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  await supabase.from("data_import_jobs").update({ status: "importing", started_at: new Date().toISOString() }).eq("id", importJobId);
  await supabase.from("import_error_rows").delete().eq("import_job_id", importJobId);

  const parsed = await parseStoredFile(supabase, detail.job.file);
  const normalizedRows = normalizeSalesRows(parsed.rows, detail.mappings, detail.job.store_id, detail.job.data_source_id);
  let successRows = 0;
  let errorRows = 0;

  for (const row of normalizedRows) {
    if (row.errors.length > 0 || !row.sale_date || !row.item_name) {
      errorRows += 1;
      await supabase.from("import_error_rows").insert({
        organization_id: detail.job.organization_id,
        store_id: detail.job.store_id,
        import_job_id: detail.job.id,
        row_number: row.rowNumber,
        raw_row: parsed.rows[row.rowNumber - 2] ?? {},
        error_code: "validation_error",
        error_message: row.errors.join(" / "),
        suggested_fix: {}
      });
      continue;
    }

    const { data: transaction, error } = await supabase
      .from("sales_transactions")
      .insert({
        organization_id: detail.job.organization_id,
        store_id: detail.job.store_id,
        data_source_id: detail.job.data_source_id,
        import_job_id: detail.job.id,
        external_transaction_id: row.transaction_id,
        source_row_hash: row.source_row_hash,
        transaction_date: row.sale_date,
        business_date: businessDate(row.sale_date),
        customer_name: row.customer_name,
        payment_method: row.payment_method,
        gross_amount: row.gross_amount,
        discount_amount: row.discount_amount,
        tax_amount: row.tax_amount,
        net_amount: row.gross_amount - row.tax_amount,
        currency: "JPY",
        channel: row.channel,
        source_metadata: { memo: row.memo, raw_row: parsed.rows[row.rowNumber - 2] ?? {} }
      })
      .select("id")
      .single();

    if (error || !transaction) {
      errorRows += 1;
      await supabase.from("import_error_rows").insert({
        organization_id: detail.job.organization_id,
        store_id: detail.job.store_id,
        import_job_id: detail.job.id,
        row_number: row.rowNumber,
        raw_row: parsed.rows[row.rowNumber - 2] ?? {},
        error_code: error?.code === "23505" ? "duplicate_row" : "insert_error",
        error_message: error?.code === "23505" ? "重複行としてスキップしました。" : error?.message ?? "保存できませんでした。",
        suggested_fix: {}
      });
      continue;
    }

    await supabase.from("sales_transaction_items").insert({
      organization_id: detail.job.organization_id,
      store_id: detail.job.store_id,
      sales_transaction_id: transaction.id,
      external_item_id: row.item_code,
      item_name: row.item_name,
      category_name: row.category_name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount_amount: row.discount_amount,
      tax_amount: row.tax_amount,
      total_amount: row.gross_amount,
      source_metadata: { source_row_hash: row.source_row_hash }
    });
    successRows += 1;
  }

  const status = errorRows > 0 && successRows > 0 ? "partial_failed" : errorRows > 0 ? "failed" : "completed";
  await supabase
    .from("data_import_jobs")
    .update({
      status,
      total_rows: normalizedRows.length,
      success_rows: successRows,
      error_rows: errorRows,
      completed_at: new Date().toISOString(),
      normalized_preview: normalizedRows.slice(0, 20),
      updated_at: new Date().toISOString()
    })
    .eq("id", importJobId);

  await rebuildSalesSummaries(supabase, detail.job.organization_id, detail.job.store_id);
}

async function rebuildSalesSummaries(supabase: SupabaseClient, organizationId: string, storeId: string) {
  const [{ data: transactions }, { data: items }] = await Promise.all([
    supabase.from("sales_transactions").select("*").eq("store_id", storeId),
    supabase.from("sales_transaction_items").select("*").eq("store_id", storeId)
  ]);
  await supabase.from("normalized_sales_summaries").delete().eq("store_id", storeId);

  const summaries = new Map<string, Record<string, unknown>>();
  for (const transaction of transactions ?? []) {
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

  for (const item of items ?? []) {
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

  const rows = Array.from(summaries.values());
  if (rows.length > 0) await supabase.from("normalized_sales_summaries").insert(rows);
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
  const { data } = await supabase.from("normalized_sales_summaries").select("*").eq("store_id", resolved.storeId);
  const summaries = data ?? [];
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
