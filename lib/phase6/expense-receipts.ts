import "server-only";
import crypto from "node:crypto";
import OpenAI from "openai";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { buildTaxBreakdown, lowConfidenceFields, normalizeInvoiceRegistrationNumber, normalizeTaxRate, receiptContentFingerprint, receiptDraftFromForm, receiptNumber, validateReceiptForApproval, type ReceiptLine, type ReceiptReviewDraft } from "@/lib/phase6/receipt-review";

const demoStoreIds: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000101" },
  "store-auto-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000102" }
};

type ReceiptAiResult = {
  vendor_name?: string | null; receipt_date?: string | null; payment_method?: string | null; category_name?: string | null;
  invoice_registration_number?: string | null; subtotal_amount?: number | string | null; tax_amount?: number | string | null;
  total_amount?: number | string | null; tax_rate?: string | null;
  items?: Array<{ name?: string; quantity?: number | string; amount?: number | string; tax_rate?: string; tax_amount?: number | string; confidence?: number }>;
  tax_breakdown?: Array<{ rate?: string; amount?: number | string; tax_amount?: number | string }>;
  field_confidence?: Record<string, number>; page_count?: number; summary?: string | null; freee_memo?: string | null;
};
type ReceiptAnalysis = { status: "success" | "fallback"; model: string; result: ReceiptAiResult; tokens?: unknown; error: string | null; pageCount: number };

async function resolveStore(storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return { organizationId: demo?.organizationId ?? store.organization_id, storeId: demo?.storeId ?? store.id, publicStoreId: store.id, store };
}

async function requireReceiptEditor(organizationId: string, storeId: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const role = access.organizationRoles[organizationId] ?? access.storeRoles[storeId];
  if (!access.isPlatformAdmin && !["org_owner", "store_manager", "staff"].includes(role)) throw new Error("経費レシートを変更する権限がありません。");
  return access;
}

function toDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value.replace(/[年月.]/g, "-").replace(/日/g, "").trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function safeJsonParse(value: string): ReceiptAiResult {
  try { return JSON.parse(value) as ReceiptAiResult; } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]) as ReceiptAiResult; } catch { return {}; }
  }
}

function normalizeAiItems(items: ReceiptAiResult["items"]): ReceiptLine[] {
  return (Array.isArray(items) ? items : []).map((item) => ({
    name: String(item.name ?? "").trim().slice(0, 200), quantity: Math.max(0, receiptNumber(item.quantity) || 1),
    amount: Math.max(0, receiptNumber(item.amount)), tax_rate: normalizeTaxRate(item.tax_rate), tax_amount: Math.max(0, receiptNumber(item.tax_amount)),
    confidence: typeof item.confidence === "number" ? item.confidence : null
  })).filter((item) => item.name || item.amount > 0);
}

async function pdfText(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pageCount = Number((result as { total?: number }).total ?? result.pages?.length ?? 1);
    return { text: result.text.trim().slice(0, 80000), pageCount: Math.max(1, pageCount) };
  } finally { await parser.destroy(); }
}

