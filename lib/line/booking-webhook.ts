import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { intervalsOverlap } from "@/lib/bookings/rules";
import { decryptLineUserId, encryptLineUserId, lineLinkCodeHash, lineUserHash, normalizeLineLinkCode } from "@/lib/line/signature";
import { formatLineDateTime, isAffirmative, isNegative, lineSlotCandidates, numericChoice, parseLineDateTime } from "@/lib/line/rules";
import { pushLineText, replyLineText } from "@/lib/line/messaging";
import type { LineConversationContext, LineConversationState, LineWebhookEvent } from "@/types/line-bookings";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type Row = Record<string, unknown> & {
  id: string;
  organization_id: string;
  store_id: string;
  integration_id: string;
  contact_id: string;
  customer_id: string | null;
  line_user_ciphertext: string;
  consent_version: string;
  consented_at: string | null;
  do_not_contact: boolean;
  archived_at: string | null;
  status: string;
  booking_enabled: boolean;
  auto_confirm_bookings: boolean;
  display_name: string;
  state: string;
  context: LineConversationContext;
  expires_at: string;
  name: string;
  starts_at: string;
  ends_at: string;
  service_name: string | null;
  customer_name: string;
  duration_minutes: number;
  resource_id: string;
  booking_resource_allocations: Row[];
  service: Row | Row[] | null;
};
type UpcomingBookingRow = { id: string; starts_at: string; status: string; service_name: string | null };

const mainMenu = "ご希望を番号で送ってください。\n①新しい予約\n②予約を確認\n③予約日時を変更\n④予約をキャンセル\n⑤LINE案内を停止";
const consentMessage = "このLINEで予約希望・変更・リマインドを受け取るため、店舗との関連付けと必要な予約情報の保存に同意しますか？\n①同意する\n②中止する";

function channelSecret() {
  const value = process.env.LINE_CHANNEL_SECRET;
  if (!value) throw new Error("LINE_CHANNEL_SECRET is not configured.");
  return value;
}

function cleanText(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function extractLinkCode(text: string) {
  const match = text.toUpperCase().match(/(?:^|\s)([A-F0-9]{8})(?:\s|$)/u) ?? text.toUpperCase().match(/([A-F0-9]{8})/u);
  return normalizeLineLinkCode(match?.[1] ?? "");
}

async function recordIntegrationLog(supabase: AdminClient, integration: Row, actionType: string, status: string, message: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("external_integration_logs").insert({
    organization_id: integration.organization_id,
    store_id: integration.store_id,
    provider: "line",
    action_type: actionType,
    status,
    message,
    metadata_json: metadata
  });
}

async function getConversation(supabase: AdminClient, contact: Row) {
  const { data } = await supabase.from("line_booking_conversations").select("*").eq("contact_id", contact.id).is("archived_at", null).maybeSingle();
  if (data && new Date(data.expires_at).getTime() > Date.now()) return data;
  if (data) await supabase.from("line_booking_conversations").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
  return null;
}

async function saveConversation(supabase: AdminClient, contact: Row, integration: Row, state: LineConversationState, context: LineConversationContext, eventId: string) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { data: existing } = await supabase.from("line_booking_conversations").select("id").eq("contact_id", contact.id).is("archived_at", null).maybeSingle();
  if (existing) {
    await supabase.from("line_booking_conversations").update({ state, context, last_event_id: eventId, expires_at: expiresAt, updated_at: now }).eq("id", existing.id);
  } else {
    await supabase.from("line_booking_conversations").insert({
      contact_id: contact.id,
      integration_id: integration.id,
      organization_id: integration.organization_id,
      store_id: integration.store_id,
      state,
      context,
      last_event_id: eventId,
      expires_at: expiresAt
    });
  }
  return { state, context };
}

async function archiveConversation(supabase: AdminClient, contactId: string) {
  await supabase.from("line_booking_conversations").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("contact_id", contactId).is("archived_at", null);
}

