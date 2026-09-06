"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";
import { archiveLineBookingIntegration, createLineStoreLinkCode, enableLineBookingIntegration, updateLineBookingOptions } from "@/lib/line/settings";

export type LineCodeActionState = { ok: boolean; message: string; code?: string; expiresAt?: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/bookings/line`);
  revalidatePath(`/stores/${storeId}/bookings`);
  revalidatePath(`/stores/${storeId}/settings`);
}

export async function enableLineBookingAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await enableLineBookingIntegration(storeId); }
  catch (error) { redirect(`/stores/${storeId}/bookings/line?error=${encodeURIComponent(errorMessage(error))}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/line?saved=enabled`);
}

export async function updateLineBookingOptionsAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateLineBookingOptions(storeId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/line?error=${encodeURIComponent(errorMessage(error))}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/line?saved=options`);
}

export async function createLineStoreLinkCodeAction(storeId: string, _previous: LineCodeActionState): Promise<LineCodeActionState> {
  void _previous;
  await requireStoreActionWriteAccess(storeId);
  try {
    const result = await createLineStoreLinkCode(storeId);
    refresh(storeId);
    return { ok: true, message: "15分間有効な店舗連携コードを発行しました。", ...result };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function archiveLineBookingAction(storeId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await archiveLineBookingIntegration(storeId); }
  catch (error) { redirect(`/stores/${storeId}/bookings/line?error=${encodeURIComponent(errorMessage(error))}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/line?deleted=1`);
}
