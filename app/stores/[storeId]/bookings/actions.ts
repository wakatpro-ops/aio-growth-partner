"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";
import {
  archiveBooking,
  archiveBookingConfiguration,
  createBookingFromForm,
  createBookingResourceFromForm,
  createBookingServiceFromForm,
  restoreBooking,
  restoreBookingConfiguration,
  updateBookingFromForm,
  updateBookingResourceFromForm,
  updateBookingServiceFromForm
} from "@/lib/bookings";

function message(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "処理に失敗しました。");
}

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/bookings`);
  revalidatePath(`/stores/${storeId}/customers`);
  revalidatePath(`/stores/${storeId}`);
}

export async function createBookingAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  let bookingId = "";
  try { bookingId = await createBookingFromForm(storeId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/new?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/${bookingId}?saved=1`);
}

export async function updateBookingAction(storeId: string, bookingId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateBookingFromForm(storeId, bookingId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/${bookingId}?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/${bookingId}?saved=1`);
}

export async function archiveBookingAction(storeId: string, bookingId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await archiveBooking(storeId, bookingId); }
  catch (error) { redirect(`/stores/${storeId}/bookings/${bookingId}?error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings?view=deleted&deleted=1`);
}

export async function restoreBookingAction(storeId: string, bookingId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await restoreBooking(storeId, bookingId); }
  catch (error) { redirect(`/stores/${storeId}/bookings?view=deleted&error=${message(error)}`); }
  refresh(storeId);
  redirect(`/stores/${storeId}/bookings/${bookingId}?restored=1`);
}

export async function createBookingServiceAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await createBookingServiceFromForm(storeId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  refresh(storeId); revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?saved=service`);
}

export async function updateBookingServiceAction(storeId: string, serviceId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateBookingServiceFromForm(storeId, serviceId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  refresh(storeId); revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?saved=service`);
}

export async function createBookingResourceAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await createBookingResourceFromForm(storeId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  refresh(storeId); revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?saved=resource`);
}

export async function updateBookingResourceAction(storeId: string, resourceId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  try { await updateBookingResourceFromForm(storeId, resourceId, formData); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  refresh(storeId); revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?saved=resource`);
}

export async function archiveBookingConfigurationAction(storeId: string, type: "service" | "resource", targetId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await archiveBookingConfiguration(storeId, type, targetId); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?deleted=1`);
}

export async function restoreBookingConfigurationAction(storeId: string, type: "service" | "resource", targetId: string) {
  await requireStoreActionWriteAccess(storeId);
  try { await restoreBookingConfiguration(storeId, type, targetId); }
  catch (error) { redirect(`/stores/${storeId}/bookings/settings?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/bookings/settings`);
  redirect(`/stores/${storeId}/bookings/settings?restored=1`);
}
