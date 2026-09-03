"use server";

import { requireStoreStaffManagementAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { archiveStoreStaff, inviteStoreStaff, resendStoreStaffInvite, restoreStoreStaff, updateStoreStaff } from "@/lib/store-staff";

function message(error: unknown) {
  return encodeURIComponent(error instanceof Error ? error.message : "操作に失敗しました。");
}

export async function inviteStoreStaffAction(storeId: string, formData: FormData) {
  await requireStoreStaffManagementAccess(storeId);
  try { await inviteStoreStaff(storeId, formData); } catch (error) { redirect(`/stores/${storeId}/settings/staff/new?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/staff`);
  redirect(`/stores/${storeId}/settings/staff?invited=1`);
}

export async function updateStoreStaffAction(storeId: string, membershipId: string, formData: FormData) {
  await requireStoreStaffManagementAccess(storeId);
  try { await updateStoreStaff(storeId, membershipId, formData); } catch (error) { redirect(`/stores/${storeId}/settings/staff?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/staff`);
  redirect(`/stores/${storeId}/settings/staff?updated=1`);
}

export async function archiveStoreStaffAction(storeId: string, membershipId: string) {
  await requireStoreStaffManagementAccess(storeId);
  try { await archiveStoreStaff(storeId, membershipId); } catch (error) { redirect(`/stores/${storeId}/settings/staff?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/staff`);
  redirect(`/stores/${storeId}/settings/staff?deleted=1`);
}

export async function restoreStoreStaffAction(storeId: string, membershipId: string) {
  await requireStoreStaffManagementAccess(storeId);
  try { await restoreStoreStaff(storeId, membershipId); } catch (error) { redirect(`/stores/${storeId}/settings/staff/deleted?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/staff`);
  redirect(`/stores/${storeId}/settings/staff/deleted?restored=1`);
}

export async function resendStoreStaffInviteAction(storeId: string, membershipId: string) {
  await requireStoreStaffManagementAccess(storeId);
  try { await resendStoreStaffInvite(storeId, membershipId); } catch (error) { redirect(`/stores/${storeId}/settings/staff?error=${message(error)}`); }
  revalidatePath(`/stores/${storeId}/settings/staff`);
  redirect(`/stores/${storeId}/settings/staff?resent=1`);
}
