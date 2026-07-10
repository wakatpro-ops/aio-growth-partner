import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { AuditLog, BusinessDocument, BusinessOrder, OrderStatusLog, PaymentMethod, PaymentRecord } from "@/types/phase2";

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

function csv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
}

function relationEmail(value: unknown) {
  if (Array.isArray(value)) return relationEmail(value[0]);
  if (value && typeof value === "object" && "email" in value) {
    const email = (value as { email?: unknown }).email;
    return typeof email === "string" ? email : null;
  }
  return null;
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

export async function recordPdfIssue(storeId: string, invoice: BusinessDocument, issueType: "issue" | "reissue" = "issue", reissueReason?: string | null) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  await supabase.from("invoice_pdf_issues").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoice.id,
    document_number: invoice.document_number,
    issue_type: issueType,
    reissue_reason: reissueReason ?? null,
    file_name: `${invoice.document_number}.pdf`,
    metadata: { title: invoice.title, total: invoice.total, reissue_reason: reissueReason ?? null }
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
    .select("*, customer:customers(name, company_name), estimate:estimates(document_number, title, total), invoice:invoices(document_number, title, total)")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as BusinessOrder[];
}

export async function getOrder(storeId: string, orderId: string): Promise<BusinessOrder | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("orders")
    .select("*, customer:customers(name, company_name), estimate:estimates(document_number, title, total), invoice:invoices(document_number, title, total)")
    .eq("store_id", resolved.storeId)
    .eq("id", orderId)
    .maybeSingle();
  return data as BusinessOrder | null;
}

export async function listOrderStatusLogs(storeId: string, orderId: string): Promise<OrderStatusLog[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("order_status_logs")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  return (data ?? []) as OrderStatusLog[];
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
    work_status: String(formData.get("work_status") ?? "not_started"),
    ordered_at: text(formData.get("ordered_at")) ?? today(),
    completed_at: text(formData.get("completed_at")),
    total: number(formData.get("total")),
    notes: text(formData.get("notes"))
  }).select("id").single();
  if (error) throw new Error(`受注の保存に失敗しました: ${error.message}`);
  await supabase.from("order_status_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    order_id: data.id,
    to_status: String(formData.get("status") ?? "ordered"),
    comment: "受注を作成しました。"
  });
  await logAuditEvent({ storeId, actionType: "order_created", targetType: "order", targetId: data.id, message: `${orderNumber} を作成しました。` });
}

export async function createOrderFromEstimate(storeId: string, estimate: BusinessDocument) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const orderNumber = `ORD-${Date.now()}`;
  const { data, error } = await supabase.from("orders").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    customer_id: estimate.customer_id,
    estimate_id: estimate.id,
    order_number: orderNumber,
    title: estimate.title,
    status: "ordered",
    work_status: "not_started",
    ordered_at: today(),
    total: estimate.total,
    notes: `見積 ${estimate.document_number} から受注化`
  }).select("id").single();
  if (error) throw new Error(`見積から受注化できませんでした: ${error.message}`);
  await supabase.from("estimates").update({ status: "ordered", updated_at: new Date().toISOString() }).eq("id", estimate.id);
  await supabase.from("order_status_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    order_id: data.id,
    to_status: "ordered",
    comment: `見積 ${estimate.document_number} から受注化しました。`
  });
  await logAuditEvent({ storeId, actionType: "estimate_converted_to_order", targetType: "order", targetId: data.id, message: `${estimate.document_number} を受注化しました。` });
  return data.id as string;
}

export async function updateOrderFromForm(storeId: string, orderId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const previous = await getOrder(storeId, orderId);
  const nextStatus = String(formData.get("status") ?? "ordered");
  const { error } = await supabase.from("orders").update({
    title: String(formData.get("title") ?? ""),
    status: nextStatus,
    work_status: String(formData.get("work_status") ?? "not_started"),
    ordered_at: text(formData.get("ordered_at")),
    completed_at: text(formData.get("completed_at")),
    total: number(formData.get("total")),
    notes: text(formData.get("notes")),
    updated_at: new Date().toISOString()
  }).eq("store_id", resolved.storeId).eq("id", orderId);
  if (error) throw new Error(`受注の更新に失敗しました: ${error.message}`);
  if (previous?.status !== nextStatus) {
    await supabase.from("order_status_logs").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      order_id: orderId,
      from_status: previous?.status ?? null,
      to_status: nextStatus,
      comment: text(formData.get("status_comment")) ?? "ステータスを変更しました。"
    });
  }
  await logAuditEvent({ storeId, actionType: "order_updated", targetType: "order", targetId: orderId, message: "受注を更新しました。" });
}

