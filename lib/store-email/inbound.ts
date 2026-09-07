import "server-only";

import { classifyInboundStoreEmail } from "@/lib/store-email/classifier";
import { storeEmailFingerprint } from "@/lib/store-email/inboxes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StoreAiInbox } from "@/types/store-ai-inbox";

export type InboundStoreEmailInput = {
  recipients: string[];
  from: string;
  subject: string;
  text: string;
  html: string;
  headers: string;
};

function clean(value: string, maxLength: number) {
  return value.replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

export function parseMailbox(value: string) {
  const angle = value.match(/^\s*([^<]*)<([^>]+)>/u);
  const email = (angle?.[2] ?? value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]?.toLowerCase() ?? null;
  return { name: angle?.[1]?.replace(/^['"]|['"]$/gu, "").trim().slice(0, 200) || null, email };
}

export function messageIdFromHeaders(headers: string) {
  return headers.match(/^Message-ID:\s*(.+)$/imu)?.[1]?.trim().slice(0, 500)
    ?? headers.match(/^X-Message-Id:\s*(.+)$/imu)?.[1]?.trim().slice(0, 500)
    ?? null;
}

export async function processInboundStoreEmail(input: InboundStoreEmailInput) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Webhook storage is not configured.");
  const recipients = [...new Set(input.recipients.map((value) => parseMailbox(value).email).filter((value): value is string => Boolean(value)))].slice(0, 20);
  if (recipients.length === 0) return { accepted: false, reason: "no_recipient" as const };
  const { data: inboxData, error: inboxError } = await supabase.from("store_ai_inboxes").select("*")
    .in("email_address", recipients).eq("status", "active").is("archived_at", null).limit(1).maybeSingle();
  if (inboxError) throw new Error(inboxError.message);
  if (!inboxData) return { accepted: false, reason: "unknown_recipient" as const };
  const inbox = inboxData as StoreAiInbox;
  const { data: store } = await supabase.from("stores").select("id,status,archived_at").eq("id", inbox.store_id).eq("organization_id", inbox.organization_id).maybeSingle();
  if (!store || store.status !== "active" || store.archived_at) return { accepted: false, reason: "inactive_store" as const };

  const sender = parseMailbox(input.from);
  const subject = clean(input.subject, 300) || "件名なし";
  const body = clean(input.text || stripHtml(input.html), 25_000);
  const providerEventId = messageIdFromHeaders(input.headers);
  const fingerprint = storeEmailFingerprint({ inboxId: inbox.id, providerEventId, senderEmail: sender.email, subject, body });
  const classified = await classifyInboundStoreEmail({ subject, body, senderEmail: sender.email });
  const completeReservation = classified.category === "reservation"
    && Boolean(classified.extractedData.reservation_id)
    && (classified.bookingEventType === "cancelled" || (
      Boolean(classified.extractedData.customer_name)
      && Boolean(classified.extractedData.starts_at)
      && Boolean(classified.extractedData.ends_at)
    ));
  const processingStatus = classified.sensitive ? "rejected" : completeReservation ? "ready_to_apply" : "review_required";
  const senderDomain = sender.email?.split("@")[1] ?? null;
  const now = new Date().toISOString();
  let matchedTemplateId: string | null = null;
  if (sender.email && classified.bookingProvider && classified.bookingEventType && classified.templateFingerprint) {
    const { data: matchedTemplate, error: templateError } = await supabase
      .from("store_ai_email_templates")
      .select("id")
      .eq("organization_id", inbox.organization_id)
      .eq("store_id", inbox.store_id)
      .eq("sender_email", sender.email.toLowerCase())
      .eq("provider_key", classified.bookingProvider)
      .eq("event_type", classified.bookingEventType)
      .eq("template_fingerprint", classified.templateFingerprint)
      .eq("status", "active")
      .is("archived_at", null)
      .maybeSingle();
    if (templateError) throw new Error(templateError.message);
    matchedTemplateId = matchedTemplate?.id ? String(matchedTemplate.id) : null;
  }
  const { data: inserted, error } = await supabase.from("store_ai_email_messages").insert({
    inbox_id: inbox.id,
    organization_id: inbox.organization_id,
    store_id: inbox.store_id,
    provider_event_id: providerEventId,
    message_fingerprint: fingerprint,
    sender_name: classified.sensitive ? null : sender.name,
    sender_email: classified.sensitive ? null : sender.email,
    sender_domain: senderDomain,
    subject: classified.sensitive ? "機密性の高いメール" : subject,
    summary: classified.summary,
    category: classified.category,
    classification_confidence: classified.confidence,
    classification_reason: classified.reason,
    processing_status: processingStatus,
    requires_human_confirmation: !classified.sensitive,
    sensitive: classified.sensitive,
    known_template: classified.knownTemplate,
    booking_event_type: classified.bookingEventType,
    booking_provider: classified.bookingProvider,
    template_fingerprint: classified.templateFingerprint,
    matched_template_id: matchedTemplateId,
    extracted_data: classified.sensitive ? {} : classified.extractedData,
    received_at: now
  }).select("id").single();
  if (error?.code === "23505") return { accepted: true, duplicate: true, messageId: null };
  if (error || !inserted) throw new Error(error?.message ?? "Inbound email could not be saved.");
  await supabase.from("store_ai_inboxes").update({ last_received_at: now, updated_at: now }).eq("id", inbox.id);
  await supabase.from("audit_logs").insert({
    organization_id: inbox.organization_id,
    store_id: inbox.store_id,
    actor_user_id: null,
    action_type: "store_ai_email_received",
    target_type: "store_ai_email_message",
    target_id: inserted.id,
    message: "AI受信箱でメールを受信し、安全確認と分類を行いました。",
    metadata: {
      category: classified.category,
      confidence: classified.confidence,
      sensitive: classified.sensitive,
      booking_event_type: classified.bookingEventType,
      matched_template: Boolean(matchedTemplateId)
    }
  });

  const shouldAutoApply = inbox.auto_apply_reservations
    && Boolean(matchedTemplateId)
    && classified.knownTemplate
    && classified.confidence >= 0.98
    && completeReservation;
  if (shouldAutoApply) {
    const { error: applyError } = await supabase.rpc("apply_store_ai_email_event", {
      p_message_id: inserted.id,
      p_actor_user_id: null,
      p_automatic: true,
      p_learn_template: false
    });
    if (applyError) {
      await supabase.from("store_ai_email_messages").update({
        processing_status: "review_required",
        requires_human_confirmation: true,
        classification_reason: `${classified.reason} 学習済みの形式ですが、重複・日時衝突・対象予約不明などを確認してください。`,
        updated_at: new Date().toISOString()
      }).eq("id", inserted.id);
    }
  }
  return { accepted: true, duplicate: false, messageId: String(inserted.id) };
}
