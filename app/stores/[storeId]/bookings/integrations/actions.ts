"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";
import {
  archiveExternalBookingConnection,
  confirmExternalBookingReadConnection,
  restoreExternalBookingConnection,
  startExternalBookingConnection,
  updateExternalBookingConnection
} from "@/lib/bookings/external-connections";
import type { ExternalBookingProviderKey } from "@/types/external-booking";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/bookings/integrations`);
  revalidatePath(`/stores/${storeId}/bookings`);
  revalidatePath(`/stores/${storeId}/settings/integrations`);
}

async function run(storeId: string, task: () => Promise<void>, success: string) {
  await requireStoreActionWriteAccess(storeId);
  try {
    await task();
  } catch (error) {
    redirect(`/stores/${storeId}/bookings/integrations?error=${encodeURIComponent(errorMessage(error))}`);
  }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/integrations?${success}=1`);
}

export async function startExternalBookingConnectionAction(
  storeId: string,
  providerKey: ExternalBookingProviderKey,
  formData: FormData
) {
  return run(storeId, () => startExternalBookingConnection(storeId, providerKey, formData), "started");
}

export async function updateExternalBookingConnectionAction(storeId: string, connectionId: string, formData: FormData) {
  return run(storeId, () => updateExternalBookingConnection(storeId, connectionId, formData), "saved");
}

export async function archiveExternalBookingConnectionAction(storeId: string, connectionId: string) {
  return run(storeId, () => archiveExternalBookingConnection(storeId, connectionId), "deleted");
}

export async function restoreExternalBookingConnectionAction(storeId: string, connectionId: string) {
  return run(storeId, () => restoreExternalBookingConnection(storeId, connectionId), "restored");
}

export async function confirmExternalBookingReadConnectionAction(storeId: string, connectionId: string, formData: FormData) {
  return run(storeId, () => confirmExternalBookingReadConnection(storeId, connectionId, formData), "connected");
}
