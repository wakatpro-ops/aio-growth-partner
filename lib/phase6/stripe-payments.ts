import "server-only";
import crypto from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { sendEmail } from "@/lib/email/sendgrid";
import { getDocument } from "@/lib/phase2/business-data";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";

const demoStoreIds: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000101" },
  "store-auto-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000102" }
};

async function resolveStore(storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return { organizationId: demo?.organizationId ?? store.organization_id, storeId: demo?.storeId ?? store.id, publicStoreId: store.id, store };
}

async function requireEditor(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const role = access.organizationRoles[organizationId];
  if (!access.isPlatformAdmin && !["org_owner", "store_manager", "staff"].includes(role)) throw new Error("決済を操作する権限がありません。");
  return access;
}

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://app.aioboost.jp").replace(/\/$/, "");
}

async function stripePost(path: string, params: URLSearchParams, connectedAccountId: string, idempotencyKey?: string) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe決済の設定が未完了です。");
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "Stripe-Account": connectedAccountId,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: params,
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } } & Record<string, unknown>;
  if (!response.ok) throw new Error(payload.error?.message ?? "Stripe決済URLを作成できませんでした。");
  return payload as Record<string, unknown>;
}

export async function createInvoiceStripeCheckout(storeId: string, invoiceId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Stripe決済の準備ができていません。");
  const resolved = await resolveStore(storeId);
  await requireEditor(resolved.organizationId);
  const invoice = await getDocument(storeId, invoiceId, "invoices");
  if (!invoice) throw new Error("請求書が見つかりません。");
  if (invoice.total <= 0) throw new Error("請求金額が0円以下のため、決済URLを作成できません。");
  if (invoice.payment_status === "paid") throw new Error("この請求書は入金済みです。");
  const { data: integration } = await supabase.from("store_payment_integrations").select("*").eq("store_id", resolved.storeId).eq("provider", "stripe").maybeSingle();
  if (!integration || integration.status !== "connected" || !integration.external_account_id) throw new Error("店舗のStripeアカウントが未接続です。先に設定画面で接続してください。");
  if (!integration.charges_enabled) throw new Error("接続先Stripeアカウントで決済を受け付ける準備が完了していません。");
  const secretIsLive = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
  const metadata = integration.metadata && typeof integration.metadata === "object" ? integration.metadata as Record<string, unknown> : {};
  if (typeof metadata.livemode === "boolean" && metadata.livemode !== secretIsLive) throw new Error("Stripeの本番/テストモードが接続先アカウントと一致しません。管理者に確認してください。");

  const key = `invoice-checkout:${invoice.id}:${Math.round(invoice.total)}:${Date.parse(invoice.updated_at)}`;
  const { data: existing } = await supabase.from("store_payment_transactions").select("external_checkout_session_id, raw_payload, status").eq("store_id", resolved.storeId).eq("provider", "stripe").eq("idempotency_key", key).maybeSingle();
  const existingUrl = existing?.raw_payload && typeof existing.raw_payload === "object" ? (existing.raw_payload as Record<string, unknown>).checkout_url : null;
  if (typeof existingUrl === "string" && ["pending", "open"].includes(String(existing?.status))) return { url: existingUrl, reused: true };

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", `${baseUrl()}/stores/${storeId}/invoices/${invoiceId}?stripeCheckout=success`);
  params.set("cancel_url", `${baseUrl()}/stores/${storeId}/invoices/${invoiceId}?stripeCheckout=cancelled`);
  params.set("client_reference_id", invoice.id);
  params.set("line_items[0][price_data][currency]", "jpy");
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(invoice.total)));
  params.set("line_items[0][price_data][product_data][name]", `${resolved.store.name} ${invoice.document_number}`.slice(0, 120));
  params.set("line_items[0][price_data][product_data][description]", `${invoice.title}（税込・消費税${Math.round(invoice.tax_total).toLocaleString("ja-JP")}円）`.slice(0, 240));
  params.set("line_items[0][quantity]", "1");
  params.set("metadata[invoice_id]", invoice.id);
  params.set("metadata[store_id]", resolved.storeId);
  params.set("metadata[organization_id]", resolved.organizationId);
  params.set("metadata[stripe_account_id]", integration.external_account_id);
  params.set("payment_intent_data[metadata][invoice_id]", invoice.id);
  params.set("payment_intent_data[metadata][store_id]", resolved.storeId);
  params.set("payment_intent_data[metadata][organization_id]", resolved.organizationId);
  if (invoice.customer?.email) params.set("customer_email", invoice.customer.email);
  const session = await stripePost("/checkout/sessions", params, integration.external_account_id, key);
  const sessionId = String(session.id ?? "");
  const checkoutUrl = String(session.url ?? "");
  if (!sessionId || !checkoutUrl) throw new Error("Stripeから決済URLを取得できませんでした。");
  const { data: transaction, error } = await supabase.from("store_payment_transactions").upsert({
    organization_id: resolved.organizationId, store_id: resolved.storeId, invoice_id: invoice.id, provider: "stripe",
    external_payment_intent_id: `pending:${sessionId}`, external_checkout_session_id: sessionId, amount: invoice.total, currency: "jpy", status: "pending",
    customer_email: invoice.customer?.email ?? null, idempotency_key: key, raw_payload: { checkout_url: checkoutUrl, checkout_status: session.status ?? "open", mode: secretIsLive ? "live" : "test" },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider,idempotency_key" }).select("id").single();
  if (error) throw new Error(`決済URLの保存に失敗しました: ${error.message}`);
  await supabase.from("invoices").update({ stripe_payment_url: checkoutUrl, stripe_payment_id: sessionId, stripe_payment_status: "pending", updated_at: new Date().toISOString() }).eq("store_id", resolved.storeId).eq("id", invoice.id);
  await supabase.from("external_integration_logs").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, provider: "stripe", action_type: "checkout_session_created", status: "success", message: "請求書からStripe決済URLを作成しました。", metadata_json: { invoice_id: invoice.id, transaction_id: transaction?.id, checkout_session_id: sessionId, mode: secretIsLive ? "live" : "test" } });
  await logAuditEvent({ storeId, actionType: "stripe_checkout_created", targetType: "invoice", targetId: invoice.id, message: "請求書のStripe決済URLを作成しました。", metadata: { transaction_id: transaction?.id, mode: secretIsLive ? "live" : "test" } });
  return { url: checkoutUrl, reused: false };
}

