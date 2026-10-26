export type ExpenseOverviewRow = {
  id: string;
  receipt_date: string | null;
  vendor_name: string | null;
  category_name: string | null;
  total_amount: number | string | null;
  approval_status: string | null;
  duplicate_of_id?: string | null;
  archived_at?: string | null;
};

export function validExpenseMonth(value: unknown): value is string {
  return typeof value === "string" && /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
}

export function expenseMonthBounds(month: string) {
  if (!validExpenseMonth(month)) throw new Error("invalid_expense_month");
  const [year, number] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, "0")}-01` };
}

export function expenseOverview(rows: ExpenseOverviewRow[], month: string) {
  expenseMonthBounds(month);
  const categories = new Map<string, number>();
  const entries: Array<ExpenseOverviewRow & { amount: number }> = [];
  let pendingCount = 0, duplicateCount = 0, invalidCount = 0, totalCents = 0;
  for (const row of rows) {
    if (row.archived_at || row.receipt_date?.slice(0, 7) !== month) continue;
    if (row.duplicate_of_id) { duplicateCount++; continue; }
    const amount = typeof row.total_amount === "string" && row.total_amount.trim() === "" ? NaN : Number(row.total_amount);
    if (row.total_amount === null || !Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) { invalidCount++; continue; }
    const cents = Math.round(amount * 100);
    const category = row.category_name?.trim() || "未分類";
    categories.set(category, (categories.get(category) ?? 0) + cents);
    totalCents += cents;
    if (row.approval_status !== "approved") pendingCount++;
    entries.push({ ...row, amount: cents / 100 });
  }
  if (!Number.isSafeInteger(totalCents)) throw new Error("expense_amount_limit");
  const breakdown = [...categories].map(([label, cents]) => ({ label, amount: cents / 100 }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "ja"));
  const hasNegative = entries.some(row => row.amount < 0);
  // Group only nonnegative, additive parts. Signed adjustments stay in the table.
  const chart = !hasNegative && breakdown.length > 6
    ? [...breakdown.slice(0, 5), { label: `その他（残り${breakdown.length - 5}分類）`, amount: breakdown.slice(5).reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100 }]
    : breakdown;
  return { month, total: totalCents / 100, count: entries.length, pendingCount, duplicateCount, invalidCount, hasNegative,
    breakdown, chart, entries: entries.sort((a, b) => (b.receipt_date ?? "").localeCompare(a.receipt_date ?? "") || a.id.localeCompare(b.id)) };
}

export type ExpenseOverview = ReturnType<typeof expenseOverview>;
