import "server-only";

import { canEditStore, canManageStoreStaff } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";

/** Shared authorization boundary for every store-scoped Server Action. */
export async function requireStoreActionWriteAccess(storeId: string) {
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) {
    throw new Error("この店舗の情報を変更する権限がありません。");
  }
  return store;
}

/** Owner-only boundary for store staff invitations, role changes and removals. */
export async function requireStoreStaffManagementAccess(storeId: string) {
  const store = await getStore(storeId);
  if (!(await canManageStoreStaff(store.organization_id))) {
    throw new Error("スタッフ権限を管理できるのは法人オーナーまたは運営管理者だけです。");
  }
  return store;
}