function numbered(items: Array<{ name: string }>, suffix = "") {
  return items.map((item, index) => `${index + 1}. ${item.name}${suffix}`).join("\n");
}

async function servicePrompt(supabase: AdminClient, contact: Row, integration: Row, eventId: string) {
  const { data } = await supabase.from("booking_services").select("id,name,duration_minutes").eq("store_id", integration.store_id).eq("is_bookable", true).is("archived_at", null).order("sort_order").order("name").limit(9);
  const options = (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name), durationMinutes: Number(row.duration_minutes) }));
  if (!options.length) return { text: "現在LINEで選べる予約内容がありません。店舗へ直接お問い合わせください。", state: "idle" as const };
  await saveConversation(supabase, contact, integration, "choosing_service", { serviceOptions: options, mode: "create" }, eventId);
  return { text: `予約内容を選んでください。\n${numbered(options)}`, state: "choosing_service" as const };
}

async function resourcePrompt(supabase: AdminClient, contact: Row, integration: Row, eventId: string, context: LineConversationContext) {
  const { data } = await supabase.from("booking_resources").select("id,name").eq("store_id", integration.store_id).eq("is_bookable", true).is("archived_at", null).order("sort_order").order("name").limit(8);
  const options = (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
  if (!options.length) {
    await saveConversation(supabase, contact, integration, "choosing_time", { ...context, resourceId: null, resourceName: null }, eventId);
    return "希望日時を送ってください。\n例：9/10 14:30";
  }
  await saveConversation(supabase, contact, integration, "choosing_resource", { ...context, resourceOptions: options }, eventId);
  return `担当者・設備の希望を選んでください。\n${numbered(options)}\n${options.length + 1}. 指定なし（店舗が調整）`;
}

async function availableSlots(supabase: AdminClient, input: { storeId: string; resourceId?: string | null; requested: string; durationMinutes: number; excludeBookingId?: string }) {
  const candidates = lineSlotCandidates(input.requested, 3).filter((value) => new Date(value).getTime() > Date.now());
  if (!input.resourceId || candidates.length === 0) return candidates;
  const rangeStart = candidates[0];
  const rangeEnd = new Date(new Date(candidates[candidates.length - 1]).getTime() + input.durationMinutes * 60_000).toISOString();
  const { data } = await supabase.from("bookings")
    .select("id,starts_at,ends_at,status,booking_resource_allocations!inner(resource_id,archived_at)")
    .eq("store_id", input.storeId)
    .eq("booking_resource_allocations.resource_id", input.resourceId)
    .is("booking_resource_allocations.archived_at", null)
    .is("archived_at", null)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", rangeEnd)
    .gt("ends_at", rangeStart);
  const existing = (data ?? []).filter((row) => String(row.id) !== input.excludeBookingId);
  return candidates.filter((startsAt) => {
    const endsAt = new Date(new Date(startsAt).getTime() + input.durationMinutes * 60_000).toISOString();
    return !existing.some((row) => intervalsOverlap({ startsAt, endsAt }, { startsAt: row.starts_at, endsAt: row.ends_at, status: row.status }));
  });
}

async function upcomingBookings(supabase: AdminClient, contactId: string) {
  const { data } = await supabase.from("bookings").select("id,starts_at,ends_at,status,service_name,customer_name,service:booking_services(duration_minutes)")
    .eq("line_contact_id", contactId).eq("source", "line").in("status", ["pending", "confirmed"]).gt("starts_at", new Date().toISOString()).is("archived_at", null).order("starts_at").limit(5);
  return data ?? [];
}

function bookingLabel(row: UpcomingBookingRow) {
  return `${formatLineDateTime(row.starts_at)} ${cleanText(row.service_name || "予約")}`;
}

async function linkContact(supabase: AdminClient, userId: string, text: string, eventId: string) {
  const code = extractLinkCode(text);
  if (!code) return null;
  const secret = channelSecret();
  const { data: link } = await supabase.from("line_store_link_codes").select("*,integration:line_store_integrations(*)")
    .eq("code_hash", lineLinkCodeHash(code, secret)).is("archived_at", null).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  const integration = Array.isArray(link?.integration) ? link.integration[0] : link?.integration;
  if (!link || !integration || integration.archived_at || integration.status !== "active" || !integration.booking_enabled) return null;
  // Claim the one-time code before creating a contact. The conditional update makes
  // concurrent deliveries safe: exactly one LINE account can consume the code.
  const claimed = await supabase.from("line_store_link_codes")
    .update({ consumed_at: new Date().toISOString(), archived_at: new Date().toISOString() })
    .eq("id", link.id).is("consumed_at", null).is("archived_at", null)
    .select("id").maybeSingle();
  if (claimed.error || !claimed.data) return null;
  const userHash = lineUserHash(userId, secret);
  let { data: contact } = await supabase.from("line_booking_contacts").select("*").eq("integration_id", integration.id).eq("line_user_hash", userHash).is("archived_at", null).maybeSingle();
  if (!contact) {
    const inserted = await supabase.from("line_booking_contacts").insert({
      integration_id: integration.id,
      organization_id: integration.organization_id,
      store_id: integration.store_id,
      line_user_hash: userHash,
      line_user_ciphertext: encryptLineUserId(userId, secret),
      last_interaction_at: new Date().toISOString()
    }).select("*").single();
    if (inserted.error || !inserted.data) throw new Error("LINE利用者を店舗へ関連付けできませんでした。");
    contact = inserted.data;
  } else {
    await supabase.from("line_booking_contacts").update({ last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", contact.id);
  }
  await saveConversation(supabase, contact, integration, "awaiting_consent", {}, eventId);
  await recordIntegrationLog(supabase, integration, "line_contact_linked", "success", "LINE利用者を店舗へ関連付けました。", { contact_id: contact.id });
  return { contact, integration, reply: `「${cleanText(integration.display_name || "店舗")}」の予約窓口へ接続しました。\n${consentMessage}` };
}

async function findLinkedContact(supabase: AdminClient, userId: string) {
  const secret = channelSecret();
  const { data: contacts } = await supabase.from("line_booking_contacts").select("*").eq("line_user_hash", lineUserHash(userId, secret)).is("archived_at", null).order("last_interaction_at", { ascending: false });
  const active: Array<{ contact: Row; integration: Row }> = [];
  for (const contact of contacts ?? []) {
    const { data: integration } = await supabase.from("line_store_integrations").select("*").eq("id", contact.integration_id).eq("status", "active").eq("booking_enabled", true).is("archived_at", null).maybeSingle();
    if (integration) active.push({ contact, integration });
  }
  return active;
}

async function ensureCustomer(supabase: AdminClient, contact: Row, integration: Row, name: string) {
  if (contact.customer_id) {
    await supabase.from("customers").update({ name, line_opt_in: true, updated_at: new Date().toISOString() }).eq("id", contact.customer_id).eq("store_id", integration.store_id);
    return String(contact.customer_id);
  }
  const { data, error } = await supabase.from("customers").insert({
    organization_id: integration.organization_id,
    store_id: integration.store_id,
    name,
    line_account: "LINE予約利用者",
    line_opt_in: true,
    preferred_channel: "line",
    import_source: "line_booking"
  }).select("id").single();
  if (error || !data) throw new Error("顧客情報を登録できませんでした。");
  await supabase.from("line_booking_contacts").update({ customer_id: data.id, updated_at: new Date().toISOString() }).eq("id", contact.id);
  return String(data.id);
}

async function stopLineMessages(supabase: AdminClient, contact: Row, integration: Row) {
  const now = new Date().toISOString();
  await supabase.from("line_booking_contacts").update({ do_not_contact: true, opted_out_at: now, consented_at: null, updated_at: now }).eq("id", contact.id);
  if (contact.customer_id) await supabase.from("customers").update({ line_opt_in: false, updated_at: now }).eq("id", contact.customer_id).eq("store_id", integration.store_id);
  await archiveConversation(supabase, contact.id);
  await recordIntegrationLog(supabase, integration, "line_contact_opted_out", "success", "LINE案内の配信停止を受け付けました。", { contact_id: contact.id });
  return "LINEでの予約案内とリマインドを停止しました。再開するときは「再開」と送ってください。";
}

async function processConversation(supabase: AdminClient, input: { contact: Row; integration: Row; text: string; eventId: string }) {
  let contact = input.contact;
  const { integration, text, eventId } = input;
  await supabase.from("line_booking_contacts").update({ last_interaction_at: new Date().toISOString() }).eq("id", contact.id);

  if (/^(?:配信停止|停止|ブロック)$/u.test(text)) return stopLineMessages(supabase, contact, integration);
  if (contact.do_not_contact) {
    if (!/^(?:再開|配信再開)$/u.test(text)) return "LINE案内は停止中です。再開するときは「再開」と送ってください。";
    await supabase.from("line_booking_contacts").update({ do_not_contact: false, opted_out_at: null, updated_at: new Date().toISOString() }).eq("id", contact.id);
    contact = { ...contact, do_not_contact: false };
    await saveConversation(supabase, contact, integration, "awaiting_consent", {}, eventId);
    return consentMessage;
  }

  let conversation = await getConversation(supabase, contact);
  if (!contact.consented_at && conversation?.state !== "awaiting_consent") {
    await saveConversation(supabase, contact, integration, "awaiting_consent", {}, eventId);
    return consentMessage;
  }
  if (!conversation) {
    conversation = { state: "idle", context: {} };
    await saveConversation(supabase, contact, integration, "idle", {}, eventId);
  }
  const state = conversation.state as LineConversationState;
  const context = (conversation.context ?? {}) as LineConversationContext;

  if (/^(?:予約|新規予約|最初から|やり直す)$/u.test(text)) return (await servicePrompt(supabase, contact, integration, eventId)).text;
  if (/^(?:メニュー|使い方|ヘルプ)$/u.test(text)) {
    await saveConversation(supabase, contact, integration, "idle", {}, eventId);
    return mainMenu;
  }

  if (state === "awaiting_consent") {
    if (isAffirmative(text)) {
      const now = new Date().toISOString();
      await supabase.from("line_booking_contacts").update({ consented_at: now, consent_version: integration.consent_version, do_not_contact: false, opted_out_at: null, updated_at: now }).eq("id", contact.id);
      contact = { ...contact, consented_at: now };
      await recordIntegrationLog(supabase, integration, "line_contact_consented", "success", "LINE予約利用への同意を受け付けました。", { contact_id: contact.id, consent_version: integration.consent_version });
      return (await servicePrompt(supabase, contact, integration, eventId)).text;
    }
    if (isNegative(text)) {
      await archiveConversation(supabase, contact.id);
      return "登録を中止しました。予約を始めるときは店舗から案内された連携コードを送ってください。";
    }
    return consentMessage;
  }

  if (state === "idle") {
    const choice = numericChoice(text, 5);
    if (choice === 0) return (await servicePrompt(supabase, contact, integration, eventId)).text;
    if (choice === 1 || /予約確認/u.test(text)) {
      const rows = await upcomingBookings(supabase, contact.id);
      return rows.length ? `現在の予約です。\n${rows.map((row, index) => `${index + 1}. ${bookingLabel(row)}（${row.status === "confirmed" ? "確定" : "店舗確認待ち"}）`).join("\n")}\n\n${mainMenu}` : `現在の予約はありません。\n\n${mainMenu}`;
    }
    if (choice === 2 || /変更/u.test(text)) {
      const rows = await upcomingBookings(supabase, contact.id);
      if (!rows.length) return `変更できる予約はありません。\n\n${mainMenu}`;
      const options = rows.map((row) => ({ id: String(row.id), label: bookingLabel(row) }));
      await saveConversation(supabase, contact, integration, "choosing_change_booking", { bookingOptions: options, mode: "reschedule" }, eventId);
      return `変更する予約を選んでください。\n${options.map((row, index) => `${index + 1}. ${row.label}`).join("\n")}`;
    }
    if (choice === 3 || /キャンセル/u.test(text)) {
      const rows = await upcomingBookings(supabase, contact.id);
      if (!rows.length) return `キャンセルできる予約はありません。\n\n${mainMenu}`;
      const options = rows.map((row) => ({ id: String(row.id), label: bookingLabel(row) }));
      await saveConversation(supabase, contact, integration, "choosing_cancel_booking", { bookingOptions: options }, eventId);
      return `キャンセルする予約を選んでください。\n${options.map((row, index) => `${index + 1}. ${row.label}`).join("\n")}`;
    }
    if (choice === 4) return stopLineMessages(supabase, contact, integration);
    return mainMenu;
  }

  if (state === "choosing_service") {
    const options = context.serviceOptions ?? [];
    const choice = numericChoice(text, options.length);
    if (choice === null) return `番号で予約内容を選んでください。\n${numbered(options)}`;
    const selected = options[choice];
    return resourcePrompt(supabase, contact, integration, eventId, { ...context, serviceId: selected.id, serviceName: selected.name, durationMinutes: selected.durationMinutes });
  }

  if (state === "choosing_resource") {
    const options = context.resourceOptions ?? [];
    const choice = numericChoice(text, options.length + 1);
    if (choice === null) return `番号で担当者・設備を選んでください。\n${numbered(options)}\n${options.length + 1}. 指定なし（店舗が調整）`;
    const selected = choice < options.length ? options[choice] : null;
    await saveConversation(supabase, contact, integration, "choosing_time", { ...context, resourceId: selected?.id ?? null, resourceName: selected?.name ?? null }, eventId);
    return "希望日時を送ってください。\n例：9/10 14:30";
  }

  if (state === "choosing_time" || state === "entering_reschedule_time") {
    const requested = parseLineDateTime(text);
    if (!requested) return "日時を読み取れませんでした。「9/10 14:30」のように送ってください。";
    let nextContext = { ...context };
    if (state === "entering_reschedule_time" && context.bookingId) {
      const { data: booking } = await supabase.from("bookings").select("id,service_id,service_name,service:booking_services(duration_minutes),booking_resource_allocations(resource_id,archived_at)").eq("id", context.bookingId).eq("line_contact_id", contact.id).maybeSingle();
      if (!booking) return "変更する予約を確認できませんでした。最初から操作してください。";
      const service = Array.isArray(booking.service) ? booking.service[0] : booking.service;
      const allocations = Array.isArray(booking.booking_resource_allocations) ? booking.booking_resource_allocations : [];
      nextContext = { ...nextContext, durationMinutes: Number(service?.duration_minutes ?? 60), resourceId: allocations.find((row) => !row.archived_at)?.resource_id ?? null };
    }
    const slots = await availableSlots(supabase, { storeId: integration.store_id, resourceId: nextContext.resourceId, requested, durationMinutes: nextContext.durationMinutes ?? 60, excludeBookingId: nextContext.bookingId });
    if (!slots.length) return "その時間帯には空きがありません。別の希望日時を送ってください。";
    const nextState = state === "entering_reschedule_time" ? "choosing_reschedule_slot" : "choosing_slot";
    await saveConversation(supabase, contact, integration, nextState, { ...nextContext, slotOptions: slots }, eventId);
    return `空き候補を選んでください。\n${slots.map((slot, index) => `${index + 1}. ${formatLineDateTime(slot)}`).join("\n")}`;
  }

  if (state === "choosing_slot" || state === "choosing_reschedule_slot") {
    const options = context.slotOptions ?? [];
    const choice = numericChoice(text, options.length);
    if (choice === null) return `番号で空き候補を選んでください。\n${options.map((slot, index) => `${index + 1}. ${formatLineDateTime(slot)}`).join("\n")}`;
    const startsAt = options[choice];
    if (state === "choosing_reschedule_slot") {
      await saveConversation(supabase, contact, integration, "confirming_reschedule", { ...context, startsAt }, eventId);
      return `予約日時を ${formatLineDateTime(startsAt)} に変更しますか？\n①変更する\n②中止する`;
    }
    await saveConversation(supabase, contact, integration, "entering_name", { ...context, startsAt }, eventId);
    return "最後に、予約される方のお名前を送ってください。";
  }

  if (state === "entering_name") {
    const customerName = cleanText(text, 80);
    if (customerName.length < 1) return "予約される方のお名前を送ってください。";
    await saveConversation(supabase, contact, integration, "confirming_booking", { ...context, customerName }, eventId);
    return `次の内容で予約を申し込みますか？\n${customerName} 様\n${cleanText(context.serviceName)}\n${formatLineDateTime(context.startsAt!)}\n${context.resourceName ? `希望：${context.resourceName}\n` : ""}①申し込む\n②中止する`;
  }

  if (state === "confirming_booking") {
    if (isNegative(text)) {
      await saveConversation(supabase, contact, integration, "idle", {}, eventId);
      return `予約申込みを中止しました。\n\n${mainMenu}`;
    }
    if (!isAffirmative(text)) return "①申し込む、または②中止するを選んでください。";
    await ensureCustomer(supabase, contact, integration, context.customerName!);
    const { data, error } = await supabase.rpc("create_line_store_booking", {
      p_integration_id: integration.id,
      p_contact_id: contact.id,
      p_service_id: context.serviceId,
      p_resource_id: context.resourceId ?? null,
      p_starts_at: context.startsAt,
      p_customer_name: context.customerName,
      p_event_id: eventId
    });
    if (error || !data) throw new Error(error?.message ?? "LINE予約を登録できませんでした。");
    await saveConversation(supabase, contact, integration, "idle", {}, eventId);
    return integration.auto_confirm_bookings && context.resourceId
      ? `予約が確定しました。\n${formatLineDateTime(context.startsAt!)} ${cleanText(context.serviceName)}\n前日にこのLINEへお知らせします。\n\n${mainMenu}`
      : `予約希望を受け付けました。\n${formatLineDateTime(context.startsAt!)} ${cleanText(context.serviceName)}\n店舗の確認後に確定します。\n\n${mainMenu}`;
  }

  if (state === "choosing_change_booking" || state === "choosing_cancel_booking") {
    const options = context.bookingOptions ?? [];
    const choice = numericChoice(text, options.length);
    if (choice === null) return `番号で予約を選んでください。\n${options.map((row, index) => `${index + 1}. ${row.label}`).join("\n")}`;
    const booking = options[choice];
    if (state === "choosing_change_booking") {
      await saveConversation(supabase, contact, integration, "entering_reschedule_time", { bookingId: booking.id, mode: "reschedule" }, eventId);
      return "新しい希望日時を送ってください。\n例：9/10 14:30";
    }
    await saveConversation(supabase, contact, integration, "confirming_cancel", { bookingId: booking.id, bookingOptions: [booking] }, eventId);
    return `「${booking.label}」をキャンセルしますか？\n①キャンセルする\n②中止する`;
  }

  if (state === "confirming_reschedule") {
    if (isNegative(text)) {
      await saveConversation(supabase, contact, integration, "idle", {}, eventId);
      return `変更を中止しました。\n\n${mainMenu}`;
    }
    if (!isAffirmative(text)) return "①変更する、または②中止するを選んでください。";
    const { error } = await supabase.rpc("reschedule_line_store_booking", { p_booking_id: context.bookingId, p_contact_id: contact.id, p_starts_at: context.startsAt, p_event_id: eventId });
    if (error) throw new Error(error.message);
    await saveConversation(supabase, contact, integration, "idle", {}, eventId);
    return `予約日時の変更希望を受け付けました。店舗確認後に確定します。\n${formatLineDateTime(context.startsAt!)}\n\n${mainMenu}`;
  }

  if (state === "confirming_cancel") {
    if (isNegative(text)) {
      await saveConversation(supabase, contact, integration, "idle", {}, eventId);
      return `キャンセル操作を中止しました。\n\n${mainMenu}`;
    }
    if (!isAffirmative(text)) return "①キャンセルする、または②中止するを選んでください。";
    const { error } = await supabase.rpc("cancel_line_store_booking", { p_booking_id: context.bookingId, p_contact_id: contact.id, p_event_id: eventId });
    if (error) throw new Error(error.message);
    await saveConversation(supabase, contact, integration, "idle", {}, eventId);
    return `予約をキャンセルしました。\n\n${mainMenu}`;
  }

  await saveConversation(supabase, contact, integration, "idle", {}, eventId);
  return mainMenu;
}

export async function beginLineWebhookEvent(supabase: AdminClient, input: { eventId: string; eventType: string; sourceHash?: string }) {
  const { error } = await supabase.from("line_webhook_events").insert({ event_id: input.eventId, event_type: input.eventType, source_hash: input.sourceHash ?? null, processing_status: "processing" });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`LINE Webhookイベントを記録できませんでした: ${error.message}`);
  const { data: existing } = await supabase.from("line_webhook_events").select("processing_status,attempt_count").eq("event_id", input.eventId).maybeSingle();
  if (existing?.processing_status !== "failed" || Number(existing.attempt_count) >= 3) return false;
  const claimed = await supabase.from("line_webhook_events")
    .update({ processing_status: "processing", attempt_count: Number(existing.attempt_count) + 1, error_message: null, processed_at: null })
    .eq("event_id", input.eventId).eq("processing_status", "failed").eq("attempt_count", Number(existing.attempt_count))
    .select("event_id").maybeSingle();
  if (claimed.error) throw new Error(`LINE Webhookイベントを再試行できませんでした: ${claimed.error.message}`);
  return Boolean(claimed.data);
}

export async function processLineWebhookEvent(event: LineWebhookEvent, eventId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const userId = cleanText(event.source?.userId, 200);
  const replyToken = cleanText(event.replyToken, 200);
  const text = cleanText(event.message?.text, 1000);
  const sourceHash = userId ? lineUserHash(userId, channelSecret()) : null;
  try {
    if (event.type !== "message" || event.message?.type !== "text" || !userId || !replyToken) {
      await supabase.from("line_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", eventId);
      return { ignored: true };
    }
    const linked = await linkContact(supabase, userId, text, eventId);
    if (linked) {
      await replyLineText(replyToken, linked.reply);
      await supabase.from("line_webhook_events").update({ integration_id: linked.integration.id, organization_id: linked.integration.organization_id, store_id: linked.integration.store_id, processing_status: "completed", processed_at: new Date().toISOString() }).eq("event_id", eventId);
      return { completed: true };
    }
    const contacts = await findLinkedContact(supabase, userId);
    if (contacts.length === 0) {
      await replyLineText(replyToken, "店舗との接続が必要です。店舗から案内された8文字の連携コードを送ってください。");
      await supabase.from("line_webhook_events").update({ processing_status: "ignored", processed_at: new Date().toISOString() }).eq("event_id", eventId);
      return { ignored: true };
    }
    const { contact, integration } = contacts[0];
    const response = await processConversation(supabase, { contact, integration, text, eventId });
    await replyLineText(replyToken, response);
    await supabase.from("line_store_integrations").update({ last_event_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", integration.id);
    await supabase.from("line_webhook_events").update({ integration_id: integration.id, organization_id: integration.organization_id, store_id: integration.store_id, processing_status: "completed", processed_at: new Date().toISOString() }).eq("event_id", eventId);
    return { completed: true, sourceHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LINE Webhook processing failed";
    await supabase.from("line_webhook_events").update({ processing_status: "failed", error_message: message.slice(0, 1000), processed_at: new Date().toISOString() }).eq("event_id", eventId);
    throw error;
  }
}

export async function processDueLineBookingReminders(limit = 50) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const now = new Date().toISOString();
  // Recover a reminder if a prior worker stopped after claiming it. Exhausted
  // reminders remain failed and are excluded by the attempt-count predicate below.
  await supabase.from("line_booking_reminders")
    .update({ status: "failed", next_retry_at: now, error_message: "前回の送信処理が完了しなかったため再試行します。", updated_at: now })
    .eq("status", "processing").lt("attempt_count", 3)
    .lt("last_attempt_at", new Date(Date.now() - 15 * 60_000).toISOString());
  const { data: reminders, error } = await supabase.from("line_booking_reminders").select("*")
    .in("status", ["scheduled", "failed"]).lt("attempt_count", 3).lte("scheduled_for", now)
    .or(`next_retry_at.is.null,next_retry_at.lte.${now}`).is("archived_at", null).order("scheduled_for").limit(limit);
  if (error?.code === "42P01") return { processed: 0, sent: 0, failed: 0 };
  if (error) throw new Error(error.message);
  let sent = 0;
  let failed = 0;
  for (const reminder of reminders ?? []) {
    const claimed = await supabase.from("line_booking_reminders")
      .update({ status: "processing", attempt_count: Number(reminder.attempt_count) + 1, last_attempt_at: now, updated_at: now })
      .eq("id", reminder.id).eq("attempt_count", Number(reminder.attempt_count)).in("status", ["scheduled", "failed"])
      .select("id").maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) continue;
    const [{ data: booking }, { data: contact }, { data: integration }, { data: store }] = await Promise.all([
      supabase.from("bookings").select("id,starts_at,status,service_name,customer_name").eq("id", reminder.booking_id).maybeSingle(),
      supabase.from("line_booking_contacts").select("*").eq("id", reminder.contact_id).maybeSingle(),
      supabase.from("line_store_integrations").select("*").eq("id", reminder.integration_id).maybeSingle(),
      supabase.from("stores").select("name").eq("id", reminder.store_id).maybeSingle()
    ]);
    if (!booking || !contact || !integration || contact.do_not_contact || !contact.consented_at || contact.archived_at || integration.status !== "active" || integration.archived_at || !["pending", "confirmed"].includes(booking.status)) {
      await supabase.from("line_booking_reminders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", reminder.id);
      continue;
    }
    try {
      const userId = decryptLineUserId(contact.line_user_ciphertext, channelSecret());
      await pushLineText(userId, `【${cleanText(store?.name || "店舗")}】予約前日のお知らせ\n${formatLineDateTime(booking.starts_at)} ${cleanText(booking.service_name || "ご予約")}\n変更・キャンセルはこのLINEへ「変更」または「キャンセル」と送ってください。`);
      await supabase.from("line_booking_reminders").update({ status: "sent", sent_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", reminder.id);
      await recordIntegrationLog(supabase, integration, "line_booking_reminder_sent", "success", "LINE予約リマインドを送信しました。", { booking_id: booking.id, reminder_id: reminder.id });
      sent += 1;
    } catch (sendError) {
      const attempt = Number(reminder.attempt_count) + 1;
      const message = sendError instanceof Error ? sendError.message : "LINE reminder failed";
      const exhausted = attempt >= 3;
      await supabase.from("line_booking_reminders").update({ status: "failed", error_message: message.slice(0, 1000), next_retry_at: exhausted ? null : new Date(Date.now() + attempt * 10 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", reminder.id);
      await recordIntegrationLog(supabase, integration, "line_booking_reminder_failed", exhausted ? "error" : "retry", "LINE予約リマインドの送信に失敗しました。", { booking_id: booking.id, reminder_id: reminder.id, attempt });
      failed += 1;
    }
  }
  return { processed: (reminders ?? []).length, sent, failed };
}
