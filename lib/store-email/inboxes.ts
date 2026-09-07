import "server-only";

import { createHash } from "node:crypto";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { parseJapanDateTimeLocal } from "@/lib/bookings/rules";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BookingEmailEventType, StoreAiEmailMessage, StoreAiEmailTemplate, StoreAiInbox, StoreEmailCategory } from "@/types/store-ai-inbox";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const editableCategories = new Set<StoreEmailCategory>([
  "reservation", "inquiry", "complaint", "review", "invoice_receipt", "purchasing",
  "inventory_shipping", "platform_notice", "advertising", "unknown"
]);

function formText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

async function context(storeId: string, mode: "read" | "edit" | "manage") {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access) throw new Error("ログインが必要です。");
  const editable = await canEditStore(store.id, store.organization_id);
  const organizationRole = access.organizationRoles[store.organization_id] ?? "";
  const storeRole = access.storeRoles[store.id] ?? "";
  const manageable = access.isPlatformAdmin
    || ["org_owner", "store_manager"].includes(organizationRole)
    || storeRole === "store_manager";
  if (mode !== "read" && !editable) throw new Error("この店舗のメールを処理する権限がありません。");
  if (mode === "manage" && !manageable) throw new Error("AI受信箱の設定を変更できるのは店舗オーナー・店舗管理者・運営管理者だけです。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase, editable, manageable };
}

async function audit(supabase: SupabaseAdmin, input: {
  organizationId: string;
  storeId: string;
  actorUserId: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: input.storeId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId,
    message: input.message,
    metadata: input.metadata ?? {}
  });
  if (error) throw new Error(`操作履歴を記録できませんでした: ${error.message}`);
}

export async function getStoreAiInbox(storeId: string, includeArchived = false): Promise<StoreAiInbox | null> {
  const { store, supabase } = await context(storeId, "read");
  let query = supabase.from("store_ai_inboxes").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw new Error(`AI受信箱を取得できませんでした: ${error.message}`);
  return data as StoreAiInbox | null;
}

export async function listStoreAiInboxes(storeId: string): Promise<StoreAiInbox[]> {
  const { store, supabase } = await context(storeId, "read");
  const { data, error } = await supabase.from("store_ai_inboxes").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`AI受信箱の履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as StoreAiInbox[];
}

export async function listStoreEmailMessages(storeId: string, options: { archived?: boolean; category?: StoreEmailCategory | null } = {}) {
  const { store, supabase } = await context(storeId, "read");
  let query = supabase.from("store_ai_email_messages").select("*").eq("store_id", store.id).order("received_at", { ascending: false }).limit(200);
  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (options.category) query = query.eq("category", options.category);
  const { data, error } = await query;
  if (error?.code === "42P01") return [] as StoreAiEmailMessage[];
  if (error) throw new Error(`受信メールを取得できませんでした: ${error.message}`);
  return (data ?? []) as StoreAiEmailMessage[];
}

export async function listStoreEmailTemplates(storeId: string, archived = false): Promise<StoreAiEmailTemplate[]> {
  const { store, supabase } = await context(storeId, "read");
  let query = supabase.from("store_ai_email_templates").select("*")
    .eq("store_id", store.id)
    .eq("organization_id", store.organization_id)
    .order("updated_at", { ascending: false });
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`学習済みメール形式を取得できませんでした: ${error.message}`);
  return (data ?? []) as StoreAiEmailTemplate[];
}

export async function updateStoreAiInboxSettings(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, "manage");
  const autoApply = formData.get("auto_apply_reservations") === "on";
  const { data, error } = await supabase.from("store_ai_inboxes").update({
    auto_apply_reservations: autoApply,
    updated_at: new Date().toISOString(),
    updated_by: access.userId
  }).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error(`AI受信箱の設定を保存できませんでした: ${error?.message ?? "受信箱が見つかりません"}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_inbox_settings_updated", targetType: "store_ai_inbox", targetId: String(data.id), message: "AI受信箱の自動処理設定を更新しました。", metadata: { auto_apply_reservations: autoApply } });
}

export async function setStoreAiInboxStatus(storeId: string, status: "active" | "paused") {
  const { store, access, supabase } = await context(storeId, "manage");
  const { data, error } = await supabase.from("store_ai_inboxes").update({ status, updated_at: new Date().toISOString(), updated_by: access.userId })
    .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("状態を変更するAI受信箱を確認できませんでした。");
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: `store_ai_inbox_${status}`, targetType: "store_ai_inbox", targetId: String(data.id), message: status === "active" ? "AI受信箱の受信を再開しました。" : "AI受信箱の受信を一時停止しました。" });
}

export async function rotateStoreAiInbox(storeId: string) {
  const { store, access, supabase } = await context(storeId, "manage");
  const { data, error } = await supabase.rpc("rotate_store_ai_inbox", {
    p_organization_id: store.organization_id,
    p_store_id: store.id,
    p_actor_user_id: access.userId
  });
  if (error || !data) throw new Error(`受信アドレスを再発行できませんでした: ${error?.message ?? "不明なエラー"}`);
  const inbox = data as StoreAiInbox;
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_inbox_rotated", targetType: "store_ai_inbox", targetId: inbox.id, message: "AI受信アドレスを再発行しました。以前のアドレスと受信履歴は保持します。" });
}

