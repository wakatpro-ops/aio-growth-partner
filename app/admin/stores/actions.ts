"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/server";
import { archiveStore, restoreStore } from "@/lib/stores";

export async function archiveAdminStoreAction(storeId: string) {
  await requirePlatformAdmin();
  await archiveStore(storeId);
  revalidatePath("/admin/stores");
  revalidatePath("/stores");
  revalidatePath("/dashboard");
  redirect("/admin/stores?archived=1");
}

export async function restoreAdminStoreAction(storeId: string) {
  await requirePlatformAdmin();
  await restoreStore(storeId);
  revalidatePath("/admin/stores");
  revalidatePath("/stores");
  revalidatePath("/dashboard");
  redirect("/admin/stores?view=archived&restored=1");
}
