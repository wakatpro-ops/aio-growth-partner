import "server-only";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EFFECTIVE_POS_SALES_FILTER } from "@/lib/pos/transaction-state";
import { buildSalesDashboard, salesPeriod, type SalesDashboardRow } from "./dashboard-rules";

export async function getSalesDashboard(storeId: string, now = new Date()) {
  const store = await getStore(storeId); // authorization before service-role reads
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("sales_database_unavailable");
  const period = salesPeriod(now), rows: SalesDashboardRow[] = [];
  let expected = 0;
  for (let from = 0; from < 50_000; from += 500) {
    const result = await db.from("sales_transactions")
      .select("id,business_date,gross_amount,payment_method,source_metadata", { count: "exact" })
      .eq("store_id", store.id).eq("organization_id", store.organization_id)
      .gte("business_date", period.previousStart).lte("business_date", period.today)
      .or(EFFECTIVE_POS_SALES_FILTER).order("id").range(from, from + 499);
    if (result.error || result.count === null || result.count > 50_000) throw new Error("sales_read_failed_or_limit");
    if (from === 0) expected = result.count;
    if (result.count !== expected) throw new Error("sales_changed_during_read");
    rows.push(...(result.data ?? []) as SalesDashboardRow[]);
    if (rows.length >= expected || (result.data?.length ?? 0) < 500) break;
  }
  if (rows.length !== expected || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("sales_incomplete_read");
  return buildSalesDashboard(rows, store.profile_data ?? {}, now);
}
