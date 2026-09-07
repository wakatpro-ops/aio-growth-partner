import "server-only";

import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import {
  getExternalBookingProvider,
  userSelectableExternalBookingStatuses
} from "@/lib/bookings/external-providers";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ExternalBookingConnection,
  ExternalBookingConnectionStatus,
  ExternalBookingProviderKey
} from "@/types/external-booking";

function optionalText(value: FormDataEntryValue | null, maxLength: number) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

async function context(storeId: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access || !(await canEditStore(store.id, store.organization_id))) {
    throw new Error("外部予約サービスを設定する権限がありません。");
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

export async function listExternalBookingConnections(storeId: string) {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("external_booking_connections")
    .select("*")
    .eq("store_id", store.id)
    .order("updated_at", { ascending: false });
  if (error?.code === "42P01") return [] as ExternalBookingConnection[];
  if (error) throw new Error(`外部予約サービスの状態を取得できませんでした: ${error.message}`);
  return (data ?? []) as ExternalBookingConnection[];
}

export async function startExternalBookingConnection(
  storeId: string,
  providerKey: ExternalBookingProviderKey,
  formData: FormData
) {
  const provider = getExternalBookingProvider(providerKey);
  if (!provider) throw new Error("対象の予約サービスを確認できません。");
  if (formData.get("owner_authorized") !== "on") {
    throw new Error("店舗の予約情報を接続準備に使用する権限を確認してください。");
  }
  const { store, access, supabase } = await context(storeId);
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("external_booking_connections")
    .select("id")
    .eq("store_id", store.id)
    .eq("provider_key", provider.key)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) throw new Error(`接続準備の状態を確認できませんでした: ${existingError.message}`);
  if (existing) throw new Error("この予約サービスの接続準備はすでに始まっています。");

  const { data, error } = await supabase.from("external_booking_connections").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    provider_key: provider.key,
    connection_mode: provider.mode,
    status: "preparing",
    external_account_label: optionalText(formData.get("external_account_label"), 200),
    external_store_id: optionalText(formData.get("external_store_id"), 200),
    contracted_plan: optionalText(formData.get("contracted_plan"), 200),
    notes: optionalText(formData.get("notes"), 2000),
    owner_authorized_at: now,
    owner_authorized_by: access.userId,
    created_by: access.userId,
    updated_by: access.userId,
    metadata: { provider_availability: provider.availabilityLabel }
  }).select("id").single();
  if (error || !data) throw new Error(`接続準備を開始できませんでした: ${error?.message ?? "不明なエラー"}`);
  await supabase.from("audit_logs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    actor_user_id: access.userId,
    action_type: "external_booking_connection_started",
    target_type: "external_booking_connection",
    target_id: data.id,
    message: `${provider.name}の読み取り接続準備を開始しました。`,
    metadata: { provider_key: provider.key, connection_mode: provider.mode }
  });
}

export async function updateExternalBookingConnection(
  storeId: string,
  connectionId: string,
  formData: FormData
) {
  const { store, access, supabase } = await context(storeId);
  const requestedStatus = String(formData.get("status") ?? "preparing") as ExternalBookingConnectionStatus;
  if (!userSelectableExternalBookingStatuses.includes(requestedStatus)) {
    throw new Error("接続済みへの変更は、API情報と読取テストを運営会社が確認した後に行います。");
  }
  const now = new Date().toISOString();
  const { data: current, error: currentError } = await supabase
    .from("external_booking_connections")
    .select("id,provider_key,status")
    .eq("id", connectionId)
    .eq("store_id", store.id)
    .eq("organization_id", store.organization_id)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError || !current) throw new Error("更新する接続準備を確認できませんでした。");
  const { error } = await supabase.from("external_booking_connections").update({
    status: requestedStatus,
    external_account_label: optionalText(formData.get("external_account_label"), 200),
    external_store_id: optionalText(formData.get("external_store_id"), 200),
    contracted_plan: optionalText(formData.get("contracted_plan"), 200),
    notes: optionalText(formData.get("notes"), 2000),
    application_requested_at: requestedStatus === "awaiting_provider" ? now : undefined,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", current.id).eq("store_id", store.id).eq("organization_id", store.organization_id);
  if (error) throw new Error(`接続準備を保存できませんでした: ${error.message}`);
  await supabase.from("audit_logs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    actor_user_id: access.userId,
    action_type: "external_booking_connection_updated",
    target_type: "external_booking_connection",
    target_id: current.id,
    message: `${getExternalBookingProvider(String(current.provider_key))?.name ?? "外部予約サービス"}の接続準備を更新しました。`,
    metadata: { previous_status: current.status, status: requestedStatus }
  });
}

