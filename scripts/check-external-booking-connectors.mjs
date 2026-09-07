import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/202609070003_external_booking_connections.sql");
const page = read("app/stores/[storeId]/bookings/integrations/page.tsx");
const actions = read("app/stores/[storeId]/bookings/integrations/actions.ts");
const service = read("lib/bookings/external-connections.ts");
const catalog = read("lib/bookings/external-providers.ts");
const authz = read("supabase/tests/external_booking_connections_authz.sql");
const bookingHub = read("app/stores/[storeId]/bookings/page.tsx");

assert.match(migration, /create table if not exists public\.external_booking_connections/u);
assert.match(migration, /external_booking_connections_store_org_fkey/u);
assert.match(migration, /external_booking_connections_store_provider_active_uidx/u);
assert.match(migration, /check \(read_only\)/u);
assert.match(migration, /revoke all on public\.external_booking_connections from public, anon, authenticated/u);
assert.doesNotMatch(migration, /api_key|password|access_token|refresh_token/iu);
for (const provider of ["minimo", "hotpepper_beauty", "rakuten_beauty", "epark", "ozmall", "ekiten", "reserva", "stores_reservation"]) {
  assert.match(catalog, new RegExp(provider, "u"));
}
for (const lifecycle of ["startExternalBookingConnection", "updateExternalBookingConnection", "archiveExternalBookingConnection", "restoreExternalBookingConnection", "confirmExternalBookingReadConnection"]) {
  assert.match(service, new RegExp(lifecycle, "u"));
}
assert.match(actions, /requireStoreActionWriteAccess/u);
assert.match(page, /APIキー、パスワード、二段階認証コード/u);
assert.match(page, /書き戻し：行わない/u);
assert.match(bookingHub, /bookings\/integrations/u);
for (const denial of ["Owner direct read", "Unaffiliated direct read", "Other organization direct insert", "Cross-organization store mismatch"]) {
  assert.match(authz, new RegExp(denial, "u"));
}
console.log("External booking connector contract checks passed.");
