import "server-only";

import { canEditStore } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";

/** Shared authorization boundary for every store-scoped Server Action. */
export async function requireStoreActionWriteAccess(storeId: string) {
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) {
    throw new Error("この店舗の情報を変更する権限がありません。");
  }
  return store;
}

