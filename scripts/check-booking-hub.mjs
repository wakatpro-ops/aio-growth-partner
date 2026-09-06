import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/202609060001_booking_hub_phase1.sql");
const shell = read("components/layout/app-shell.tsx");
const index = read("app/stores/[storeId]/bookings/page.tsx");
const detail = read("app/stores/[storeId]/bookings/[bookingId]/page.tsx");
const settings = read("app/stores/[storeId]/bookings/settings/page.tsx");
const actions = read("app/stores/[storeId]/bookings/actions.ts");
const api = read("app/api/stores/[storeId]/bookings/route.ts");
const operations = read("app/stores/[storeId]/settings/operations/page.tsx");
const onboarding = read("app/onboarding/setup-review/initial-setup-review-form.tsx");
const initialSetup = read("lib/onboarding/initial-setup.ts");
const spec = read("docs/reservation-platform-spec.md");
const databaseAuthzTest = read("supabase/tests/booking_hub_authz.sql");
const publicAuthzTest = read("tests/authz/booking-public.spec.ts");

for (const table of ["booking_services", "booking_resources", "bookings", "booking_resource_allocations"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "u"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
}
for (const helper of ["is_org_member", "is_store_member", "is_org_editor", "is_store_editor"]) assert.match(migration, new RegExp(helper, "u"));
for (const lifecycle of ["create_store_booking", "update_store_booking", "archive_store_booking", "restore_store_booking"]) assert.match(migration, new RegExp(lifecycle, "u"));
assert.match(migration, /pg_advisory_xact_lock/u);
assert.match(migration, /booking\.starts_at[\s\S]{0,160}< p_ends_at/u);
assert.match(migration, /booking\.ends_at[\s\S]{0,160}> p_starts_at/u);
assert.match(migration, /revoke insert, update, delete on public\.bookings from anon, authenticated/u);
assert.match(migration, /audit_logs/u);

assert.match(shell, /navigationLabels\.customer\}・予約/u);
assert.match(shell, /"\/bookings"/u);
for (const phrase of ["今日の予約", "今後の確定予約", "削除済み", "予約を登録"]) assert.match(index, new RegExp(phrase, "u"));
for (const phrase of ["予約の変更を保存", "予約を削除", "元に戻す"]) assert.match(detail, new RegExp(phrase, "u"));
for (const phrase of ["予約内容", "担当・設備", "同時受付数", "過去の予約は保持"]) assert.match(settings, new RegExp(phrase, "u"));
for (const action of ["requireStoreActionWriteAccess", "createBookingFromForm", "updateBookingFromForm", "archiveBooking", "restoreBooking"]) assert.match(actions, new RegExp(action, "u"));
assert.match(api, /getStoreForApi/u);
assert.match(operations, /AIO boostで予約を管理/u);
assert.match(onboarding, /AIO boostで予約を管理する/u);
assert.match(initialSetup, /booking_service_created_from_initial_setup/u);
assert.match(initialSetup, /実際の所要時間を確認してください/u);
for (const phrase of ["公式API", "読み取り専用", "CAPTCHA", "認証済みでも組織・店舗のどちらにも所属しないユーザー"]) assert.match(spec, new RegExp(phrase, "u"));
for (const persona of ["Unaffiliated user", "Other organization owner", "Viewer", "Suspended user", "Store staff", "Store viewer"]) assert.match(databaseAuthzTest, new RegExp(persona, "u"));
assert.match(databaseAuthzTest, /Overlapping booking was not denied/u);
assert.match(databaseAuthzTest, /Adjacent booking was not created/u);
assert.match(publicAuthzTest, /toHaveURL\(\/\\\/login/u);
assert.match(publicAuthzTest, /status\(\)\)\.toBe\(401\)/u);

console.log("Booking hub contract checks passed.");