export async function archiveExternalBookingConnection(storeId: string, connectionId: string) {
  const { store, access, supabase } = await context(storeId);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("external_booking_connections").update({
    archived_at: now,
    archived_by: access.userId,
    status: "paused",
    sync_enabled: false,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", connectionId).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id,provider_key").maybeSingle();
  if (error || !data) throw new Error("削除する接続準備を確認できませんでした。");
  await supabase.from("audit_logs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    actor_user_id: access.userId,
    action_type: "external_booking_connection_archived",
    target_type: "external_booking_connection",
    target_id: data.id,
    message: `${getExternalBookingProvider(String(data.provider_key))?.name ?? "外部予約サービス"}の接続準備を削除しました。認証・同期履歴は保持します。`
  });
}

export async function restoreExternalBookingConnection(storeId: string, connectionId: string) {
  const { store, access, supabase } = await context(storeId);
  const { data: target, error: targetError } = await supabase.from("external_booking_connections")
    .select("id,provider_key")
    .eq("id", connectionId)
    .eq("store_id", store.id)
    .eq("organization_id", store.organization_id)
    .not("archived_at", "is", null)
    .maybeSingle();
  if (targetError || !target) throw new Error("元に戻す接続準備を確認できませんでした。");
  const { data: active } = await supabase.from("external_booking_connections").select("id")
    .eq("store_id", store.id).eq("provider_key", target.provider_key).is("archived_at", null).maybeSingle();
  if (active) throw new Error("同じ予約サービスで進行中の接続準備があります。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("external_booking_connections").update({
    archived_at: null,
    archived_by: null,
    status: "preparing",
    sync_enabled: false,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", target.id).eq("store_id", store.id).eq("organization_id", store.organization_id);
  if (error) throw new Error(`接続準備を元に戻せませんでした: ${error.message}`);
  await supabase.from("audit_logs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    actor_user_id: access.userId,
    action_type: "external_booking_connection_restored",
    target_type: "external_booking_connection",
    target_id: target.id,
    message: `${getExternalBookingProvider(String(target.provider_key))?.name ?? "外部予約サービス"}の接続準備を元に戻しました。`
  });
}

export async function confirmExternalBookingReadConnection(storeId: string, connectionId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  if (!access.isPlatformAdmin) throw new Error("接続済みへ変更できるのは運営管理者だけです。");
  for (const key of ["provider_permission_verified", "store_match_verified", "read_test_verified"]) {
    if (formData.get(key) !== "on") throw new Error("提供会社の許諾、対象店舗、読み取りテストの3点を確認してください。");
  }
  const { data: current, error: currentError } = await supabase.from("external_booking_connections")
    .select("id,provider_key,status")
    .eq("id", connectionId)
    .eq("store_id", store.id)
    .eq("organization_id", store.organization_id)
    .is("archived_at", null)
    .maybeSingle();
  if (currentError || !current) throw new Error("確認する接続準備を確認できませんでした。");
  if (!["connection_test_required", "credentials_required"].includes(String(current.status))) {
    throw new Error("先にAPI情報の受領または接続テスト待ちまで進めてください。");
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("external_booking_connections").update({
    status: "connected_read_only",
    read_only: true,
    sync_enabled: true,
    connection_tested_at: now,
    connected_at: now,
    last_success_at: now,
    last_error: null,
    updated_at: now,
    updated_by: access.userId
  }).eq("id", current.id).eq("store_id", store.id).eq("organization_id", store.organization_id);
  if (error) throw new Error(`接続確認を保存できませんでした: ${error.message}`);
  await supabase.from("audit_logs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    actor_user_id: access.userId,
    action_type: "external_booking_connection_verified",
    target_type: "external_booking_connection",
    target_id: current.id,
    message: `${getExternalBookingProvider(String(current.provider_key))?.name ?? "外部予約サービス"}の許諾・店舗一致・読み取りテストを確認しました。`,
    metadata: { previous_status: current.status, status: "connected_read_only", read_only: true }
  });
}
