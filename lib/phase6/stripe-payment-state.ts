export type StripePaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "partially_refunded" | "refunded" | "disputed";

const terminalPriority: Record<StripePaymentStatus, number> = {
  pending: 0,
  failed: 1,
  cancelled: 1,
  paid: 2,
  partially_refunded: 3,
  refunded: 4,
  disputed: 5
};

export function stripeEventStatus(eventType: string, objectStatus?: string): StripePaymentStatus | null {
  if (eventType === "charge.dispute.created") return "disputed";
  if (eventType === "charge.refunded") return "refunded";
  if (eventType === "charge.refund.updated") return objectStatus === "failed" || objectStatus === "canceled" ? null : "partially_refunded";
  if (eventType === "payment_intent.succeeded" || eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") return "paid";
  if (eventType === "payment_intent.payment_failed" || eventType === "checkout.session.async_payment_failed") return "failed";
  if (eventType === "payment_intent.canceled" || eventType === "checkout.session.expired") return "cancelled";
  return null;
}

export function shouldApplyStripeEvent(input: {
  currentStatus?: string | null;
  currentEventCreatedAt?: string | null;
  nextStatus: StripePaymentStatus;
  nextEventCreatedAt: string;
}) {
  const current = (input.currentStatus ?? "pending") as StripePaymentStatus;
  const currentTime = input.currentEventCreatedAt ? Date.parse(input.currentEventCreatedAt) : 0;
  const nextTime = Date.parse(input.nextEventCreatedAt);
  const currentPriority = terminalPriority[current] ?? 0;
  const nextPriority = terminalPriority[input.nextStatus];
  if (nextPriority < currentPriority) return false;
  if (Number.isFinite(nextTime) && nextTime >= currentTime) return true;
  return nextPriority > currentPriority;
}

const zeroDecimalCurrencies = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"
]);

export function stripeAmount(value: unknown, currency = "jpy") {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return zeroDecimalCurrencies.has(currency.toLowerCase()) ? Math.round(amount) : Math.round(amount) / 100;
}
