// Store calendar dates are JST business dates, never the browser/server timezone.
export function salesPeriod(now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const month = today.slice(0, 7), day = Number(today.slice(8));
  const [year, number] = month.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
  const previousLastDay = new Date(Date.UTC(year, number - 1, 0)).getUTCDate();
  return { month, today, start: `${month}-01`, previousMonth, previousStart: `${previousMonth}-01`, previousUntil: `${previousMonth}-${String(Math.min(day, previousLastDay)).padStart(2, "0")}` };
}

export type SalesDashboardRow = { id: string; business_date: string; gross_amount: number | string; payment_method: string | null; source_metadata?: Record<string, unknown> | null };
export type SalesPoint = { label: string; amount: number; count: number };
export type SalesMonth = { total: number; count: number; averageTransaction: number | null; averageGuest: number | null; guestCount: number | null; daily: SalesPoint[]; paymentMethods: SalesPoint[] };
export type SalesDashboard = { period: ReturnType<typeof salesPeriod>; current: SalesMonth; previous: SalesMonth; guestDifference: number | null; target: number | null };

export function validSalesTarget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 100_000_000_000;
}

export function salesTarget(profile: Record<string, unknown>, month: string) {
  const targets = profile.sales_month_targets;
  if (!targets || typeof targets !== "object" || Array.isArray(targets)) return null;
  const value = (targets as Record<string, unknown>)[month];
  return validSalesTarget(value) ? value : null;
}

export function summarizeSalesMonth(rows: SalesDashboardRow[], start: string, until: string): SalesMonth {
  const daily = new Map<string, SalesPoint>(), payments = new Map<string, SalesPoint>();
  let total = 0, count = 0, guests = 0, guestCoverage = true, saleCount = 0;
  for (const row of rows) {
    const metadata = row.source_metadata ?? {};
    if (row.business_date < start || row.business_date > until || metadata.square_pos_state === "void" || metadata.air_regi_state === "void") continue;
    const amount = Number(row.gross_amount);
    if ((typeof row.gross_amount !== "number" && typeof row.gross_amount !== "string") || String(row.gross_amount).trim() === "" || !Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) throw new Error("invalid_sales_amount");
    total += amount; count++;
    if (!Number.isFinite(total) || Math.abs(total) > Number.MAX_SAFE_INTEGER) throw new Error("invalid_sales_total");
    const date = daily.get(row.business_date) ?? { label: row.business_date, amount: 0, count: 0 };
    date.amount += amount; date.count++; daily.set(date.label, date);
    const rawMethod = row.payment_method?.trim();
    const method = !rawMethod || rawMethod === "未設定" ? "unset" : rawMethod;
    const payment = payments.get(method) ?? { label: method, amount: 0, count: 0 };
    payment.amount += amount; payment.count++; payments.set(method, payment);
    // Refunds affect net sales, but are not a second visit. Never substitute
    // transaction/item/customer-record counts for verified POS guest counts.
    const refund = amount < 0 || metadata.square_pos_state === "refund" || metadata.air_regi_state === "refund";
    if (!refund) {
      saleCount++;
      const value = metadata.guest_count;
      if (metadata.guest_count_confirmed === true && typeof value === "number" && Number.isSafeInteger(value) && value > 0) guests += value;
      else guestCoverage = false;
    }
  }
  return { total, count, averageTransaction: count ? total / count : null, averageGuest: saleCount && guestCoverage && guests > 0 ? total / guests : null,
    guestCount: saleCount && guestCoverage ? guests : null,
    daily: [...daily.values()].sort((a, b) => a.label.localeCompare(b.label)), paymentMethods: [...payments.values()].sort((a, b) => b.amount - a.amount) };
}

export function buildSalesDashboard(rows: SalesDashboardRow[], profile: Record<string, unknown> = {}, now = new Date()): SalesDashboard {
  const period = salesPeriod(now);
  const current = summarizeSalesMonth(rows, period.start, period.today);
  const previous = summarizeSalesMonth(rows, period.previousStart, period.previousUntil);
  return { period, current, previous, target: salesTarget(profile, period.month),
    guestDifference: current.averageGuest !== null && previous.averageGuest !== null ? current.averageGuest - previous.averageGuest : null };
}

// Home uses the existing daily cache; unlike monthly.at(-1), this cannot pick
// an old/future month or compare a partial month against a full previous month.
export function homeMonthSales(daily: SalesPoint[], now = new Date()) {
  const period = salesPeriod(now);
  const current = daily.filter(row => row.label >= period.start && row.label <= period.today);
  const previous = daily.filter(row => row.label >= period.previousStart && row.label <= period.previousUntil);
  const amount = current.reduce((sum, row) => sum + row.amount, 0), before = previous.reduce((sum, row) => sum + row.amount, 0);
  return { ...period, amount, available: current.length > 0, points: current.map(row => row.amount),
    change: current.length && previous.length && before > 0 ? Math.round((amount - before) / before * 1000) / 10 : null };
}
