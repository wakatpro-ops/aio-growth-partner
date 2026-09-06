import "server-only";

import crypto from "node:crypto";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { lineLinkCodeHash } from "@/lib/line/signature";

async function context(storeId: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access || !(await canEditStore(store.id, store.organization_id))) throw new Error("LINE予約を設定する権限がありません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

export async function getLineBookingIntegration(storeId: string, includeArchived = false) {
  const { store, supabase } = await context(storeId);
  let query = supabase.from("line_store_integrations").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error?.code === "42P01") return null;
  if (error) throw new Error(`LINE予約設定を取得できませんでした: ${error.message}`);
  return data;
}

export async function getLineBookingStats(storeId: string) {
  const { store, supabase } = await context(storeId);
  const [{ count: contacts }, { count: pendingBookings }, { count: scheduledReminders }, { data: recentLogs }] = await Promise.all([
    supabase.from("line_booking_contacts").select("id", { count: "exact", head: true }).eq("store_id", store.id).is("archived_at", null),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("source", "line").eq("status", "pending").is("archived_at", null),
    supabase.from("line_booking_reminders").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("status", "scheduled").is("archived_at", null),
    supabase.from("external_integration_logs").select("id,action_type,status,message,created_at").eq("store_id", store.id).eq("provider", "line").order("created_at", { ascending: false }).limit(8)
  ]);
  return { contacts: contacts ?? 0, pendingBookings: pendingBookings ?? 0, scheduledReminders: scheduledReminders ?? 0, recentLogs: recentLogs ?? [] };
}

export async function enableLineBookingIntegration(storeId: string) {
  const { store, access, supabase } = await context(storeId);
  const channelId = process.env.LINE_CHANNEL_ID?.trim();
  if (!channelId) throw new Error("LINE_CHANNEL_IDが本番環境へ設定されていません。");
  const { data: existing } = await supabase.from("line_store_integrations").select("id, archived_at").eq("store_id", store.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  let integrationId: string;
  let restored = false;
  if (existing) {
    const { error } = await supabase.from("line_store_integrations").update({
      channel_id: channelId,
      official_account_basic_id: process.env.LINE_OFFICIAL_ACCOUNT_BASIC_ID?.trim() || "@056miwxi",
      display_name: store.name,
      status: "active",
      booking_enabled: true,
      archived_at: null,
      archived_by: null,
      updated_at: new Date().toISOString(),
      updated_by: access.userId
    }).eq("id", existing.id);
    if (error) throw new Error(`LINE予約を有効にできませんでした: ${error.message}`);
    integrationId = String(existing.id);
    restored = Boolean(existing.archived_at);
  } else {
    const { data, error } = await supabase.from("line_store_integrations").insert({
      organization_id: store.organization_id,
      store_id: store.id,
      channel_id: channelId,
      official_account_basic_id: process.env.LINE_OFFICIAL_ACCOUNT_BASIC_ID?.trim() || "@056miwxi",
      display_name: store.name,
      status: "active",
      booking_enabled: true,
      auto_confirm_bookings: false,
      created_by: access.userId,
      updated_by: access.userId
    }).select("id").single();
    if (error || !data) throw new Error(`LINE予約を有効にできませんでした: ${error?.message ?? "不明なエラー"}`);
    integrationId = String(data.id);
  }
  await supabase.from("audit_logs").insert({ organization_id: store.organization_id, store_id: store.id, actor_user_id: access.userId,
    action_type: restored ? "line_booking_restored" : "line_booking_enabled", target_type: "line_store_integration", target_id: integrationId,
    message: restored ? "LINE予約窓口を元に戻しました。" : "LINE予約窓口を有効にしました。", metadata: { auto_confirm_bookings: false } });
}

export async function updateLineBookingOptions(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  const autoConfirm = formData.get("auto_confirm_bookings") === "on";
  const bookingEnabled = formData.get("booking_enabled") === "on";
  const retentionDays = Math.min(3650, Math.max(30, Number(formData.get("retention_days") ?? 365) || 365));
  const { data, error } = await supabase.from("line_store_integrations").update({
    auto_confirm_bookings: autoConfirm,
    booking_enabled: bookingEnabled,
    retention_days: retentionDays,
    status: bookingEnabled ? "active" : "paused",
    updated_at: new Date().toISOString(),
    updated_by: access.userId
  }).eq("store_id", store.id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("LINE予約設定を確認できませんでした。");
  await supabase.from("audit_logs").insert({ organization_id: store.organization_id, store_id: store.id, actor_user_id: access.userId,
    action_type: "line_booking_options_updated", target_type: "line_store_integration", target_id: data.id,
    message: "LINE予約の受付方法を更新しました。", metadata: { auto_confirm_bookings: autoConfirm, booking_enabled: bookingEnabled, retention_days: retentionDays } });
}

export async function createLineStoreLinkCode(storeId: string) {
  const { store, access, supabase } = await context(storeId);
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) throw new Error("LINE_CHANNEL_SECRETが本番環境へ設定されていません。");
  const { data: integration, error: integrationError } = await supabase.from("line_store_integrations").select("id").eq("store_id", store.id).eq("status", "active").eq("booking_enabled", true).is("archived_at", null).maybeSingle();
  if (integrationError || !integration) throw new Error("先にLINE予約窓口を有効にしてください。");
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const now = new Date().toISOString();
  await supabase.from("line_store_link_codes").update({ archived_at: now, archived_by: access.userId }).eq("store_id", store.id).is("archived_at", null).is("consumed_at", null);
  const { error } = await supabase.from("line_store_link_codes").insert({
    integration_id: integration.id,
    organization_id: store.organization_id,
    store_id: store.id,
    code_hash: lineLinkCodeHash(code, channelSecret),
    code_hint: code.slice(-2),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    created_by: access.userId
  });
  if (error) throw new Error(`店舗連携コードを発行できませんでした: ${error.message}`);
  await supabase.from("audit_logs").insert({ organization_id: store.organization_id, store_id: store.id, actor_user_id: access.userId,
    action_type: "line_store_link_code_created", target_type: "line_store_integration", target_id: integration.id,
    message: "15分間有効なLINE店舗連携コードを発行しました。", metadata: {} });
  return { code, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
}

export async function archiveLineBookingIntegration(storeId: string) {
  const { store, access, supabase } = await context(storeId);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("line_store_integrations").update({ archived_at: now, archived_by: access.userId, status: "paused", booking_enabled: false, updated_at: now, updated_by: access.userId })
    .eq("store_id", store.id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error("削除するLINE予約設定を確認できませんでした。");
  await Promise.all([
    supabase.from("line_store_link_codes").update({ archived_at: now, archived_by: access.userId }).eq("store_id", store.id).is("archived_at", null),
    supabase.from("line_booking_conversations").update({ archived_at: now, archived_by: access.userId }).eq("store_id", store.id).is("archived_at", null),
    supabase.from("line_booking_reminders").update({ status: "cancelled", updated_at: now }).eq("store_id", store.id).in("status", ["scheduled", "processing", "failed"]),
    supabase.from("audit_logs").insert({ organization_id: store.organization_id, store_id: store.id, actor_user_id: access.userId,
      action_type: "line_booking_archived", target_type: "line_store_integration", target_id: data.id,
      message: "LINE予約窓口を削除済みに移しました。" })
  ]);
}