export async function getInvoiceStripePayment(storeId: string, invoiceId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { transaction: null, receipt: null, issues: [] };
  const resolved = await resolveStore(storeId);
  const { data: transaction } = await supabase.from("store_payment_transactions").select("*").eq("store_id", resolved.storeId).eq("invoice_id", invoiceId).eq("provider", "stripe").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: receipt } = await supabase.from("payment_receipts").select("*").eq("store_id", resolved.storeId).eq("invoice_id", invoiceId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: issues } = receipt ? await supabase.from("payment_receipt_issues").select("*").eq("receipt_id", receipt.id).order("created_at", { ascending: false }).limit(30) : { data: [] };
  return { transaction, receipt, issues: issues ?? [] };
}

export async function getPaymentReceiptDocument(storeId: string, receiptId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStore(storeId);
  const { data } = await supabase.from("payment_receipts").select("*, invoice:invoices(document_number,title,invoice_registration_number,tax_10_subtotal,tax_10_amount,tax_8_subtotal,tax_8_amount,tax_total), store:stores(name,address)")
    .eq("store_id", resolved.storeId).eq("id", receiptId).maybeSingle();
  return data ?? null;
}

export async function getPublicPaymentReceiptDocument(token: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { data } = await supabase.from("payment_receipts").select("*, invoice:invoices(document_number,title,invoice_registration_number,tax_10_subtotal,tax_10_amount,tax_8_subtotal,tax_8_amount,tax_total), store:stores(name,address)")
    .eq("public_token_hash", tokenHash).gt("public_token_expires_at", new Date().toISOString()).maybeSingle();
  return data ?? null;
}

