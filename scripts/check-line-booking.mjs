import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/202609060002_line_booking_phase2.sql");
const webhook = read("app/api/line/webhook/route.ts");
const worker = read("lib/line/booking-webhook.ts");
const settings = read("app/stores/[storeId]/bookings/line/page.tsx");
const actions = read("app/stores/[storeId]/bookings/line/actions.ts");
const authz = read("supabase/tests/line_booking_authz.sql");
const publicTest = read("tests/authz/line-webhook-public.spec.ts");
const vercel = JSON.parse(read("vercel.json"));

for (const table of ["line_store_integrations", "line_store_link_codes", "line_booking_contacts", "line_booking_conversations", "line_webhook_events", "line_booking_reminders"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "u"));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
}
for (const rpc of ["create_line_store_booking", "reschedule_line_store_booking", "cancel_line_store_booking"]) {
  assert.match(migration, new RegExp(rpc, "u"));
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`, "su"));
}
assert.match(migration, /auth\.role\(\) <> 'service_role'/u);
assert.match(migration, /assert_booking_resources_available/u);
assert.match(migration, /do_not_contact/u);
assert.match(webhook, /verifyLineSignature/u);
assert.match(webhook, /Invalid signature/u);
assert.match(webhook, /beginLineWebhookEvent/u);
assert.match(worker, /line_contact_opted_out/u);
assert.match(worker, /店舗確認待ち/u);
assert.match(worker, /processDueLineBookingReminders/u);
assert.match(worker, /exactly one LINE account can consume the code/u);
assert.match(worker, /\.eq\("attempt_count", Number\(reminder\.attempt_count\)\)/u);
assert.match(worker, /\.lt\("attempt_count", 3\)/u);
assert.match(worker, /前回の送信処理が完了しなかったため再試行します/u);
assert.match(settings, /店舗連携コード/u);
assert.match(settings, /自動で予約を確定/u);
assert.match(settings, /LINE予約窓口を元に戻す/u);
assert.match(actions, /requireStoreActionWriteAccess/u);
for (const denial of ["Unaffiliated", "Other store", "Viewer", "Direct insert", "Unconsented", "Wrong contact", "Overlap"]) assert.match(authz, new RegExp(denial, "u"));
assert.match(publicTest, /Invalid signature/u);
assert.ok(vercel.crons.some((entry) => entry.path === "/api/cron/line-booking-reminders"));

console.log("LINE booking contract checks passed.");