export async function createInvoiceFromOrder(storeId: string, orderId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const order = await getOrder(storeId, orderId);
  if (!order) throw new Error("受注が見つかりません。");
  const settings = await getInvoiceSettings(storeId);
  const prefix = settings?.prefix ?? "INV";
  const nextNumber = Number(settings?.next_number ?? 1);
  const documentNumber = `${prefix}-${String(nextNumber).padStart(6, "0")}`;
  const subtotal = Math.round(order.total / 1.1);
  const taxTotal = order.total - subtotal;
  const { data, error } = await supabase.from("invoices").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    customer_id: order.customer_id,
    document_number: documentNumber,
    title: order.title,
    issue_date: today(),
    transaction_date: order.completed_at ?? today(),
    due_date: today(),
    status: "issued",
    subtotal,
    tax_total: taxTotal,
    total: order.total,
    tax_10_subtotal: subtotal,
    tax_10_amount: taxTotal,
    tax_8_subtotal: 0,
    tax_8_amount: 0,
    payment_status: "unpaid",
    invoice_registration_number: settings?.registration_number ?? null,
    qualified_invoice_issuer_name: settings?.qualified_invoice_issuer_name ?? null,
    invoice_sequence_number: nextNumber,
    invoice_number_prefix: prefix,
    issued_at: new Date().toISOString(),
    notes: `受注 ${order.order_number} から作成`
  }).select("id").single();
  if (error) throw new Error(`受注から請求書を作成できませんでした: ${error.message}`);
  await supabase.from("invoice_number_sequences").update({ next_number: nextNumber + 1, updated_at: new Date().toISOString() }).eq("store_id", resolved.storeId);
  await supabase.from("orders").update({ invoice_id: data.id, status: "invoiced", updated_at: new Date().toISOString() }).eq("id", orderId);
  await supabase.from("order_status_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    order_id: orderId,
    from_status: order.status,
    to_status: "invoiced",
    comment: `請求書 ${documentNumber} を作成しました。`
  });
  await logAuditEvent({ storeId, actionType: "invoice_created_from_order", targetType: "invoice", targetId: data.id, message: `${order.order_number} から請求書を作成しました。` });
  return data.id as string;
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
    external_provider: text(formData.get("external_provider")),
    external_payment_id: text(formData.get("external_payment_id")),
    external_payment_url: text(formData.get("external_payment_url")),
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

export async function getStorePaymentIntegration(storeId: string, provider = "stripe") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("store_payment_integrations")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("provider", provider)
    .maybeSingle();
  return data ?? null;
}

export async function updateStripeIntegrationFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const { error } = await supabase.from("store_payment_integrations").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "stripe",
    connection_type: "stripe_connect",
    status: String(formData.get("status") ?? "manual_ready"),
    external_account_id: text(formData.get("external_account_id")),
    account_name: text(formData.get("account_name")),
    charges_enabled: formData.get("charges_enabled") === "on",
    payouts_enabled: formData.get("payouts_enabled") === "on",
    config: {
      dashboard_url: text(formData.get("dashboard_url")),
      manual_mode: true,
      note: text(formData.get("note"))
    },
    metadata: {
      operation_mode: "manual_payment_link",
      platform_billing_separated: true
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider" });
  if (error) throw new Error(`Stripe連携情報を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "store_stripe_integration_updated", targetType: "store_payment_integration", message: "店舗側Stripe連携情報を更新しました。" });
}

export async function getStoreAccountingIntegration(storeId: string, provider = "freee") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("store_accounting_integrations")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("provider", provider)
    .maybeSingle();
  return data ?? null;
}

export async function updateFreeeIntegrationFromForm(storeId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const { error } = await supabase.from("store_accounting_integrations").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "freee",
    status: String(formData.get("status") ?? "manual_csv"),
    external_company_id: text(formData.get("external_company_id")),
    office_name: text(formData.get("office_name")),
    config: {
      export_template: "freee_csv",
      target_data: ["invoices", "payments", "sales_transactions"],
      note: text(formData.get("note"))
    },
    metadata: {
      operation_mode: "manual_csv_export",
      api_send_deferred: true
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider" });
  if (error) throw new Error(`freee連携情報を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "store_freee_integration_updated", targetType: "store_accounting_integration", message: "店舗側freee連携情報を更新しました。" });
}