export async function archiveStoreAiInbox(storeId: string) {
  const { store, access, supabase } = await context(storeId, "manage");
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("store_ai_inboxes").update({ status: "paused", archived_at: now, archived_by: access.userId, updated_at: now, updated_by: access.userId })
    .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("削除するAI受信箱を確認できませんでした。");
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_inbox_archived", targetType: "store_ai_inbox", targetId: String(data.id), message: "AI受信箱を削除済みに移しました。受信履歴は保持します。" });
}

export async function restoreStoreAiInbox(storeId: string, inboxId: string) {
  const { store, access, supabase } = await context(storeId, "manage");
  const { data: active } = await supabase.from("store_ai_inboxes").select("id").eq("store_id", store.id).is("archived_at", null).maybeSingle();
  if (active) throw new Error("現在使用中のAI受信箱があります。元に戻す前に現在の受信箱を削除してください。");
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("store_ai_inboxes").update({ status: "active", archived_at: null, archived_by: null, updated_at: now, updated_by: access.userId })
    .eq("id", inboxId).eq("store_id", store.id).eq("organization_id", store.organization_id).not("archived_at", "is", null).select("id").maybeSingle();
  if (error || !data) throw new Error("元に戻すAI受信箱を確認できませんでした。");
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_inbox_restored", targetType: "store_ai_inbox", targetId: String(data.id), message: "AI受信箱を元に戻しました。" });
}

async function scopedMessage(storeId: string, messageId: string, mode: "edit" | "manage" = "edit") {
  const result = await context(storeId, mode);
  const { data, error } = await result.supabase.from("store_ai_email_messages").select("*")
    .eq("id", messageId).eq("store_id", result.store.id).eq("organization_id", result.store.organization_id).maybeSingle();
  if (error || !data) throw new Error("対象メールを確認できませんでした。");
  return { ...result, message: data as StoreAiEmailMessage };
}

export async function confirmStoreEmailRecord(storeId: string, messageId: string, formData: FormData) {
  const { store, access, supabase, message } = await scopedMessage(storeId, messageId);
  if (message.sensitive || message.category === "sensitive") throw new Error("自動処理対象外のメールは元の受信箱で確認してください。");
  const category = formText(formData.get("category"), 40) as StoreEmailCategory;
  if (!editableCategories.has(category) || category === "reservation") throw new Error("分類を選び直してください。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_messages").update({
    category,
    processing_status: "applied",
    requires_human_confirmation: false,
    reviewed_at: now,
    reviewed_by: access.userId,
    applied_target_type: "ai_inbox_record",
    applied_target_id: null,
    updated_at: now
  }).eq("id", message.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`確認結果を保存できませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_confirmed", targetType: "store_ai_email_message", targetId: message.id, message: "AI受信メールの分類と対応方針を確認しました。", metadata: { category } });
}

export async function applyStoreEmailReservation(storeId: string, messageId: string, formData: FormData) {
  const learnTemplate = formData.get("learn_template") === "on";
  const { store, access, supabase, message } = await scopedMessage(storeId, messageId, learnTemplate ? "manage" : "edit");
  if (message.sensitive) throw new Error("自動処理対象外のメールは予約へ反映できません。");
  const eventType = (message.booking_event_type ?? "created") as BookingEmailEventType;
  const reservationId = formText(formData.get("reservation_id"), 100);
  const customerName = formText(formData.get("customer_name"), 200);
  const customerEmail = formText(formData.get("customer_email"), 320).toLowerCase();
  const customerPhone = formText(formData.get("customer_phone"), 50);
  const serviceName = formText(formData.get("service_name"), 200);
  const startsAt = formText(formData.get("starts_at"), 40);
  const endsAt = formText(formData.get("ends_at"), 40);
  if (!reservationId) throw new Error("予約番号を入力してください。");
  if (eventType !== "cancelled" && !customerName) throw new Error("お客様名を入力してください。");
  if (customerEmail && !isEmail(customerEmail)) throw new Error("メールアドレスを確認してください。");
  const parseInputDate = (value: string) => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/u.test(value) ? value : parseJapanDateTimeLocal(value));
  const startDate = eventType === "cancelled" ? null : parseInputDate(startsAt);
  const endDate = eventType === "cancelled" ? null : parseInputDate(endsAt);
  if (eventType !== "cancelled" && (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate)) throw new Error("予約の開始・終了日時を確認してください。");
  const extractedData = {
    ...message.extracted_data,
    reservation_id: reservationId,
    customer_name: customerName || null,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    service_name: serviceName || null,
    ...(startDate && endDate ? { starts_at: startDate.toISOString(), ends_at: endDate.toISOString() } : {})
  };
  const { error: updateError } = await supabase.from("store_ai_email_messages").update({ category: "reservation", extracted_data: extractedData, updated_at: new Date().toISOString() })
    .eq("id", message.id).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null);
  if (updateError) throw new Error(`予約内容を保存できませんでした: ${updateError.message}`);
  const { data: bookingId, error } = await supabase.rpc("apply_store_ai_email_event", {
    p_message_id: message.id,
    p_actor_user_id: access.userId,
    p_automatic: false,
    p_learn_template: learnTemplate
  });
  if (error || !bookingId) throw new Error(`予約へ反映できませんでした: ${error?.message ?? "不明なエラー"}`);
  return String(bookingId);
}

async function scopedTemplate(storeId: string, templateId: string) {
  const result = await context(storeId, "manage");
  const { data, error } = await result.supabase.from("store_ai_email_templates").select("*")
    .eq("id", templateId)
    .eq("store_id", result.store.id)
    .eq("organization_id", result.store.organization_id)
    .maybeSingle();
  if (error || !data) throw new Error("対象の学習済みメール形式を確認できませんでした。");
  return { ...result, template: data as StoreAiEmailTemplate };
}

export async function setStoreEmailTemplateStatus(storeId: string, templateId: string, status: "active" | "paused") {
  const { store, access, supabase, template } = await scopedTemplate(storeId, templateId);
  if (template.archived_at) throw new Error("削除済みの形式は、先に元へ戻してください。");
  const { error } = await supabase.from("store_ai_email_templates").update({
    status,
    updated_at: new Date().toISOString(),
    updated_by: access.userId
  }).eq("id", template.id).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null);
  if (error) throw new Error(`自動処理ルールの状態を変更できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: `store_ai_email_template_${status}`,
    targetType: "store_ai_email_template",
    targetId: template.id,
    message: status === "active" ? "学習済みメール形式の自動処理を再開しました。" : "学習済みメール形式の自動処理を一時停止しました。"
  });
}

