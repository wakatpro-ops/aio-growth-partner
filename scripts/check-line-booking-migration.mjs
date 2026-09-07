import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/202609070001_line_booking_migration_workflow.sql");
const importMigration = read("supabase/migrations/202609070002_line_booking_migration_import_preview.sql");
const page = read("app/stores/[storeId]/bookings/migration/page.tsx");
const actions = read("app/stores/[storeId]/bookings/migration/actions.ts");
const service = read("lib/line/migration.ts");
const authz = read("supabase/tests/line_booking_migration_authz.sql");
const bookingHub = read("app/stores/[storeId]/bookings/page.tsx");
const publicAuthz = read("tests/authz/line-migration-public.spec.ts");

assert.match(migration, /create table if not exists public\.line_booking_migrations/u);
assert.match(migration, /line_booking_migrations_store_org_fkey/u);
assert.match(migration, /line_booking_migrations_store_active_uidx/u);
assert.match(migration, /enable row level security/u);
assert.match(migration, /is_org_editor/u);
assert.match(migration, /is_store_editor/u);
assert.match(migration, /revoke all on public\.line_booking_migrations from anon, authenticated/u);
assert.doesNotMatch(migration, /password|access_token|channel_secret/iu);
assert.match(importMigration, /create table if not exists public\.line_booking_migration_import_rows/u);
assert.match(importMigration, /line_booking_migration_rows_store_org_fkey/u);
assert.match(importMigration, /enable row level security/u);
assert.match(importMigration, /revoke all on public\.line_booking_migration_import_rows from anon, authenticated/u);
assert.doesNotMatch(importMigration, /password|access_token|channel_secret/iu);

for (const phrase of ["現状確認", "データ準備", "テスト", "切替準備", "移行完了", "旧サービスはまだ停止しないでください", "パスワード、アクセストークン、二段階認証コードは入力しないでください"]) {
  assert.match(page, new RegExp(phrase, "u"));
}
for (const lifecycle of ["createLineBookingMigration", "archiveLineBookingMigration", "restoreLineBookingMigration", "completeLineBookingMigration", "rollBackLineBookingMigration"]) {
  assert.match(service, new RegExp(lifecycle, "u"));
}
assert.match(service, /previewLineMigrationImport/u);
assert.match(service, /importLineMigrationBookings/u);
assert.match(service, /p_status: "pending"/u);
assert.match(service, /p_source: "external"/u);
assert.match(actions, /requireStoreActionWriteAccess/u);
assert.match(service, /access\.isPlatformAdmin/u);
assert.match(service, /target_cutover_at/u);
assert.match(bookingHub, /bookings\/migration/u);
assert.match(publicAuthz, /bookings\/migration/u);
for (const denial of ["Unaffiliated", "Other organization", "Viewer", "direct insert", "direct update"]) assert.match(authz, new RegExp(denial, "ui"));

console.log("LINE booking migration contract checks passed.");
