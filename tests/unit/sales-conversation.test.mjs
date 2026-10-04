import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMoney, moneyInput, salesCommand, salesOffers, draftText } from "../../lib/sales/conversation-rules.ts";
import { chooseOffer } from "../../lib/marketing/conversation-rules.ts";
test("explicit inclusive/exclusive tax, 8%, zero rate, rounding", () => {
  const base = { quantity: 2, unitPrice: 1100, taxRate: 10, taxInclusion: "inclusive" };
  assert.deepEqual(calculateMoney(base), { subtotal: 2000, tax: 200, total: 2200 });
  assert.deepEqual(calculateMoney({ ...base, taxInclusion: "exclusive" }), { subtotal: 2200, tax: 220, total: 2420 });
  assert.deepEqual(calculateMoney({ ...base, quantity: 1, unitPrice: 1080, taxRate: 8 }), { subtotal: 1000, tax: 80, total: 1080 });
  assert.deepEqual(calculateMoney({ ...base, taxRate: 0 }), { subtotal: 2200, tax: 0, total: 2200 });
  assert.deepEqual(calculateMoney({ ...base, quantity: 1, unitPrice: 100 }), { subtotal: 91, tax: 9, total: 100 });
});
test("missing/negative/non-integer/overflow/tax guesses rejected", () => {
  const base = { quantity: 1, unitPrice: 100, taxRate: 10, taxInclusion: "inclusive" };
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 1.5 }, { unitPrice: -1 }, { unitPrice: Infinity }, { unitPrice: 1.2 }, { unitPrice: 100000001 }, { quantity: 100000, unitPrice: 100000000 }, { taxRate: 7 }, { taxInclusion: "" }]) assert(!moneyInput.safeParse({ ...base, ...patch }).success);
  assert(!moneyInput.safeParse({ quantity: 1 }).success);
  assert(!salesCommand.safeParse({ revision: 0, action: "generate", storeId: "attacker" }).success);
  assert(!draftText.safeParse({ note: "x", total: 1000 }).success);
});
test("offers use actual facts and defer, never invent overdue/connected state", () => {
  const empty = salesOffers("store", { hasSales: false, estimates: 0, invoices: 0, reports: true, aiReports: true });
  assert.equal(chooseOffer(empty, {}, 0, "stable").id, "import");
  assert(empty.some(x => x.kind === "estimates") && empty.some(x => x.kind === "invoices"));
  assert(!empty.some(x => x.id === "report" || x.id === "ai-report"));
  assert.notEqual(chooseOffer(empty, { import: 10 }, 0, "stable").id, "import");
  const full = salesOffers("store", { hasSales: true, estimates: 1, invoices: 2, reports: true, aiReports: false });
  assert.equal(chooseOffer(full).priority, 90);
  assert(!full.some(x => x.id === "ai-report"));
  assert(full.every(x => !x.href || x.href.startsWith("/stores/store/")));
});
