import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { shouldApplyStripeEvent, stripeAmount, stripeEventStatus, type StripePaymentStatus } from "@/lib/phase6/stripe-payment-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type StripeObject = {
  id?: string; amount?: number; amount_received?: number; amount_total?: number; amount_refunded?: number; currency?: string;
  customer_email?: string; payment_intent?: string; status?: string; failure_message?: string; metadata?: Record<string, string | undefined>;
  payment_status?: string;
};
type StripeEvent = { id?: string; type?: string; account?: string; created?: number; livemode?: boolean; data?: { object?: StripeObject } };

function verifyStripeSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const values = header.split(",").reduce<Record<string, string[]>>((all, part) => {
    const [key, value] = part.split("=");
    if (key && value) all[key] = [...(all[key] ?? []), value];
    return all;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return (values.v1 ?? []).some((value) => {
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(value, "hex");
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  });
}

function eventTime(created?: number) {
  return new Date((created && created > 0 ? created * 1000 : Date.now())).toISOString();
}

function paidAmount(object: StripeObject) {
  return stripeAmount(object.amount_received ?? object.amount_total ?? object.amount, object.currency);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret)) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  let event: StripeEvent;
  try { event = JSON.parse(rawBody) as StripeEvent; } catch { return NextResponse.json({ error: "Invalid payload." }, { status: 400 }); }
  if (!event.id || !event.type || !event.data?.object) return NextResponse.json({ received: true, ignored: true });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ received: true });
  const createdAt = eventTime(event.created);
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const { error: eventInsertError } = await supabase.from("stripe_webhook_events").insert({ event_id: event.id, connected_account_id: event.account ?? null,
    event_type: event.type, livemode: Boolean(event.livemode), event_created_at: createdAt, payload_sha256: payloadHash, processing_status: "processing" });
  if (eventInsertError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventInsertError) return NextResponse.json({ error: "Event log failed." }, { status: 500 });

  try {
    const object = event.data.object;
    const metadata = object.metadata ?? {};
    const connectedAccountId = event.account ?? metadata.stripe_account_id;
    let integration: { organization_id: string; store_id: string; external_account_id: string } | null = null;
    if (connectedAccountId) {
      const { data } = await supabase.from("store_payment_integrations").select("organization_id, store_id, external_account_id").eq("provider", "stripe").eq("external_account_id", connectedAccountId).maybeSingle();
      integration = data;
    }
    const storeId = metadata.store_id ?? integration?.store_id;
    const organizationId = metadata.organization_id ?? integration?.organization_id;
    if (!storeId || !organizationId) {
      await supabase.from("stripe_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", event.id);
      return NextResponse.json({ received: true, ignored: true });
    }
    const sessionId = event.type.startsWith("checkout.") ? object.id ?? null : null;
    const paymentIntentId = object.payment_intent ?? (event.type.startsWith("payment_intent.") ? object.id : null);
    let transaction = null;
    if (sessionId) {
      const { data } = await supabase.from("store_payment_transactions").select("*").eq("store_id", storeId).eq("provider", "stripe").eq("external_checkout_session_id", sessionId).maybeSingle();
      transaction = data;
    }
    if (!transaction && paymentIntentId) {
      const { data } = await supabase.from("store_payment_transactions").select("*").eq("store_id", storeId).eq("provider", "stripe").in("external_payment_intent_id", [paymentIntentId, `pending:${sessionId ?? ""}`]).limit(1).maybeSingle();
      transaction = data;
    }
    const invoiceId = metadata.invoice_id ?? transaction?.invoice_id ?? null;
    if (!transaction && invoiceId) {
      const { data } = await supabase.from("store_payment_transactions").select("*").eq("store_id", storeId).eq("provider", "stripe")
        .eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      transaction = data;
    }
    let nextStatus = event.type === "checkout.session.completed" && object.payment_status !== "paid"
      ? null
      : stripeEventStatus(event.type, object.status);
    const refundedAmount = stripeAmount(object.amount_refunded, object.currency);
    const totalAmount = paidAmount(object) || Number(transaction?.amount ?? 0);
    if (event.type === "charge.refunded" && refundedAmount > 0 && refundedAmount < totalAmount) nextStatus = "partially_refunded";
    if (!nextStatus) {
      await supabase.from("stripe_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", event.id);
      return NextResponse.json({ received: true, ignored: true });
    }
    if (!transaction) {
      const { data, error } = await supabase.from("store_payment_transactions").insert({ organization_id: organizationId, store_id: storeId, invoice_id: invoiceId,
        provider: "stripe", external_payment_intent_id: paymentIntentId ?? `event:${event.id}`, external_checkout_session_id: sessionId,
        amount: totalAmount, currency: object.currency ?? "jpy", status: "pending", customer_email: object.customer_email ?? null,
        raw_payload: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select("*").single();
      if (error) throw error;
      transaction = data;
    }
    const apply = shouldApplyStripeEvent({ currentStatus: transaction.status, currentEventCreatedAt: transaction.event_created_at, nextStatus, nextEventCreatedAt: createdAt });
    if (apply) {
      const { data: updated, error } = await supabase.from("store_payment_transactions").update({
        invoice_id: invoiceId, external_payment_intent_id: paymentIntentId ?? transaction.external_payment_intent_id,
        external_checkout_session_id: sessionId ?? transaction.external_checkout_session_id, amount: totalAmount || transaction.amount,
        currency: object.currency ?? transaction.currency ?? "jpy", status: nextStatus, customer_email: object.customer_email ?? transaction.customer_email,
        paid_at: nextStatus === "paid" ? createdAt : transaction.paid_at, amount_refunded: refundedAmount,
        refunded_at: ["partially_refunded", "refunded"].includes(nextStatus) ? createdAt : transaction.refunded_at,
        disputed_at: nextStatus === "disputed" ? createdAt : transaction.disputed_at,
        failure_message: object.failure_message ?? (nextStatus === "failed" ? "Stripe決済に失敗しました。" : null),
        event_created_at: createdAt, last_event_id: event.id, raw_payload: event, updated_at: new Date().toISOString()
      }).eq("id", transaction.id).select("*").single();
      if (error) throw error;
      transaction = updated;
      if (invoiceId) await applyInvoicePaymentState(supabase, { organizationId, storeId, invoiceId, transaction, status: nextStatus, eventId: event.id });
    }
    await supabase.from("external_integration_logs").insert({ organization_id: organizationId, store_id: storeId, provider: "stripe",
      action_type: `stripe_webhook_${event.type}`, status: apply ? "success" : "stale_ignored", message: apply ? "Stripe決済イベントを反映しました。" : "古いStripeイベントのため状態変更を行いませんでした。",
      metadata_json: { event_id: event.id, event_type: event.type, transaction_id: transaction.id, resulting_status: transaction.status } });
    await supabase.from("stripe_webhook_events").update({ processing_status: apply ? "completed" : "stale_ignored", processed_at: new Date().toISOString() }).eq("event_id", event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    await supabase.from("stripe_webhook_events").update({ processing_status: "failed", error_message: message.slice(0, 1000), processed_at: new Date().toISOString() }).eq("event_id", event.id);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}

async function applyInvoicePaymentState(supabase: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, input: {
  organizationId: string; storeId: string; invoiceId: string; transaction: Record<string, unknown>; status: StripePaymentStatus; eventId: string;
}) {
  const { data: invoice } = await supabase.from("invoices").select("*, customer:customers(name,company_name,email)").eq("store_id", input.storeId).eq("id", input.invoiceId).maybeSingle();
  if (!invoice) return;
  const transactionId = String(input.transaction.id);
  const paymentIntentId = String(input.transaction.external_payment_intent_id ?? input.eventId);
  if (input.status === "paid") {
    const amount = Number(input.transaction.amount ?? invoice.total ?? 0);
    const { data: payment } = await supabase.from("payments").upsert({ organization_id: input.organizationId, store_id: input.storeId,
      invoice_id: input.invoiceId, payment_date: String(input.transaction.paid_at ?? new Date().toISOString()).slice(0, 10), amount,
      payment_method: "credit_card", status: "received", external_provider: "stripe", external_payment_id: paymentIntentId,
      external_payment_url: invoice.stripe_payment_url, memo: "Stripe Webhookによる自動入金反映", updated_at: new Date().toISOString()
    }, { onConflict: "store_id,external_provider,external_payment_id" }).select("id").single();
    await supabase.from("invoices").update({ payment_status: "paid", status: "paid", payment_method: "credit_card", paid_at: input.transaction.paid_at,
      stripe_payment_status: "paid", stripe_payment_id: paymentIntentId, updated_at: new Date().toISOString() }).eq("id", input.invoiceId);
    const receiptNumber = `RCT-${String(invoice.document_number).replace(/[^A-Za-z0-9-]/g, "").slice(0, 20)}-${transactionId.slice(0, 8)}`;
    const { data: receipt } = await supabase.from("payment_receipts").upsert({ organization_id: input.organizationId, store_id: input.storeId,
      invoice_id: input.invoiceId, payment_id: payment?.id ?? null, payment_transaction_id: transactionId, receipt_number: receiptNumber,
      amount, currency: String(input.transaction.currency ?? "jpy"), issued_to: invoice.customer?.company_name || invoice.customer?.name || null,
      payment_method: "stripe", status: "issued", metadata: { stripe_event_id: input.eventId, payment_intent_id: paymentIntentId }, updated_at: new Date().toISOString()
    }, { onConflict: "payment_transaction_id" }).select("id, created_at").single();
    if (receipt) {
      const { count } = await supabase.from("payment_receipt_issues").select("id", { count: "exact", head: true }).eq("receipt_id", receipt.id);
      if ((count ?? 0) === 0) await supabase.from("payment_receipt_issues").insert({ organization_id: input.organizationId, store_id: input.storeId,
        receipt_id: receipt.id, issue_type: "issue", delivery_status: "created" });
    }
  } else if (["partially_refunded", "refunded", "disputed"].includes(input.status)) {
    await supabase.from("invoices").update({ payment_status: input.status === "partially_refunded" ? "partially_paid" : "unpaid",
      status: input.status === "partially_refunded" ? "paid" : "issued", stripe_payment_status: input.status, updated_at: new Date().toISOString() }).eq("id", input.invoiceId);
    await supabase.from("payments").update({ status: input.status === "partially_refunded" ? "partial" : "cancelled", updated_at: new Date().toISOString() })
      .eq("store_id", input.storeId).eq("external_provider", "stripe").eq("external_payment_id", paymentIntentId);
    await supabase.from("payment_receipts").update({ status: input.status === "partially_refunded" ? "partially_refunded" : "void", updated_at: new Date().toISOString(),
      metadata: { stripe_event_id: input.eventId, payment_status: input.status } }).eq("payment_transaction_id", transactionId);
  } else {
    await supabase.from("invoices").update({ stripe_payment_status: input.status, updated_at: new Date().toISOString() }).eq("id", input.invoiceId);
  }
}
