"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateStoreFromForm } from "@/lib/stores";

export async function updateStoreProfileAction(storeId: string, formData: FormData) {
  await requireStoreActionWriteAccess(storeId);
  await updateStoreFromForm(storeId, formData);
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/aio-improvement`);
  revalidatePath(`/stores/${storeId}/settings`);
  redirect(`/stores/${storeId}/settings/profile?saved=1`);
}
