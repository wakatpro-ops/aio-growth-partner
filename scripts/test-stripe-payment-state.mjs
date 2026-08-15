import assert from "node:assert/strict";
import { shouldApplyStripeEvent, stripeAmount, stripeEventStatus } from "../lib/phase6/stripe-payment-state.ts";

assert.equal(stripeEventStatus("checkout.session.completed"), "paid");
assert.equal(stripeEventStatus("payment_intent.payment_failed"), "failed");
assert.equal(stripeEventStatus("charge.refunded"), "refunded");
assert.equal(stripeEventStatus("charge.dispute.created"), "disputed");
assert.equal(stripeEventStatus("customer.created"), null);
assert.equal(stripeAmount(200000, "jpy"), 200000);
assert.equal(stripeAmount(200000, "usd"), 2000);

const base = "2026-08-15T01:00:00.000Z";
assert.equal(shouldApplyStripeEvent({ currentStatus: "pending", currentEventCreatedAt: base, nextStatus: "paid", nextEventCreatedAt: base }), true);
assert.equal(shouldApplyStripeEvent({ currentStatus: "paid", currentEventCreatedAt: base, nextStatus: "failed", nextEventCreatedAt: "2026-08-15T01:01:00.000Z" }), false);
assert.equal(shouldApplyStripeEvent({ currentStatus: "paid", currentEventCreatedAt: base, nextStatus: "refunded", nextEventCreatedAt: "2026-08-15T00:59:00.000Z" }), true);
assert.equal(shouldApplyStripeEvent({ currentStatus: "refunded", currentEventCreatedAt: base, nextStatus: "paid", nextEventCreatedAt: "2026-08-15T01:02:00.000Z" }), false);
console.log("Stripe payment state tests passed");
