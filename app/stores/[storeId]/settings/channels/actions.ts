"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStoreActionWriteAccess } from "@/lib/auth/store-action-access";
import { disconnectInstagramLogin, refreshInstagramLogin } from "@/lib/instagram/service";

async function changeConnection(storeId: string, action: (storeId: string) => Promise<void>, flag: string) {
  await requireStoreActionWriteAccess(storeId);
  const path = `/stores/${storeId}/settings/channels`;
  let failure = "";
  try { await action(storeId); revalidatePath(path); revalidatePath(`/stores/${storeId}/marketing`); }
  catch (error) { failure = error instanceof Error ? error.message : "接続設定を変更できませんでした。"; }
  redirect(`${path}?${failure ? `error=${encodeURIComponent(failure)}` : `${flag}=1`}`);
}
export async function disconnectInstagramLoginAction(storeId: string) { await changeConnection(storeId, disconnectInstagramLogin, "instagram_disconnected"); }
export async function refreshInstagramLoginAction(storeId: string) { await changeConnection(storeId, refreshInstagramLogin, "instagram_refreshed"); }
