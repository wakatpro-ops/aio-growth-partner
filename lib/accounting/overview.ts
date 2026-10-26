import "server-only";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { mayReadStore } from "@/lib/auth/access-policy";
import { menuPermissions } from "@/lib/menu-workbench-rules";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { japanDay } from "@/lib/customer-workbench-rules";
import { expenseMonthBounds, expenseOverview, validExpenseMonth, type ExpenseOverview, type ExpenseOverviewRow } from "./overview-rules";

export type AccountingOverviewResult = { state: "ready"; report: ExpenseOverview; undatedCount: number }
  | { state: "restricted"; month: string } | { state: "unavailable"; month: string };

export async function getAccountingOverview(storeId: string, requestedMonth?: string): Promise<AccountingOverviewResult> {
  const month = validExpenseMonth(requestedMonth) ? requestedMonth : japanDay().slice(0, 7);
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  if (!access || !mayReadStore(access, store.id, store.organization_id) || !menuPermissions(access, store.organization_id, store.id).manager) return { state: "restricted", month };
  const db = createSupabaseAdminClient();
  if (!db) return { state: "unavailable", month };
  try {
    const base = () => db.from("expense_receipts").select("id,receipt_date,vendor_name,category_name,total_amount,approval_status,duplicate_of_id")
      .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null);
    let selectedMonth = month;
    if (!validExpenseMonth(requestedMonth)) {
      const latest = await base().not("receipt_date", "is", null).is("duplicate_of_id", null).order("receipt_date", { ascending: false }).limit(1).maybeSingle();
      if (latest.error) throw new Error("expense_read_failed");
      const latestMonth = latest.data?.receipt_date?.slice(0, 7);
      if (validExpenseMonth(latestMonth)) selectedMonth = latestMonth;
    }
    const undated = await db.from("expense_receipts").select("id", { count: "exact", head: true })
      .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).is("receipt_date", null).is("duplicate_of_id", null);
    if (undated.error) throw new Error("expense_read_failed");
    const { start, end } = expenseMonthBounds(selectedMonth);
    const records: ExpenseOverviewRow[] = [];
    for (let from = 0; from <= 50000; from += 500) {
      const result = await base().gte("receipt_date", start).lt("receipt_date", end).order("id").range(from, from + 499);
      if (result.error || from + (result.data?.length ?? 0) > 50000) throw new Error("expense_read_failed");
      records.push(...(result.data ?? []) as ExpenseOverviewRow[]);
      if ((result.data?.length ?? 0) < 500) return { state: "ready", report: expenseOverview(records, selectedMonth), undatedCount: undated.count ?? 0 };
    }
  } catch { /* A failed read must never become a zero or a sample result. */ }
  return { state: "unavailable", month };
}
