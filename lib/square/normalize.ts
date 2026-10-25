import { z } from "zod";
import { transactionSchema } from "../airregi/contracts";
const object = z.object({}).passthrough();
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u);
const instant = z.string().datetime({ offset: true });
function money(value: unknown, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  return z.object({ currency: z.literal("JPY"), amount: z.number().int().min(-999_999_999_999).max(999_999_999_999) }).parse(value).amount;
}
// Signed net amounts are authoritative: never subtract both returns and refunds.
// Complex return/exchange rows remain financially accurate without invented items.
export function normalizeSquareOrder(input: unknown, locationId: string) {
  const o = object.parse(input);
  if (o.location_id !== locationId) throw new Error("store_mismatch");
  const state = z.enum(["OPEN", "DRAFT", "COMPLETED", "CANCELED"]).parse(o.state);
  if (state === "OPEN" || state === "DRAFT") return null;
  const sourceId = identifier.parse(o.id), revisionAt = instant.parse(o.updated_at), occurredAt = instant.parse(o.closed_at);
  const businessDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(occurredAt));
  if (o.state === "CANCELED") return transactionSchema.parse({ sourceId, revisionAt, occurredAt, businessDate, kind: "void", amountMinor: 0, taxMinor: 0, items: [] });
  const hasReturns = Array.isArray(o.returns) && o.returns.length > 0;
  const net = o.net_amounts === undefined ? null : object.parse(o.net_amounts);
  if (hasReturns && !net) throw new Error("square_return_needs_review");
  const amount = net ? money(net.total_money) : money(o.total_money);
  if (amount < 0 && !hasReturns) throw new Error("invalid_provider_data");
  const tax = net ? money(net.tax_money) : money(o.total_tax_money, 0);
  const discount = net ? money(net.discount_money) : money(o.total_discount_money, 0);
  const sign = amount < 0 ? -1 : 1;
  if (tax * sign < 0 || discount * sign < 0) throw new Error("invalid_provider_data");
  const tenders = z.array(object).max(100).parse(o.tenders ?? []);
  const methods = [...new Set(tenders.map(x => String(x.type ?? "未設定")))].sort();
  const paymentMethod = methods.length > 1 ? "複数の支払方法" : ({ CASH: "現金", CARD: "カード", SQUARE_GIFT_CARD: "ギフトカード", OTHER: "その他" }[methods[0]] ?? methods[0] ?? "未設定");
  const lines = z.array(object).max(500).parse(o.line_items ?? []);
  const items = hasReturns || amount < 0 ? [] : lines.map(line => ({
    sourceItemId: identifier.parse(line.uid), name: z.string().min(1).max(300).parse(line.name), category: null,
    quantity: z.coerce.number().positive().parse(line.quantity), unitPriceMinor: money(line.base_price_money),
    amountMinor: money(line.total_money), taxMinor: money(line.total_tax_money, 0), discountMinor: money(line.total_discount_money, 0)
  }));
  // The explicit adjustment is not assigned to a made-up product.
  const adjustmentMinor = items.length ? Math.abs(amount) - items.reduce((n, x) => n + x.amountMinor, 0) : 0;
  return transactionSchema.parse({ sourceId, revisionAt, occurredAt, businessDate, kind: amount < 0 ? "refund" : "sale", amountMinor: Math.abs(amount), taxMinor: Math.abs(tax), discountMinor: Math.abs(discount), paymentMethod, adjustmentMinor, items });
}

export function squareSyncWindow(watermark: string | null, savedCursor: string | null, now = Date.now()) {
  if (savedCursor) {
    const saved = z.object({ start: instant, end: instant, cursor: z.string().min(1).max(1500) }).strict().parse(JSON.parse(savedCursor));
    if (Date.parse(saved.start) >= Date.parse(saved.end) || Date.parse(saved.end) > now) throw new Error("invalid_window");
    return saved;
  }
  // An overlap catches delayed index updates. Cursor + fixed bounds survive restarts.
  return { start: new Date(watermark ? Date.parse(watermark) - 5 * 60_000 : now - 90 * 86400_000).toISOString(), end: new Date(now - 60_000).toISOString(), cursor: undefined };
}