export async function updateInvoiceStripePaymentFromForm(storeId: string, invoiceId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const stripePaymentUrl = text(formData.get("stripe_payment_url"));
  const stripePaymentStatus = String(formData.get("stripe_payment_status") ?? "payment_link_created");
  const stripePaymentId = text(formData.get("stripe_payment_id"));
  const { data: invoice, error } = await supabase
    .from("invoices")
    .update({
      stripe_payment_url: stripePaymentUrl,
      stripe_payment_status: stripePaymentStatus,
      stripe_payment_id: stripePaymentId,
      payment_status: stripePaymentStatus === "paid" ? "paid" : "unpaid",
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", invoiceId)
    .select("id, document_number, total, customer:customers(email)")
    .single();
  if (error) throw new Error(`Stripe決済URLを保存できませんでした: ${error.message}`);

  await supabase.from("store_payment_transactions").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoiceId,
    provider: "stripe",
    external_payment_intent_id: stripePaymentId ?? `manual-${invoiceId}`,
    amount: Number(invoice.total ?? 0),
    currency: "jpy",
    status: stripePaymentStatus,
    customer_email: relationEmail(invoice.customer),
    raw_payload: {
      mode: "manual_payment_link",
      payment_url: stripePaymentUrl,
      document_number: invoice.document_number
    },
    paid_at: stripePaymentStatus === "paid" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider,external_payment_intent_id" });
  await logAuditEvent({ storeId, actionType: "stripe_payment_link_saved", targetType: "invoice", targetId: invoiceId, message: `${invoice.document_number} のStripe決済URLを保存しました。` });
}

export async function markStripeInvoicePaidFromForm(storeId: string, invoiceId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStore(supabase, storeId);
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, document_number, total, stripe_payment_url, stripe_payment_id")
    .eq("store_id", resolved.storeId)
    .eq("id", invoiceId)
    .single();
  if (invoiceError || !invoice) throw new Error(`請求書が見つかりません: ${invoiceError?.message ?? ""}`);
  const externalPaymentId = text(formData.get("external_payment_id")) ?? invoice.stripe_payment_id ?? `manual-${invoiceId}`;
  const paymentDate = text(formData.get("payment_date")) ?? today();
  const amount = number(formData.get("amount")) || Number(invoice.total ?? 0);
  const { data: payment, error } = await supabase.from("payments").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoiceId,
    payment_date: paymentDate,
    amount,
    payment_method: "credit_card",
    status: "received",
    external_provider: "stripe",
    external_payment_id: externalPaymentId,
    external_payment_url: text(formData.get("external_payment_url")) ?? invoice.stripe_payment_url,
    memo: text(formData.get("memo")) ?? "Stripe手動連携で入金済みに変更"
  }).select("id").single();
  if (error) throw new Error(`Stripe入金を保存できませんでした: ${error.message}`);
  await supabase.from("invoices").update({
    payment_status: "paid",
    payment_method: "credit_card",
    paid_at: new Date().toISOString(),
    stripe_payment_status: "paid",
    stripe_payment_id: externalPaymentId,
    updated_at: new Date().toISOString()
  }).eq("id", invoiceId);
  await supabase.from("store_payment_transactions").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    invoice_id: invoiceId,
    payment_id: payment.id,
    provider: "stripe",
    external_payment_intent_id: externalPaymentId,
    amount,
    currency: "jpy",
    status: "paid",
    paid_at: new Date().toISOString(),
    raw_payload: {
      mode: "manual_paid_confirmation",
      payment_url: text(formData.get("external_payment_url")) ?? invoice.stripe_payment_url,
      document_number: invoice.document_number
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider,external_payment_intent_id" });
  await logAuditEvent({ storeId, actionType: "stripe_payment_marked_paid", targetType: "invoice", targetId: invoiceId, message: `${invoice.document_number} をStripe入金済みにしました。` });
}

export async function listStripePaymentTransactions(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("store_payment_transactions")
    .select("*, invoice:invoices(document_number, title)")
    .eq("store_id", resolved.storeId)
    .eq("provider", "stripe")
    .order("created_at", { ascending: false })
    .limit(80);
  return data ?? [];
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
  const [invoices, sales, payments, aiLogs, pdfIssues, exports, googleJobs] = await Promise.all([
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("sales_transactions").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("ai_generation_logs").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("invoice_pdf_issues").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("accounting_exports").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId),
    supabase.from("external_publish_jobs").select("id", { count: "exact", head: true }).eq("store_id", resolved.storeId)
  ]);
  const invoiceCount = invoices.count ?? 0;
  const salesCount = sales.count ?? 0;
  const paymentCount = payments.count ?? 0;
  const aiCount = aiLogs.count ?? 0;
  const pdfCount = pdfIssues.count ?? 0;
  const exportCount = exports.count ?? 0;
  const googleSupportCount = googleJobs.count ?? 0;
  return {
    invoiceCount,
    salesCount,
    paymentCount,
    aiCount,
    pdfCount,
    exportCount,
    googleSupportCount,
    estimatedMinutesSaved: invoiceCount * 8 + salesCount * 2 + paymentCount * 4 + aiCount * 6 + exportCount * 10 + googleSupportCount * 5
  };
}