export async function archiveStoreEmailTemplate(storeId: string, templateId: string) {
  const { store, access, supabase, template } = await scopedTemplate(storeId, templateId);
  if (template.archived_at) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_templates").update({
    status: "paused",
    archived_at: now,
    archived_by: access.userId,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", template.id).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null);
  if (error) throw new Error(`自動処理ルールを削除済みに移せませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_template_archived", targetType: "store_ai_email_template", targetId: template.id, message: "学習済みメール形式を削除済みに移しました。受信履歴とルールの履歴は保持します。" });
}

export async function restoreStoreEmailTemplate(storeId: string, templateId: string) {
  const { store, access, supabase, template } = await scopedTemplate(storeId, templateId);
  if (!template.archived_at) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_templates").update({
    status: "paused",
    archived_at: null,
    archived_by: null,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", template.id).eq("store_id", store.id).eq("organization_id", store.organization_id).not("archived_at", "is", null);
  if (error?.code === "23505") throw new Error("同じメール形式のルールがすでにあります。現在のルールを確認してください。");
  if (error) throw new Error(`自動処理ルールを元に戻せませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_template_restored", targetType: "store_ai_email_template", targetId: template.id, message: "学習済みメール形式を停止状態で元に戻しました。内容を確認してから再開できます。" });
}

export async function ignoreStoreEmailMessage(storeId: string, messageId: string) {
  const { store, access, supabase, message } = await scopedMessage(storeId, messageId);
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_messages").update({ processing_status: "ignored", requires_human_confirmation: false, reviewed_at: now, reviewed_by: access.userId, updated_at: now })
    .eq("id", message.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`処理しない状態へ変更できませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_ignored", targetType: "store_ai_email_message", targetId: message.id, message: "AI受信メールを処理しない状態にしました。" });
}

export async function archiveStoreEmailMessage(storeId: string, messageId: string) {
  const { store, access, supabase, message } = await scopedMessage(storeId, messageId);
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_messages").update({ archived_at: now, archived_by: access.userId, updated_at: now })
    .eq("id", message.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`メールを削除済みに移せませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_archived", targetType: "store_ai_email_message", targetId: message.id, message: "AI受信メールを削除済みに移しました。解析結果は保持します。" });
}

export async function restoreStoreEmailMessage(storeId: string, messageId: string) {
  const { store, access, supabase, message } = await scopedMessage(storeId, messageId);
  if (!message.archived_at) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("store_ai_email_messages").update({ archived_at: null, archived_by: null, updated_at: now })
    .eq("id", message.id).eq("store_id", store.id).not("archived_at", "is", null);
  if (error) throw new Error(`メールを元に戻せませんでした: ${error.message}`);
  await audit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "store_ai_email_restored", targetType: "store_ai_email_message", targetId: message.id, message: "AI受信メールを元に戻しました。" });
}

export function storeEmailFingerprint(input: { inboxId: string; providerEventId?: string | null; senderEmail?: string | null; subject: string; body: string }) {
  return createHash("sha256").update([input.inboxId, input.providerEventId ?? "", input.senderEmail ?? "", input.subject, input.body].join("\u001f")).digest("hex");
}
