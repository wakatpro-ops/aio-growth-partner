"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  applyStoreEmailReservation,
  archiveStoreAiInbox,
  archiveStoreEmailMessage,
  archiveStoreEmailTemplate,
  confirmStoreEmailRecord,
  ignoreStoreEmailMessage,
  restoreStoreAiInbox,
  restoreStoreEmailMessage,
  restoreStoreEmailTemplate,
  rotateStoreAiInbox,
  setStoreAiInboxStatus,
  setStoreEmailTemplateStatus,
  updateStoreAiInboxSettings
} from "@/lib/store-email/inboxes";

function message(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/ai-inbox`);
  revalidatePath(`/stores/${storeId}/bookings`);
  revalidatePath(`/stores/${storeId}`);
}

export async function updateInboxSettingsAction(storeId: string, formData: FormData) {
  try { await updateStoreAiInboxSettings(storeId, formData); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?saved=1`);
}

export async function setInboxStatusAction(storeId: string, status: "active" | "paused") {
  try { await setStoreAiInboxStatus(storeId, status); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?status=${status}`);
}

export async function rotateInboxAction(storeId: string) {
  try { await rotateStoreAiInbox(storeId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?rotated=1`);
}

export async function archiveInboxAction(storeId: string) {
  try { await archiveStoreAiInbox(storeId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?deleted=inbox`);
}

export async function restoreInboxAction(storeId: string, inboxId: string) {
  try { await restoreStoreAiInbox(storeId, inboxId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?view=deleted&error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?restored=inbox`);
}

export async function applyReservationAction(storeId: string, messageId: string, formData: FormData) {
  let bookingId = "";
  try { bookingId = await applyStoreEmailReservation(storeId, messageId, formData); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#message-${messageId}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/${bookingId}?saved=1`);
}

export async function confirmEmailRecordAction(storeId: string, messageId: string, formData: FormData) {
  try { await confirmStoreEmailRecord(storeId, messageId, formData); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#message-${messageId}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?confirmed=1`);
}

export async function ignoreEmailMessageAction(storeId: string, messageId: string) {
  try { await ignoreStoreEmailMessage(storeId, messageId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#message-${messageId}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?ignored=1`);
}

export async function archiveEmailMessageAction(storeId: string, messageId: string) {
  try { await archiveStoreEmailMessage(storeId, messageId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#message-${messageId}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?deleted=message`);
}

export async function restoreEmailMessageAction(storeId: string, messageId: string) {
  try { await restoreStoreEmailMessage(storeId, messageId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?view=deleted&error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?view=deleted&restored=message`);
}

export async function setEmailTemplateStatusAction(storeId: string, templateId: string, status: "active" | "paused") {
  try { await setStoreEmailTemplateStatus(storeId, templateId, status); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#learned-email-rules`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?template_status=${status}#learned-email-rules`);
}

export async function archiveEmailTemplateAction(storeId: string, templateId: string) {
  try { await archiveStoreEmailTemplate(storeId, templateId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?error=${message(error)}#learned-email-rules`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?template_deleted=1#learned-email-rules`);
}

export async function restoreEmailTemplateAction(storeId: string, templateId: string) {
  try { await restoreStoreEmailTemplate(storeId, templateId); }
  catch (error) { redirect(`/stores/${storeId}/ai-inbox?rules=deleted&error=${message(error)}#learned-email-rules`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/ai-inbox?rules=deleted&template_restored=1#learned-email-rules`);
}
