import "server-only";

import { notFound } from "next/navigation";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { bookingResourceTypeLabels, bookingSourceLabels, bookingStatusLabels } from "@/lib/bookings/constants";
import { parseJapanDateTimeLocal } from "@/lib/bookings/rules";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BookingResource, BookingResourceType, BookingService, BookingSource, BookingStatus, StoreBooking } from "@/types/bookings";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function formText(value: FormDataEntryValue | null, maxLength = 1000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function optionalUuid(value: FormDataEntryValue | null) {
  const candidate = formText(value, 36);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate) ? candidate : null;
}

function boundedInteger(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${min}〜${max}の整数で入力してください。`);
  return parsed;
}

function boundedNumber(value: FormDataEntryValue | null, fallback = 0, min = 0, max = 999_999_999) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error("金額を確認してください。");
  return parsed;
}

function color(value: FormDataEntryValue | null, fallback: string) {
  const candidate = formText(value, 7);
  return /^#[0-9a-f]{6}$/iu.test(candidate) ? candidate : fallback;
}

function bookingStatus(value: FormDataEntryValue | null): BookingStatus {
  const candidate = formText(value, 20) as BookingStatus;
  if (!Object.hasOwn(bookingStatusLabels, candidate)) throw new Error("予約の状態を選び直してください。");
  return candidate;
}

function bookingSource(value: FormDataEntryValue | null): BookingSource {
  const candidate = formText(value, 20) as BookingSource;
  if (!Object.hasOwn(bookingSourceLabels, candidate)) throw new Error("受付経路を選び直してください。");
  return candidate;
}

function resourceType(value: FormDataEntryValue | null): BookingResourceType {
  const candidate = formText(value, 20) as BookingResourceType;
  if (!Object.hasOwn(bookingResourceTypeLabels, candidate)) throw new Error("担当・設備の種別を選び直してください。");
  return candidate;
}

async function readContext(storeId: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, supabase };
}

async function writeContext(storeId: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access) throw new Error("ログインが必要です。");
  if (!(await canEditStore(store.id, store.organization_id))) throw new Error("この店舗の予約を変更する権限がありません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

async function recordAudit(supabase: SupabaseAdmin, input: {
  organizationId: string;
  storeId: string;
  actorUserId: string;
  actionType: string;
  targetType: "booking_service" | "booking_resource";
  targetId: string;
  message: string;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: input.storeId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId,
    message: input.message,
    metadata: {}
  });
  if (error) throw new Error(`操作履歴を記録できませんでした: ${error.message}`);
}

export async function listBookingServices(storeId: string, includeArchived = false): Promise<BookingService[]> {
  const { store, supabase } = await readContext(storeId);
  let query = supabase.from("booking_services").select("*").eq("store_id", store.id).order("sort_order").order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`予約内容を取得できませんでした: ${error.message}`);
  return (data ?? []) as BookingService[];
}

export async function listBookingResources(storeId: string, includeArchived = false): Promise<BookingResource[]> {
  const { store, supabase } = await readContext(storeId);
  let query = supabase.from("booking_resources").select("*").eq("store_id", store.id).order("sort_order").order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`担当・設備を取得できませんでした: ${error.message}`);
  return (data ?? []) as BookingResource[];
}

async function attachAllocations(supabase: SupabaseAdmin, rows: StoreBooking[]) {
  if (rows.length === 0) return rows;
  const { data, error } = await supabase
    .from("booking_resource_allocations")
    .select("id, booking_id, resource_id, resource:booking_resources(id,name,resource_type,color)")
    .in("booking_id", rows.map((row) => row.id))
    .is("archived_at", null);
  if (error) throw new Error(`予約の担当・設備を取得できませんでした: ${error.message}`);
  const byBooking = new Map<string, NonNullable<StoreBooking["allocations"]>>();
  for (const allocation of data ?? []) {
    const bookingId = String(allocation.booking_id);
    const current = byBooking.get(bookingId) ?? [];
    const related = Array.isArray(allocation.resource) ? allocation.resource[0] : allocation.resource;
    current.push({
      id: String(allocation.id),
      booking_id: bookingId,
      resource_id: String(allocation.resource_id),
      resource: related ? {
        id: String(related.id),
        name: String(related.name),
        resource_type: related.resource_type as BookingResourceType,
        color: String(related.color)
      } : null
    });
    byBooking.set(bookingId, current);
  }
  return rows.map((row) => ({ ...row, allocations: byBooking.get(row.id) ?? [] }));
}

function japanDayRange(value: Date) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const startsAt = new Date(`${date}T00:00:00+09:00`);
  return {
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 24 * 60 * 60_000).toISOString()
  };
}

export type BookingListView = "today" | "upcoming" | "past" | "deleted";

export async function listBookings(storeId: string, view: BookingListView = "today", limit = 300): Promise<StoreBooking[]> {
  const { store, supabase } = await readContext(storeId);
  const now = new Date();
  const today = japanDayRange(now);
  let query = supabase
    .from("bookings")
    .select("*, customer:customers(id,name,phone,email), service:booking_services(id,name,duration_minutes,color)")
    .eq("store_id", store.id)
    .order("starts_at", { ascending: view !== "past" })
    .limit(limit);
  if (view === "deleted") query = query.not("archived_at", "is", null);
  else query = query.is("archived_at", null);
  if (view === "today") query = query.gte("starts_at", today.startsAt).lt("starts_at", today.endsAt);
  if (view === "upcoming") query = query.gte("starts_at", today.endsAt);
  if (view === "past") query = query.lt("starts_at", today.startsAt);
  const { data, error } = await query;
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`予約を取得できませんでした: ${error.message}`);
  return attachAllocations(supabase, (data ?? []) as unknown as StoreBooking[]);
}

export async function getBooking(storeId: string, bookingId: string, includeArchived = false): Promise<StoreBooking | null> {
  const { store, supabase } = await readContext(storeId);
  let query = supabase
    .from("bookings")
    .select("*, customer:customers(id,name,phone,email), service:booking_services(id,name,duration_minutes,color)")
    .eq("store_id", store.id)
    .eq("id", bookingId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`予約を取得できませんでした: ${error.message}`);
  if (!data) return null;
  return (await attachAllocations(supabase, [data as unknown as StoreBooking]))[0] ?? null;
}

async function bookingFormPayload(storeId: string, formData: FormData) {
  const { store, access, supabase } = await writeContext(storeId);
  const customerId = optionalUuid(formData.get("customer_id"));
  const serviceId = optionalUuid(formData.get("service_id"));
  const resourceIds = [...new Set(formData.getAll("resource_ids").map((value) => optionalUuid(value)).filter((value): value is string => Boolean(value)))];
  const customerName = formText(formData.get("customer_name"), 200);
  const customerPhone = formText(formData.get("customer_phone"), 50);
  const customerEmail = formText(formData.get("customer_email"), 320).toLowerCase();
  const serviceName = formText(formData.get("service_name"), 200);
  const notes = formText(formData.get("notes"), 3000);
  if (!customerName) throw new Error("お客様名を入力してください。");
  if (customerEmail && !/^\S+@\S+\.\S+$/u.test(customerEmail)) throw new Error("メールアドレスを確認してください。");
  const startsAt = parseJapanDateTimeLocal(formText(formData.get("starts_at"), 16));
  const endsAt = parseJapanDateTimeLocal(formText(formData.get("ends_at"), 16));
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("終了日時は開始日時より後にしてください。");
  return {
    store,
    access,
    supabase,
    rpc: {
      p_organization_id: store.organization_id,
      p_store_id: store.id,
      p_customer_id: customerId,
      p_service_id: serviceId,
      p_status: bookingStatus(formData.get("status")),
      p_source: bookingSource(formData.get("source")),
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_customer_email: customerEmail,
      p_service_name: serviceName,
      p_notes: notes,
      p_resource_ids: resourceIds,
      p_actor_user_id: access.userId
    }
  };
}

export async function createBookingFromForm(storeId: string, formData: FormData) {
  const input = await bookingFormPayload(storeId, formData);
  const { data, error } = await input.supabase.rpc("create_store_booking", input.rpc);
  if (error) throw new Error(error.message);
  return String(data);
}

export async function updateBookingFromForm(storeId: string, bookingId: string, formData: FormData) {
  const input = await bookingFormPayload(storeId, formData);
  const { error } = await input.supabase.rpc("update_store_booking", { p_booking_id: bookingId, ...input.rpc });
  if (error) throw new Error(error.message);
}

export async function archiveBooking(storeId: string, bookingId: string) {
  const { store, access, supabase } = await writeContext(storeId);
  const { error } = await supabase.rpc("archive_store_booking", {
    p_booking_id: bookingId,
    p_organization_id: store.organization_id,
    p_store_id: store.id,
    p_actor_user_id: access.userId
  });
  if (error) throw new Error(error.message);
}

export async function restoreBooking(storeId: string, bookingId: string) {
  const { store, access, supabase } = await writeContext(storeId);
  const { error } = await supabase.rpc("restore_store_booking", {
    p_booking_id: bookingId,
    p_organization_id: store.organization_id,
    p_store_id: store.id,
    p_actor_user_id: access.userId
  });
  if (error) throw new Error(error.message);
}

export async function createBookingServiceFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await writeContext(storeId);
  const name = formText(formData.get("name"), 200);
  if (!name) throw new Error("予約内容の名称を入力してください。");
  const { data, error } = await supabase.from("booking_services").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    item_id: optionalUuid(formData.get("item_id")),
    name,
    description: formText(formData.get("description"), 1000) || null,
    duration_minutes: boundedInteger(formData.get("duration_minutes"), 60, 5, 1440),
    buffer_before_minutes: boundedInteger(formData.get("buffer_before_minutes"), 0, 0, 360),
    buffer_after_minutes: boundedInteger(formData.get("buffer_after_minutes"), 0, 0, 360),
    price: boundedNumber(formData.get("price")),
    color: color(formData.get("color"), "#248565"),
    is_bookable: formData.get("is_bookable") === "on",
    sort_order: boundedInteger(formData.get("sort_order"), 0, 0, 9999),
    created_by: access.userId,
    updated_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`予約内容を登録できませんでした: ${error?.message ?? "不明なエラー"}`);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "booking_service_created", targetType: "booking_service", targetId: String(data.id), message: `${name}を予約内容へ登録しました。` });
}

export async function updateBookingServiceFromForm(storeId: string, serviceId: string, formData: FormData) {
  const { store, access, supabase } = await writeContext(storeId);
  const name = formText(formData.get("name"), 200);
  if (!name) throw new Error("予約内容の名称を入力してください。");
  const { data, error } = await supabase.from("booking_services").update({
    item_id: optionalUuid(formData.get("item_id")), name,
    description: formText(formData.get("description"), 1000) || null,
    duration_minutes: boundedInteger(formData.get("duration_minutes"), 60, 5, 1440),
    buffer_before_minutes: boundedInteger(formData.get("buffer_before_minutes"), 0, 0, 360),
    buffer_after_minutes: boundedInteger(formData.get("buffer_after_minutes"), 0, 0, 360),
    price: boundedNumber(formData.get("price")), color: color(formData.get("color"), "#248565"),
    is_bookable: formData.get("is_bookable") === "on", sort_order: boundedInteger(formData.get("sort_order"), 0, 0, 9999),
    updated_by: access.userId, updated_at: new Date().toISOString()
  }).eq("id", serviceId).eq("store_id", store.id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error(`予約内容を更新できませんでした: ${error?.message ?? "対象を確認できません"}`);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "booking_service_updated", targetType: "booking_service", targetId: serviceId, message: `${name}の予約設定を更新しました。` });
}

export async function createBookingResourceFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await writeContext(storeId);
  const name = formText(formData.get("name"), 200);
  if (!name) throw new Error("担当者・設備の名称を入力してください。");
  const type = resourceType(formData.get("resource_type"));
  const { data, error } = await supabase.from("booking_resources").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    resource_type: type,
    name,
    capacity: boundedInteger(formData.get("capacity"), 1, 1, 100),
    color: color(formData.get("color"), "#5478d4"),
    is_bookable: formData.get("is_bookable") === "on",
    sort_order: boundedInteger(formData.get("sort_order"), 0, 0, 9999),
    created_by: access.userId,
    updated_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`担当・設備を登録できませんでした: ${error?.message ?? "不明なエラー"}`);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "booking_resource_created", targetType: "booking_resource", targetId: String(data.id), message: `${name}を${bookingResourceTypeLabels[type]}として登録しました。` });
}

export async function updateBookingResourceFromForm(storeId: string, resourceId: string, formData: FormData) {
  const { store, access, supabase } = await writeContext(storeId);
  const name = formText(formData.get("name"), 200);
  if (!name) throw new Error("担当者・設備の名称を入力してください。");
  const type = resourceType(formData.get("resource_type"));
  const { data, error } = await supabase.from("booking_resources").update({
    resource_type: type, name, capacity: boundedInteger(formData.get("capacity"), 1, 1, 100),
    color: color(formData.get("color"), "#5478d4"), is_bookable: formData.get("is_bookable") === "on",
    sort_order: boundedInteger(formData.get("sort_order"), 0, 0, 9999), updated_by: access.userId, updated_at: new Date().toISOString()
  }).eq("id", resourceId).eq("store_id", store.id).is("archived_at", null).select("id").maybeSingle();
  if (error || !data) throw new Error(`担当・設備を更新できませんでした: ${error?.message ?? "対象を確認できません"}`);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "booking_resource_updated", targetType: "booking_resource", targetId: resourceId, message: `${name}の予約設定を更新しました。` });
}

export async function archiveBookingConfiguration(storeId: string, type: "service" | "resource", targetId: string) {
  const { store, access, supabase } = await writeContext(storeId);
  const table = type === "service" ? "booking_services" : "booking_resources";
  const targetType = type === "service" ? "booking_service" : "booking_resource";
  const { data, error } = await supabase.from(table).update({ archived_at: new Date().toISOString(), archived_by: access.userId, updated_at: new Date().toISOString(), updated_by: access.userId }).eq("id", targetId).eq("store_id", store.id).is("archived_at", null).select("name").maybeSingle();
  if (error || !data) throw new Error("削除する設定を確認できませんでした。");
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: `${targetType}_archived`, targetType, targetId, message: `${String(data.name)}を削除しました。` });
}

export async function restoreBookingConfiguration(storeId: string, type: "service" | "resource", targetId: string) {
  const { store, access, supabase } = await writeContext(storeId);
  const table = type === "service" ? "booking_services" : "booking_resources";
  const targetType = type === "service" ? "booking_service" : "booking_resource";
  const { data, error } = await supabase.from(table).update({ archived_at: null, archived_by: null, updated_at: new Date().toISOString(), updated_by: access.userId }).eq("id", targetId).eq("store_id", store.id).not("archived_at", "is", null).select("name").maybeSingle();
  if (error || !data) throw new Error("元に戻す設定を確認できませんでした。同じ名称の有効な設定がないか確認してください。");
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: `${targetType}_restored`, targetType, targetId, message: `${String(data.name)}を元に戻しました。` });
}

export async function requireBooking(storeId: string, bookingId: string, includeArchived = false) {
  const booking = await getBooking(storeId, bookingId, includeArchived);
  if (!booking) notFound();
  return booking;
}
