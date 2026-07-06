import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { AuditLog, BusinessDocument, BusinessOrder, PaymentMethod, PaymentRecord } from "@/types/phase2";

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

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

async function resolveStore(supabase: SupabaseClient, storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id,
    publicStoreId: store.id
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function text(value: FormDataEntryValue | null) {
  const next = String(value ?? "").trim();
  return next.length > 0 ? next : null;
}

function number(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function logAuditEvent({
  storeId,
  actionType,
  targetType,
  targetId,
  message,
  metadata = {}
}: {
  storeId: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  await supabase.from("audit_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    action_type: actionType,
    target_type: targetType,
    target_id: targetId ?? null,
    message,
    metadata
  });
}

export async function recordPdfIssue(storeId: string, invoice: BusinessDocument, issueType: "issue" | "reissue" = "issue") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  await supabase.from("invoice_pdf_issues").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoice.id,
    document_number: invoice.document_number,
    issue_type: issueType,
    file_name: `${invoice.document_number}.pdf`,
    metadata: { title: invoice.title, total: invoice.total }
  });
  await supabase.from("invoices").update({ last_pdf_issued_at: new Date().toISOString() }).eq("id", invoice.id);
  await logAuditEvent({
    storeId,
    actionType: "invoice_pdf_issued",
    targetType: "invoice",
    targetId: invoice.id,
    message: `${invoice.document_number} のPDFを発行しました。`
  });
}

export async function listPdfIssues(storeId: string, invoiceId?: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  let query = supabase.from("invoice_pdf_issues").select("*").eq("store_id", resolved.storeId).order("issued_at", { ascending: false });
  if (invoiceId) query = query.eq("invoice_id", invoiceId);
  const { data } = await query.limit(50);
  return data ?? [];
}

export async function listOrders(storeId: string): Promise<BusinessOrder[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("orders")
    .select("*, customer:customers(name, company_name)")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as BusinessOrder[];
}

export async function createOrderFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const title = String(formData.get("title") ?? "受注");
  const orderNumber = text(formData.get("order_number")) ?? `ORD-${Date.now()}`;
  const { data, error } = await supabase.from("orders").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    customer_id: text(formData.get("customer_id")),
    estimate_id: text(formData.get("estimate_id")),
    order_number: orderNumber,
    title,
    status: String(formData.get("status") ?? "ordered"),
    ordered_at: text(formData.get("ordered_at")) ?? today(),
    completed_at: text(formData.get("completed_at")),
    total: number(formData.get("total")),
    notes: text(formData.get("notes"))
  }).select("id").single();
  if (error) throw new Error(`受注の保存に失敗しました: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "order_created", targetType: "order", targetId: data.id, message: `${orderNumber} を作成しました。` });
}

export async function getInvoiceSettings(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase.from("invoice_number_sequences").select("*").eq("store_id", resolved.storeId).maybeSingle();
  return data ?? {
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    prefix: "INV",
    next_number: 1,
    registration_number: null,
    qualified_invoice_issuer_name: null
  };
}

export async function updateInvoiceSettingsFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  await supabase.from("invoice_number_sequences").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    prefix: text(formData.get("prefix")) ?? "INV",
    next_number: number(formData.get("next_number")) || 1,
    registration_number: text(formData.get("registration_number")),
    qualified_invoice_issuer_name: text(formData.get("qualified_invoice_issuer_name")),
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  await logAuditEvent({ storeId, actionType: "invoice_settings_updated", targetType: "invoice_settings", message: "インボイス請求書設定を更新しました。" });
}

export async function listPayments(storeId: string): Promise<PaymentRecord[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("payments")
    .select("*, invoice:invoices(document_number, title, total)")
    .eq("store_id", resolved.storeId)
    .order("payment_date", { ascending: false });
  return (data ?? []) as PaymentRecord[];
}

export async function createPaymentFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const invoiceId = text(formData.get("invoice_id"));
  const amount = number(formData.get("amount"));
  const paymentMethod = String(formData.get("payment_method") ?? "bank_transfer") as PaymentMethod;
  const { data, error } = await supabase.from("payments").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoiceId,
    payment_date: text(formData.get("payment_date")) ?? today(),
    amount,
    payment_method: paymentMethod,
    status: String(formData.get("status") ?? "received"),
    memo: text(formData.get("memo"))
  }).select("id").single();
  if (error) throw new Error(`入金の保存に失敗しました: ${error.message}`);
  if (invoiceId) {
    await supabase.from("invoices").update({
      payment_status: "paid",
      payment_method: paymentMethod,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", invoiceId);
  }
  await logAuditEvent({ storeId, actionType: "payment_recorded", targetType: "payment", targetId: data.id, message: `${amount.toLocaleString("ja-JP")}円の入金を記録しました。` });
}

export async function listAuditLogs(storeId: string): Promise<AuditLog[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase.from("audit_logs").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false }).limit(80);
  return (data ?? []) as AuditLog[];
}

export async function getSubsidyImpactReport(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { invoiceCount: 0, salesCount: 0, paymentCount: 0, aiCount: 0, pdfCount: 0, estimatedMinutesSaved: 0 };
  }
  const resolved = await resolveStore(supabase, storeId);
  const [invoices, sales, payments, aiLogs, pdfIssues] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("sales_transactions").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("ai_generation_logs").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("invoice_pdf_issues").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId)
  ]);
  const invoiceCount = invoices.count ?? 0;
  const salesCount = sales.count ?? 0;
  const paymentCount = payments.count ?? 0;
  const aiCount = aiLogs.count ?? 0;
  const pdfCount = pdfIssues.count ?? 0;
  return {
    invoiceCount,
    salesCount,
    paymentCount,
    aiCount,
    pdfCount,
    estimatedMinutesSaved: invoiceCount * 8 + salesCount * 2 + paymentCount * 4 + aiCount * 6
  };
}

export async function buildAccountingCsv(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return "発行日,請求書番号,顧客名,小計,消費税,合計,入金状態,支払方法\n";
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("invoices")
    .select("*, customer:customers(name)")
    .eq("store_id", resolved.storeId)
    .order("issue_date", { ascending: false });
  const rows = [
    ["発行日", "取引年月日", "請求書番号", "顧客名", "10%対象", "10%消費税", "8%対象", "8%消費税", "小計", "消費税", "合計", "入金状態", "支払方法"]
  ];
  for (const invoice of data ?? []) {
    rows.push([
      invoice.issue_date ?? "",
      invoice.transaction_date ?? "",
      invoice.document_number ?? "",
      invoice.customer?.name ?? "",
      String(invoice.tax_10_subtotal ?? 0),
      String(invoice.tax_10_amount ?? 0),
      String(invoice.tax_8_subtotal ?? 0),
      String(invoice.tax_8_amount ?? 0),
      String(invoice.subtotal ?? 0),
      String(invoice.tax_total ?? 0),
      String(invoice.total ?? 0),
      invoice.payment_status ?? "",
      invoice.payment_method ?? ""
    ]);
  }
  await logAuditEvent({ storeId, actionType: "accounting_csv_exported", targetType: "accounting_export", message: "会計CSVを出力しました。" });
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}
