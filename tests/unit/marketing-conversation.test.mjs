import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseOffer, offersFor } from "../../lib/marketing/conversation-rules.ts";
const base = { google: true, instagram: true, unanswered: 0, pending: 0, googleEnabled: true, instagramEnabled: true };
test("urgent work precedes randomness", () => {
  assert.equal(chooseOffer(offersFor("store", { ...base, unanswered: 3, pending: 2, urgent: 1 })).id, "drafts");
  for (let seed = 0; seed < 100; seed++) {
    assert.equal(chooseOffer(offersFor("store", { ...base, unanswered: 3, pending: 2 }), {}, 1, String(seed)).id, "reviews");
    assert.equal(chooseOffer(offersFor("store", { ...base, pending: 2 }), {}, 1, String(seed)).id, "drafts");
  }
});
test("only equal priority peers rotate; stable on reread", () => {
  const offers = offersFor("store", base), ids = new Set();
  for (let i = 0; i < 100; i++) { const chosen = chooseOffer(offers, {}, 1, String(i)); assert.equal(chosen.priority, 50); ids.add(chosen.id); }
  assert.equal(ids.size, 2); assert.deepEqual(chooseOffer(offers, {}, 1, "same"), chooseOffer(offers, {}, 2, "same"));
});
test("defer survives refresh, expires, and allows all-deferred empty", () => {
  const offers = offersFor("store", base), deferred = Object.fromEntries(offers.map(o => [o.id, 10]));
  assert.equal(chooseOffer(offers, deferred, 9), null);
  assert(chooseOffer(offers, deferred, 10));
});
test("connection prerequisites and feature restrictions", () => {
  const offers = offersFor("store", { ...base, google: false, instagram: false });
  assert(!offers.some(o => o.channel)); assert.equal(chooseOffer(offers).id, "connect-google");
  assert(offers.every(o => o.href?.startsWith("/stores/store/")));
  assert.deepEqual(offersFor("store", { ...base, googleEnabled: false, instagramEnabled: false }).map(o => o.id), ["aio"]);
});
test("Google connection precedes replies and urgent posting; intentional deferral remains available", () => {
  const offers = offersFor("store", { ...base, google: false, unanswered: 101, pending: 4, urgent: 4 });
  for (let seed = 0; seed < 100; seed++) assert.equal(chooseOffer(offers, {}, 1, String(seed)).id, "connect-google");
  assert.equal(chooseOffer(offers, { "connect-google": 10 }, 1).id, "drafts");
  assert.equal(offers.find(o => o.id === "reviews").href, "/stores/store/marketing/reviews#review-tools");
});
test("review connection remains available when posting is disabled", () => {
  const offers = offersFor("store", { ...base, google: false, googleEnabled: false, googleConnectEnabled: true });
  assert.equal(chooseOffer(offers).id, "connect-google");
  assert(!offers.some(o => o.id === "post-google"));
});