export async function listAccountingExports(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("accounting_exports")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function listAccountingExportJobs(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStore(supabase, storeId);
  const { data } = await supabase
    .from("accounting_export_jobs")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

export async function buildAccountingCsv(storeId: string, format: "standard" | "freee" = "standard") {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return "発行日,請求書番号,顧客名,小計,消費税,合計,入金状態,支払方法\n";
  const resolved = await resolveStore(supabase, storeId);
  const [{ data }, { data: sales }] = await Promise.all([
    supabase
    .from("invoices")
    .select("*, customer:customers(name)")
    .eq("store_id", resolved.storeId)
      .order("issue_date", { ascending: false }),
    supabase
      .from("sales_transactions")
      .select("*")
      .eq("store_id", resolved.storeId)
      .order("business_date", { ascending: false })
      .limit(1000)
  ]);
  const rows = [
    ["売上日", "請求書番号", "顧客名", "摘要", "税率", "税抜金額", "消費税額", "税込金額", "入金日", "支払方法", "ステータス"]
  ];
  for (const invoice of data ?? []) {
    const taxRows = [
      { rate: "10%", subtotal: invoice.tax_10_subtotal ?? invoice.subtotal ?? 0, tax: invoice.tax_10_amount ?? invoice.tax_total ?? 0 },
      { rate: "8%", subtotal: invoice.tax_8_subtotal ?? 0, tax: invoice.tax_8_amount ?? 0 }
    ].filter((row) => Number(row.subtotal) > 0 || Number(row.tax) > 0);
    for (const taxRow of taxRows.length > 0 ? taxRows : [{ rate: "", subtotal: invoice.subtotal ?? 0, tax: invoice.tax_total ?? 0 }]) {
    rows.push([
      invoice.transaction_date ?? invoice.issue_date ?? "",
      invoice.document_number ?? "",
      invoice.customer?.name ?? "",
      invoice.title ?? "",
      taxRow.rate,
      String(taxRow.subtotal),
      String(taxRow.tax),
      String(Number(taxRow.subtotal) + Number(taxRow.tax)),
      invoice.paid_at ?? "",
      invoice.payment_method ?? "",
      invoice.payment_status ?? invoice.status ?? ""
    ]);
    }
  }
  if (format === "freee") {
    for (const sale of sales ?? []) {
      rows.push([
        sale.business_date ?? "",
        sale.external_transaction_id ?? "",
        sale.customer_name ?? "",
        `外部売上データ ${sale.channel ?? ""}`.trim(),
        "",
        String(sale.net_amount ?? 0),
        String(sale.tax_amount ?? 0),
        String(sale.gross_amount ?? 0),
        sale.business_date ?? "",
        sale.payment_method ?? "",
        "imported"
      ]);
    }
  }
  const exportType = format === "freee" ? "freee_csv" : "invoice_csv";
  const fileName = `${format === "freee" ? "freee" : "accounting"}-export-${storeId}.csv`;
  await supabase.from("accounting_exports").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    export_type: exportType,
    file_name: fileName,
    row_count: Math.max(rows.length - 1, 0),
    metadata: { format: format === "freee" ? "freee_manual_csv" : "phase_5e_invoice_business_foundation" }
  });
  await supabase.from("accounting_export_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: format === "freee" ? "freee" : "generic_csv",
    export_type: exportType,
    status: "completed",
    row_count: Math.max(rows.length - 1, 0),
    file_name: fileName,
    request_payload: { format, sources: format === "freee" ? ["invoices", "payments", "sales_transactions"] : ["invoices"] },
    response_payload: { mode: "manual_csv_download" },
    completed_at: new Date().toISOString()
  });
  await logAuditEvent({ storeId, actionType: "accounting_csv_exported", targetType: "accounting_export", message: format === "freee" ? "freee向けCSVを出力しました。" : "会計CSVを出力しました。" });
  return csv(rows);
}
