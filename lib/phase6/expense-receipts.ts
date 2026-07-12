import "server-only";
import crypto from "node:crypto";
import OpenAI from "openai";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/phase6/compliance-data";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const demoStoreIds: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
};

type ReceiptAiResult = {
  vendor_name?: string | null;
  receipt_date?: string | null;
  payment_method?: string | null;
  category_name?: string | null;
  subtotal_amount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  tax_rate?: string | null;
  items?: Array<{ name?: string; quantity?: number | string; amount?: number | string; tax_rate?: string }>;
  summary?: string | null;
  freee_memo?: string | null;
};

async function resolveStore(supabase: SupabaseClient, storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id,
    publicStoreId: store.id,
    store
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toDate(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[年月.]/g, "-").replace(/日/g, "").trim();
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function safeJsonParse(value: string): ReceiptAiResult {
  try {
    return JSON.parse(value) as ReceiptAiResult;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]) as ReceiptAiResult;
    } catch {
      return {};
    }
  }
}

async function analyzeReceiptImage(fileBuffer: Buffer, mimeType: string, storeName: string) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  if (!mimeType.startsWith("image/")) {
    return {
      status: "fallback",
      model,
      result: {
        summary: "ファイルは保存しました。PDFの場合は内容を確認して、金額や支払日を必要に応じて補足してください。"
      } satisfies ReceiptAiResult,
      error: "Receipt AI analysis currently supports image files"
    };
  }
  if (!process.env.OPENAI_API_KEY) {
    return {
      status: "fallback",
      model,
      result: {
        summary: "画像は保存しました。内容を確認して、金額や支払日を必要に応じて補足してください。"
      } satisfies ReceiptAiResult,
      error: "OPENAI_API_KEY is not configured"
    };
  }

  const base64 = fileBuffer.toString("base64");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "あなたは店舗会計の入力補助です。レシートや仕入れ伝票画像を読み取り、会計ソフトへ送る前に人間が確認しやすいJSONだけを返してください。読み取れない項目はnullにします。"
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `店舗名: ${storeName}`,
              "以下の画像から、vendor_name、receipt_date、payment_method、category_name、subtotal_amount、tax_amount、total_amount、tax_rate、items、summary、freee_memo をJSONで返してください。",
              "category_nameは、消耗品、仕入、広告宣伝、通信費、旅費交通費、車両費、外注費、雑費などから自然に推定してください。",
              "freee_memoには、freeeへ送る前に確認すべき点を短く書いてください。"
            ].join("\n")
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType || "image/jpeg"};base64,${base64}`
            }
          }
        ]
      }
    ]
  });
  const text = response.choices[0]?.message?.content ?? "{}";
  return {
    status: "success",
    model,
    result: safeJsonParse(text),
    tokens: response.usage ?? null,
    error: null
  };
}

export async function listExpenseReceipts(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("expense_receipts")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function createReceiptFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("保存の準備ができていません。時間をおいて再度お試しください。");
  const access = await getCurrentUserAccess();
  const resolved = await resolveStore(supabase, storeId);
  const file = formData.get("receipt_file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("レシート画像またはPDFを選択してください。");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("ファイルサイズは10MB以内にしてください。");
  }

  const fileExt = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "jpg";
  const storagePath = `${resolved.storeId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${fileExt}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("receipt-files")
    .upload(storagePath, fileBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
  if (uploadError) {
    throw new Error(`レシート画像を保存できませんでした: ${uploadError.message}`);
  }

  const integration = await supabase
    .from("store_accounting_integrations")
    .select("id, external_company_id, office_name")
    .eq("store_id", resolved.storeId)
    .eq("provider", "freee")
    .maybeSingle();

  const ai = await analyzeReceiptImage(fileBuffer, file.type, resolved.store.name);
  const result: ReceiptAiResult = ai.result;
  const freeePayload = {
    provider: "freee",
    mode: "review_before_send",
    company_id: integration.data?.external_company_id ?? null,
    office_name: integration.data?.office_name ?? null,
    issue_date: toDate(result.receipt_date) ?? new Date().toISOString().slice(0, 10),
    ref_number: null,
    partner_name: result.vendor_name ?? null,
    amount: toNumber(result.total_amount),
    tax_amount: toNumber(result.tax_amount),
    tax_rate: result.tax_rate ?? null,
    description: result.summary ?? result.freee_memo ?? "レシート画像から作成した経費候補",
    category_name: result.category_name ?? null,
    items: Array.isArray(result.items) ? result.items : []
  };

  const { data, error } = await supabase
    .from("expense_receipts")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      accounting_integration_id: integration.data?.id ?? null,
      storage_bucket: "receipt-files",
      storage_path: storagePath,
      original_file_name: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      status: ai.status === "success" ? "analyzed" : "needs_review",
      vendor_name: result.vendor_name ?? null,
      receipt_date: toDate(result.receipt_date),
      payment_method: result.payment_method ?? null,
      category_name: result.category_name ?? null,
      subtotal_amount: toNumber(result.subtotal_amount),
      tax_amount: toNumber(result.tax_amount),
      total_amount: toNumber(result.total_amount),
      tax_rate: result.tax_rate ?? null,
      extracted_items: Array.isArray(result.items) ? result.items : [],
      ai_summary: result.summary ?? result.freee_memo ?? null,
      ai_model: ai.model,
      ai_analysis_status: ai.status,
      ai_analysis_error: ai.error,
      freee_status: "review_required",
      freee_payload: freeePayload,
      uploaded_by: access?.userId ?? null
    })
    .select("id")
    .single();
  if (error) throw new Error(`レシート情報を保存できませんでした: ${error.message}`);

  await supabase.from("accounting_export_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    accounting_integration_id: integration.data?.id ?? null,
    provider: "freee",
    export_type: "receipt_review",
    status: "review_required",
    row_count: 1,
    file_name: file.name,
    storage_path: storagePath,
    request_payload: freeePayload,
    response_payload: {},
    metadata: { expense_receipt_id: data.id, source: "receipt_ai_upload" },
    created_by: access?.userId ?? null
  });

  await supabase.from("ai_generation_logs").insert({
    user_id: access?.userId ?? null,
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    template_id: "receipt_ocr_freee_prep",
    input: { file_name: file.name, mime_type: file.type, size: file.size },
    output: result,
    model: ai.model,
    tokens: "tokens" in ai ? ai.tokens : null,
    status: ai.status,
    error_message: ai.error
  });

  await logAuditEvent({
    storeId,
    actionType: "expense_receipt_uploaded",
    targetType: "expense_receipt",
    targetId: data.id,
    message: "レシート画像を読み取り、freee連携用の確認データを作成しました。",
    metadata: { ai_status: ai.status, total_amount: freeePayload.amount }
  });

  return data.id as string;
}
