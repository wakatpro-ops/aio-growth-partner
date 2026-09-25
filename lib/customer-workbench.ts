import "server-only";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Customer } from "@/types/phase2";

/** Read authorization always precedes use of the privileged DB client. No demo/error fallback. */
export async function readCustomerWorkbench(storeId: string) {
  const store = await getStore(storeId);
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("顧客データに接続できません。時間をおいて再度お試しください。");
  const totals = await db.from("customers").select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("organization_id", store.organization_id);
  if (totals.error || totals.count === null) throw new Error("顧客データを取得できませんでした。未登録とは異なる状態です。");
  const customers: Customer[] = [];
  // Read in pages: Supabase's default row cap must not silently truncate analysis.
  for (let from = 0; ; from += 500) {
    const page = await db.from("customers").select("*").eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).order("id").range(from, from + 499);
    if (page.error) throw new Error("顧客一覧を取得できませんでした。再読み込みしてください。");
    customers.push(...(page.data ?? []) as Customer[]);
    if ((page.data?.length ?? 0) < 500) break;
    if (from >= 49500) throw new Error("顧客件数が多いため一覧を表示できません。運営へお問い合わせください。");
  }
  return { customers, total: totals.count };
}

export async function registeredDataCount(storeId: string, table: "bookings" | "sales_transactions" | "items" | "search_visibility_snapshots") {
  const store = await getStore(storeId);
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("データ接続が未設定です。");
  const result = await db.from(table).select("id", { count: "exact", head: true }).eq("store_id", store.id).eq("organization_id", store.organization_id);
  if (result.error || result.count === null) throw new Error("登録状況を確認できませんでした。再読み込みしてください。");
  return result.count;
}