async function analyzeReceipt(fileBuffer: Buffer, mimeType: string, storeName: string): Promise<ReceiptAnalysis> {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  let extractedPdf: { text: string; pageCount: number } | null = null;
  if (mimeType === "application/pdf") {
    try { extractedPdf = await pdfText(fileBuffer); } catch {
      return { status: "fallback", model, result: { summary: "PDFを保存しました。文字を読み取れなかったため、内容を入力して承認してください。" }, error: "PDF text extraction failed", pageCount: 1 };
    }
  }
  if (!mimeType.startsWith("image/") && !extractedPdf) return { status: "fallback", model, result: { summary: "ファイルを保存しました。内容を入力して承認してください。" }, error: "Unsupported receipt file type", pageCount: 1 };
  if (!process.env.OPENAI_API_KEY) return { status: "fallback", model, result: { summary: "ファイルを保存しました。内容を入力して承認してください。" }, error: "OPENAI_API_KEY is not configured", pageCount: extractedPdf?.pageCount ?? 1 };

  const instructions = [
    `店舗名: ${storeName}`,
    "伝票・レシートから vendor_name, receipt_date, payment_method, category_name, invoice_registration_number, subtotal_amount, tax_amount, total_amount, tax_rate, items, tax_breakdown, field_confidence, summary, freee_memo をJSONで返してください。",
    "itemsは name, quantity, amount, tax_rate, tax_amount, confidence を含めます。tax_breakdownは税率8/10/0ごとの税込対象額と税額です。",
    "field_confidenceは各主要項目を0から1で表します。読み取れない値はnull、推測値は低い信頼度にします。登録番号はT+13桁だけを返します。",
    "外部送信はせず、人が編集・承認する会計入力候補だけを作ってください。"
  ].join("\n");
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = extractedPdf
    ? [{ type: "text", text: `${instructions}\n\nPDF抽出本文（全${extractedPdf.pageCount}ページ）:\n${extractedPdf.text || "文字を抽出できませんでした"}` }]
    : [{ type: "text", text: instructions }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${fileBuffer.toString("base64")}` } }];
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
    model, response_format: { type: "json_object" }, messages: [
      { role: "system", content: "あなたは日本の店舗会計の入力補助です。複数ページ・複数税率を保ったJSONだけを返してください。" },
      { role: "user", content }
    ]
  });
  return { status: "success", model, result: safeJsonParse(response.choices[0]?.message?.content ?? "{}"), tokens: response.usage ?? null, error: null, pageCount: extractedPdf?.pageCount ?? 1 };
}

function analysisValues(ai: ReceiptAnalysis) {
  const result = ai.result;
  const items = normalizeAiItems(result.items);
  const receiptDate = toDate(result.receipt_date);
  const totalAmount = receiptNumber(result.total_amount);
  const taxAmount = receiptNumber(result.tax_amount);
  const taxRate = normalizeTaxRate(result.tax_rate);
  const confidence = result.field_confidence && typeof result.field_confidence === "object" ? result.field_confidence : {};
  const needsReview = !result.vendor_name || !receiptDate || totalAmount <= 0 || lowConfidenceFields(confidence).length > 0;
  const taxBreakdown = Array.isArray(result.tax_breakdown) && result.tax_breakdown.length > 0
    ? result.tax_breakdown.map((row) => ({ rate: normalizeTaxRate(row.rate), amount: receiptNumber(row.amount), tax_amount: receiptNumber(row.tax_amount) }))
    : buildTaxBreakdown(items, taxRate, taxAmount);
  return {
    status: needsReview ? "needs_review" : "analyzed", vendor_name: result.vendor_name ?? null, receipt_date: receiptDate,
    payment_method: result.payment_method ?? null, category_name: result.category_name ?? null,
    invoice_registration_number: normalizeInvoiceRegistrationNumber(result.invoice_registration_number) || null,
    subtotal_amount: receiptNumber(result.subtotal_amount), tax_amount: taxAmount, total_amount: totalAmount, tax_rate: taxRate || null,
    extracted_items: items, tax_breakdown: taxBreakdown, field_confidence: confidence,
    page_count: Math.max(1, Number(result.page_count ?? ai.pageCount ?? 1)), ai_summary: result.summary ?? result.freee_memo ?? null,
    ai_model: ai.model, ai_analysis_status: ai.status, ai_analysis_error: ai.error
  };
}

function payloadForDraft(draft: ReceiptReviewDraft, integration: { external_company_id?: string | null; office_name?: string | null } | null) {
  return { provider: "freee", mode: "review_before_send", company_id: integration?.external_company_id ?? null, office_name: integration?.office_name ?? null,
    issue_date: draft.receiptDate, ref_number: draft.invoiceRegistrationNumber || null, partner_name: draft.vendorName || null,
    amount: draft.totalAmount, tax_amount: draft.taxAmount, tax_rate: draft.taxRate || null, description: draft.summary || "レシートから作成した経費候補",
    category_name: draft.categoryName || null, items: draft.items, tax_breakdown: buildTaxBreakdown(draft.items, draft.taxRate, draft.taxAmount) };
}

export async function listExpenseReceipts(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(storeId);
  const { data } = await supabase.from("expense_receipts").select("*").eq("store_id", resolved.storeId).is("archived_at", null).order("created_at", { ascending: false }).limit(100);
  return data ?? [];
}

export async function getExpenseReceipt(storeId: string, receiptId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(storeId);
  const { data } = await supabase.from("expense_receipts").select("*").eq("store_id", resolved.storeId).eq("id", receiptId).is("archived_at", null).maybeSingle();
  if (!data) return null;
  const { data: signed } = data.storage_path ? await supabase.storage.from(data.storage_bucket || "receipt-files").createSignedUrl(data.storage_path, 600) : { data: null };
  const { data: duplicates } = data.content_fingerprint ? await supabase.from("expense_receipts").select("id, original_file_name, created_at, approval_status, freee_status").eq("store_id", resolved.storeId).eq("content_fingerprint", data.content_fingerprint).neq("id", data.id).is("archived_at", null).limit(10) : { data: [] };
  return { ...data, preview_url: signed?.signedUrl ?? null, possible_duplicates: duplicates ?? [] };
}

export async function createReceiptFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("保存の準備ができていません。時間をおいて再度お試しください。");
  const resolved = await resolveStore(storeId);
  const access = await requireReceiptEditor(resolved.organizationId, resolved.publicStoreId);
  const file = formData.get("receipt_file");
  if (!(file instanceof File) || file.size === 0) throw new Error("レシート画像またはPDFを選択してください。");
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) throw new Error("JPG、PNG、WebP、PDFのいずれかを選択してください。");
  if (file.size > 10 * 1024 * 1024) throw new Error("ファイルサイズは10MB以内にしてください。");
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const fileSha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const { data: existing } = await supabase.from("expense_receipts").select("id").eq("store_id", resolved.storeId).eq("file_sha256", fileSha256).is("archived_at", null).maybeSingle();
  if (existing?.id) return { receiptId: String(existing.id), duplicate: true };

  const fileExt = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "jpg";
  const storagePath = `${resolved.storeId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${fileExt}`;
  const { error: uploadError } = await supabase.storage.from("receipt-files").upload(storagePath, fileBuffer, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(`レシート画像を保存できませんでした: ${uploadError.message}`);
  try {
    const integrationResult = await supabase.from("store_accounting_integrations").select("id, external_company_id, office_name").eq("store_id", resolved.storeId).eq("provider", "freee").maybeSingle();
    const ai = await analyzeReceipt(fileBuffer, file.type, resolved.store.name);
    const values = analysisValues(ai);
    const draft: ReceiptReviewDraft = { vendorName: String(values.vendor_name ?? ""), receiptDate: String(values.receipt_date ?? ""), paymentMethod: String(values.payment_method ?? ""), categoryName: String(values.category_name ?? ""), invoiceRegistrationNumber: String(values.invoice_registration_number ?? ""), subtotalAmount: Number(values.subtotal_amount), taxAmount: Number(values.tax_amount), totalAmount: Number(values.total_amount), taxRate: String(values.tax_rate ?? ""), summary: String(values.ai_summary ?? ""), reviewNotes: "", items: values.extracted_items };
    const fingerprint = receiptContentFingerprint({ vendorName: draft.vendorName, receiptDate: draft.receiptDate, totalAmount: draft.totalAmount, invoiceRegistrationNumber: draft.invoiceRegistrationNumber });
    const { data: similar } = fingerprint ? await supabase.from("expense_receipts").select("id").eq("store_id", resolved.storeId).eq("content_fingerprint", fingerprint).is("archived_at", null).limit(1) : { data: [] };
    const { data, error } = await supabase.from("expense_receipts").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId,
      accounting_integration_id: integrationResult.data?.id ?? null, storage_bucket: "receipt-files", storage_path: storagePath, original_file_name: file.name,
      mime_type: file.type, file_size: file.size, file_sha256: fileSha256, content_fingerprint: fingerprint, duplicate_of_id: similar?.[0]?.id ?? null,
      ...values, approval_status: "draft", freee_status: "review_required", freee_payload: payloadForDraft(draft, integrationResult.data), uploaded_by: access.userId }).select("id").single();
    if (error) throw new Error(`レシート情報を保存できませんでした: ${error.message}`);
    await supabase.from("accounting_export_jobs").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, accounting_integration_id: integrationResult.data?.id ?? null,
      provider: "freee", export_type: "receipt_review", status: "review_required", row_count: 1, file_name: file.name, storage_path: storagePath,
      request_payload: payloadForDraft(draft, integrationResult.data), response_payload: {}, metadata: { expense_receipt_id: data.id, source: "receipt_ai_upload" }, created_by: access.userId });
    await supabase.from("ai_generation_logs").insert({ user_id: access.userId, organization_id: resolved.organizationId, store_id: resolved.storeId, template_id: "receipt_ocr_freee_prep",
      input: { file_name: file.name, mime_type: file.type, size: file.size, page_count: values.page_count }, output: ai.result, model: ai.model, tokens: ai.tokens ?? null, status: ai.status, error_message: ai.error });
    await logAuditEvent({ storeId, actionType: "expense_receipt_uploaded", targetType: "expense_receipt", targetId: data.id, message: "レシートを読み取り、送信前の確認データを作成しました。", metadata: { ai_status: ai.status, duplicate_warning: Boolean(similar?.[0]), page_count: values.page_count } });
    return { receiptId: String(data.id), duplicate: Boolean(similar?.[0]) };
  } catch (error) {
    await supabase.storage.from("receipt-files").remove([storagePath]);
    throw error;
  }
}

export async function updateExpenseReceiptFromForm(storeId: string, receiptId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("保存の準備ができていません。");
  const resolved = await resolveStore(storeId);
  await requireReceiptEditor(resolved.organizationId, resolved.publicStoreId);
  const draft = receiptDraftFromForm(formData);
  const integrationResult = await supabase.from("store_accounting_integrations").select("external_company_id, office_name").eq("store_id", resolved.storeId).eq("provider", "freee").maybeSingle();
  const fingerprint = receiptContentFingerprint({ vendorName: draft.vendorName, receiptDate: draft.receiptDate, totalAmount: draft.totalAmount, invoiceRegistrationNumber: draft.invoiceRegistrationNumber });
  const { error } = await supabase.from("expense_receipts").update({ vendor_name: draft.vendorName || null, receipt_date: draft.receiptDate || null,
    payment_method: draft.paymentMethod || null, category_name: draft.categoryName || null, invoice_registration_number: draft.invoiceRegistrationNumber || null,
    subtotal_amount: draft.subtotalAmount, tax_amount: draft.taxAmount, total_amount: draft.totalAmount, tax_rate: draft.taxRate || null,
    extracted_items: draft.items, tax_breakdown: buildTaxBreakdown(draft.items, draft.taxRate, draft.taxAmount), ai_summary: draft.summary || null,
    review_notes: draft.reviewNotes || null, content_fingerprint: fingerprint, approval_status: "draft", approved_at: null, approved_by: null,
    freee_status: "review_required", freee_payload: payloadForDraft(draft, integrationResult.data), updated_at: new Date().toISOString()
  }).eq("store_id", resolved.storeId).eq("id", receiptId).is("archived_at", null);
  if (error) throw new Error(`レシート内容を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "expense_receipt_review_updated", targetType: "expense_receipt", targetId: receiptId, message: "レシートの読み取り結果を修正しました。" });
}

