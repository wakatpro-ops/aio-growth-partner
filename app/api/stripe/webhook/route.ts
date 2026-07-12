import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type StripeWebhookObject = {
  id?: string;
  amount?: number;
  amount_received?: number;
  amount_total?: number;
  currency?: string;
  customer_email?: string;
  payment_intent?: string;
  status?: string;
  metadata?: Record<string, string | undefined>;
};

function verifyStripeSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function amountFromObject(object: StripeWebhookObject) {
  const amount = object.amount_received ?? object.amount_total ?? object.amount ?? 0;
  return Math.round(amount) / 100;
}

function normalizeStatus(eventType: string, object: StripeWebhookObject) {
  if (eventType.includes("succeeded") || eventType === "checkout.session.completed") return "paid";
  if (eventType.includes("failed")) return "failed";
  return object.status ?? "received";
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const object = event?.data?.object as StripeWebhookObject | undefined;
  const metadata = object?.metadata ?? {};
  const connectedAccountId = event.account ?? metadata.stripe_account_id;
  const supabase = createSupabaseAdminClient();
  if (!supabase || !object) return NextResponse.json({ received: true });

  let integration = null;
  if (connectedAccountId) {
    const { data } = await supabase
      .from("store_payment_integrations")
      .select("organization_id, store_id, external_account_id")
      .eq("provider", "stripe")
      .eq("external_account_id", connectedAccountId)
      .maybeSingle();
    integration = data;
  }

  const storeId = metadata.store_id ?? integration?.store_id;
  const organizationId = metadata.organization_id ?? integration?.organization_id;
  if (!storeId || !organizationId) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const externalPaymentIntentId =
    metadata.external_payment_id ?? object.payment_intent ?? object.id ?? `${event.id}`;
  const invoiceId = metadata.invoice_id || null;
  const status = normalizeStatus(event.type, object);
  const paidAt = status === "paid" ? new Date().toISOString() : null;

  await supabase.from("store_payment_transactions").upsert(
    {
      organization_id: organizationId,
      store_id: storeId,
      invoice_id: invoiceId,
      provider: "stripe",
      external_payment_intent_id: externalPaymentIntentId,
      external_checkout_session_id: event.type.startsWith("checkout.") ? object.id : null,
      amount: amountFromObject(object),
      currency: object.currency ?? "jpy",
      status,
      customer_email: object.customer_email ?? null,
      paid_at: paidAt,
      raw_payload: event,
      updated_at: new Date().toISOString()
    },
    { onConflict: "store_id,provider,external_payment_intent_id" }
  );

  await supabase.from("external_integration_logs").insert({
    organization_id: organizationId,
    store_id: storeId,
    provider: "stripe",
    action_type: `stripe_webhook_${event.type}`,
    status: "received",
    message: "Stripeから決済イベントを受信しました。",
    metadata_json: {
      event_id: event.id,
      event_type: event.type,
      connected_account_id: connectedAccountId,
      external_payment_intent_id: externalPaymentIntentId
    }
  });

  return NextResponse.json({ received: true });
}
