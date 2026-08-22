"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateStoreOperatingModel } from "@/lib/stores";

export async function updateOperatingModelAction(storeId: string, formData: FormData) {
  await updateStoreOperatingModel(storeId, formData);
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/settings`);
  redirect(`/stores/${storeId}/settings/operations?saved=1`);
}
