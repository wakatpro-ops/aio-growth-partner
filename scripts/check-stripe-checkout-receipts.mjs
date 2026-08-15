import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["automatic Checkout", "lib/phase6/stripe-payments.ts", "createInvoiceStripeCheckout"],
  ["connected account separation", "lib/phase6/stripe-payments.ts", '"Stripe-Account"'],
  ["stable idempotency", "lib/phase6/stripe-payments.ts", "idempotency_key"],
  ["webhook signature", "app/api/stripe/webhook/route.ts", "verifyStripeSignature"],
  ["webhook replay log", "app/api/stripe/webhook/route.ts", "stripe_webhook_events"],
  ["out-of-order guard", "app/api/stripe/webhook/route.ts", "shouldApplyStripeEvent"],
  ["refund and dispute", "app/api/stripe/webhook/route.ts", "partially_refunded"],
  ["receipt PDF", "lib/phase6/payment-receipt-pdf.ts", "登録番号"],
  ["receipt email history", "lib/phase6/stripe-payments.ts", "payment_receipt_issues"],
  ["database migration", "database/migrations/phase-stripe-checkout-receipts.sql", "payments_external_provider_id_uidx"]
];

for (const [label, file, expected] of checks) {
  const content = fs.readFileSync(path.join(root, file), "utf8");
  if (!content.includes(expected)) throw new Error(`${label} is missing`);
}
console.log("Stripe Checkout/receipt workflow checks passed");