export async function recordPaymentReceiptIssue(storeId: string, receiptId: string, reissueReason?: string | null) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("領収書履歴の準備ができていません。");
  const resolved = await resolveStore(storeId);
  const access = await requireEditor(resolved.organizationId);
  const { data: receipt } = await supabase.from("payment_receipts").select("id, last_issued_at").eq("store_id", resolved.storeId).eq("id", receiptId).maybeSingle();
  if (!receipt) throw new Error("領収書が見つかりません。");
  await supabase.from("payment_receipt_issues").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, receipt_id: receiptId,
    issue_type: receipt.last_issued_at ? "reissue" : "issue", reissue_reason: reissueReason || null, delivery_status: "downloaded", issued_by: access.userId });
  await supabase.from("payment_receipts").update({ last_issued_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", receiptId);
}

export async function sendPaymentReceiptEmail(storeId: string, receiptId: string, recipientEmail: string, reissueReason?: string | null) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("領収書送付の準備ができていません。");
  const resolved = await resolveStore(storeId);
  const access = await requireEditor(resolved.organizationId);
  const email = recipientEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("送付先メールアドレスを確認してください。");
  const { data: receipt } = await supabase.from("payment_receipts").select("*, invoice:invoices(document_number,title)").eq("store_id", resolved.storeId).eq("id", receiptId).maybeSingle();
  if (!receipt) throw new Error("領収書が見つかりません。");
  if (receipt.status !== "issued") throw new Error("取消済みの領収書は送付できません。");
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${baseUrl()}/receipts/public/${token}`;
  const { error: tokenError } = await supabase.from("payment_receipts").update({ public_token_hash: tokenHash, public_token_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", receiptId);
  if (tokenError) throw new Error("領収書の安全なダウンロードリンクを準備できませんでした。");
  let result;
  try {
    result = await sendEmail({ to: email, subject: `領収書 ${receipt.receipt_number}`, templateKey: "payment_receipt",
      text: `${resolved.store.name}から領収書をお送りします。\n\n領収書番号: ${receipt.receipt_number}\n金額: ${Math.round(Number(receipt.amount)).toLocaleString("ja-JP")}円\n請求書: ${receipt.invoice?.document_number ?? ""}\n\n30日以内に以下からダウンロードしてください。\n${url}` });
  } catch {
    await supabase.from("payment_receipts").update({ public_token_hash: null, public_token_expires_at: null, updated_at: new Date().toISOString() }).eq("id", receiptId);
    throw new Error("領収書メールの送信中に通信エラーが発生しました。");
  }
  await supabase.from("payment_receipt_issues").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, receipt_id: receiptId,
    issue_type: receipt.last_sent_at ? "resend" : "send", reissue_reason: reissueReason || null, recipient_email: email,
    delivery_status: result.status, provider_message_id: result.ok ? result.providerMessageId : null, error_message: result.ok ? null : result.errorMessage, issued_by: access.userId });
  if (!result.ok) {
    await supabase.from("payment_receipts").update({ public_token_hash: null, public_token_expires_at: null, updated_at: new Date().toISOString() }).eq("id", receiptId);
    throw new Error(result.status === "skipped" ? "メール送信設定が未完了です。PDFをダウンロードして手動でお渡しください。" : "領収書メールを送信できませんでした。");
  }
  await supabase.from("payment_receipts").update({ last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", receiptId);
  await logAuditEvent({ storeId, actionType: "payment_receipt_sent", targetType: "payment_receipt", targetId: receiptId, message: "領収書をメール送付しました。", metadata: { recipient_domain: email.split("@")[1] } });
}
