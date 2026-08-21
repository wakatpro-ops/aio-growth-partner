"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createCustomerImportJobFromForm,
  createCustomerMessageDraftFromForm,
  createCustomerNoteFromForm,
  executeCustomerImportFromForm,
  updateCustomerMessageDraftFromForm,
  updateCustomerNoteFromForm
} from "@/lib/customer-crm";

function errorParam(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

export async function uploadCustomerImportAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  let jobId: string | null = null;
  try {
    jobId = await createCustomerImportJobFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customers/import?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customers/import`);
  redirect(`/stores/${storeId}/customers/import/${jobId}`);
}

export async function executeCustomerImportAction(storeId: string, jobId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await executeCustomerImportFromForm(storeId, jobId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customers/import/${jobId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customers`);
  revalidatePath(`/stores/${storeId}/customer-segments`);
  revalidatePath(`/stores/${storeId}/customers/import`);
  redirect(`/stores/${storeId}/customers/import/${jobId}?completed=1`);
}

export async function createCustomerNoteAction(storeId: string, customerId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await createCustomerNoteFromForm(storeId, customerId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customers/${customerId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customers/${customerId}`);
  redirect(`/stores/${storeId}/customers/${customerId}?noteSaved=1`);
}

export async function updateCustomerNoteAction(storeId: string, customerId: string, noteId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await updateCustomerNoteFromForm(storeId, noteId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customers/${customerId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customers/${customerId}`);
  redirect(`/stores/${storeId}/customers/${customerId}?noteUpdated=1`);
}

export async function createCustomerMessageAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  let draftId: string | null = null;
  try {
    draftId = await createCustomerMessageDraftFromForm(storeId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customer-messages?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customer-messages`);
  redirect(`/stores/${storeId}/customer-messages/${draftId}?created=1`);
}

export async function updateCustomerMessageAction(storeId: string, draftId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await updateCustomerMessageDraftFromForm(storeId, draftId, formData);
  } catch (error) {
    redirect(`/stores/${storeId}/customer-messages/${draftId}?error=${errorParam(error)}`);
  }
  revalidatePath(`/stores/${storeId}/customer-messages`);
  revalidatePath(`/stores/${storeId}/customer-messages/${draftId}`);
  redirect(`/stores/${storeId}/customer-messages/${draftId}?saved=1`);
}
