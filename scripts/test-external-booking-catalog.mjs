import assert from "node:assert/strict";
import { externalBookingProviders, getExternalBookingProvider } from "../lib/bookings/external-providers.ts";

const expected = ["minimo", "hotpepper_beauty", "rakuten_beauty", "epark", "ozmall", "ekiten", "reserva", "stores_reservation"];
assert.deepEqual(new Set(externalBookingProviders.map((provider) => provider.key)), new Set(expected));
assert.equal(externalBookingProviders.length, 8);
assert.equal(getExternalBookingProvider("stores_reservation")?.capabilities.reservations, "read");
assert.equal(getExternalBookingProvider("stores_reservation")?.capabilities.writeBack, false);
assert.equal(getExternalBookingProvider("reserva")?.mode, "contract_api");
for (const provider of externalBookingProviders) {
  assert.match(provider.officialUrl, /^https:\/\//u);
  assert.match(provider.inquiryUrl, /^https:\/\//u);
  assert.ok(provider.requirements.length >= 3);
  assert.equal(provider.capabilities.writeBack, false);
}
console.log("External booking provider catalog checks passed.");
