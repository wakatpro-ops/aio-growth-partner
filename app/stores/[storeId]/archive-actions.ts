"use server";

import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { setStoreEntityArchived, type StoreArchiveEntity } from "@/lib/archive-management";

function safeReturnPath(storeId: string, returnPath: string) {
  const prefix = `/stores/${storeId}`;
  return returnPath === prefix || returnPath.startsWith(`${prefix}/`) ? returnPath : prefix;
}

function resultPath(path: string, key: "archived" | "restored") {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=1`;
}

export async function archiveStoreEntityAction(
  storeId: string,
  entity: StoreArchiveEntity,
  recordId: string,
  returnPath: string
) {
  await setStoreEntityArchived(storeId, entity, recordId, true);
  const path = safeReturnPath(storeId, returnPath);
  revalidatePath(path);
  revalidatePath(`/stores/${storeId}/archives`);
  redirect(resultPath(path, "archived"));
}

export async function restoreStoreEntityAction(storeId: string, entity: StoreArchiveEntity, recordId: string) {
  await requireStoreActionWriteAccess(storeId);
  await setStoreEntityArchived(storeId, entity, recordId, false);
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/stores/${storeId}/archives`);
  redirect(`/stores/${storeId}/archives?restored=1`);
}