export async function approveExpenseReceipt(storeId: string, receiptId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("承認の準備ができていません。");
  const resolved = await resolveStore(storeId);
  const access = await requireReceiptEditor(resolved.organizationId, resolved.publicStoreId);
  const missing = validateReceiptForApproval(receiptDraftFromForm(formData));
  if (missing.length > 0) throw new Error(`承認前に確認してください: ${missing.join("、")}`);
  await updateExpenseReceiptFromForm(storeId, receiptId, formData);
  const { error } = await supabase.from("expense_receipts").update({ approval_status: "approved", approved_by: access.userId, approved_at: new Date().toISOString(), freee_status: "ready", updated_at: new Date().toISOString() }).eq("store_id", resolved.storeId).eq("id", receiptId);
  if (error) throw new Error(`レシートを承認できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "expense_receipt_approved", targetType: "expense_receipt", targetId: receiptId, message: "レシート内容を確認し、freee送信可能として承認しました。" });
}

export async function reanalyzeExpenseReceipt(storeId: string, receiptId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("再解析の準備ができていません。");
  const resolved = await resolveStore(storeId);
  const access = await requireReceiptEditor(resolved.organizationId, resolved.publicStoreId);
  const { data: receipt } = await supabase.from("expense_receipts").select("*").eq("store_id", resolved.storeId).eq("id", receiptId).is("archived_at", null).maybeSingle();
  if (!receipt?.storage_path) throw new Error("再解析する元ファイルが見つかりません。");
  const { data: file, error: downloadError } = await supabase.storage.from(receipt.storage_bucket || "receipt-files").download(receipt.storage_path);
  if (downloadError || !file) throw new Error("元ファイルを読み込めませんでした。");
  const ai = await analyzeReceipt(Buffer.from(await file.arrayBuffer()), receipt.mime_type || "application/octet-stream", resolved.store.name);
  const values = analysisValues(ai);
  const fingerprint = receiptContentFingerprint({ vendorName: values.vendor_name, receiptDate: values.receipt_date, totalAmount: values.total_amount, invoiceRegistrationNumber: values.invoice_registration_number });
  const { error } = await supabase.from("expense_receipts").update({ ...values, content_fingerprint: fingerprint, approval_status: "draft", approved_by: null, approved_at: null,
    freee_status: "review_required", reanalyzed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", receiptId).eq("store_id", resolved.storeId);
  if (error) throw new Error(`再解析結果を保存できませんでした: ${error.message}`);
  await supabase.from("ai_generation_logs").insert({ user_id: access.userId, organization_id: resolved.organizationId, store_id: resolved.storeId,
    template_id: "receipt_ocr_freee_reanalysis", input: { receipt_id: receiptId, mime_type: receipt.mime_type }, output: ai.result,
    model: ai.model, tokens: ai.tokens ?? null, status: ai.status, error_message: ai.error });
  await logAuditEvent({ storeId, actionType: "expense_receipt_reanalyzed", targetType: "expense_receipt", targetId: receiptId, message: "保存済み証憑をAIで再解析しました。" });
}
