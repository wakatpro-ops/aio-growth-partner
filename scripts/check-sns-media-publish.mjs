import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const service = read("lib/phase5/sns-publishing.ts");
const page = read("app/stores/[storeId]/growth-actions/[actionId]/sns-post/page.tsx");
const migration = read("supabase/migrations/202608150002_sns_media_publish.sql");
const mediaRoute = read("app/api/sns/media/[token]/route.ts");
const cron = read("app/api/cron/sns-publish/route.ts");
const vercel = JSON.parse(read("vercel.json"));

for (const required of ["8 * 1024 * 1024", "detectImageType", "file_sha256", "duplicate", "requireEditor", "copyright_confirmed", "person_consent_confirmed", "privacy_confirmed", "approval_status", "idempotencyKey", "retry_wait", "manual_required", "media_publish", "/photos", "permalink_url"]) assert.ok(service.includes(required), required);
for (const required of ["写真を取り込んで投稿案を作る", "この文章を人が確認", "投稿する／予約する", "削除", "再実行", "手動投稿が必要"]) assert.ok(page.includes(required), required);
assert.ok(migration.includes("allowed_mime_types"));
assert.ok(migration.includes("image_caption_jobs_active_file_idx"));
assert.ok(mediaRoute.includes('approval_status !== "approved"'));
assert.ok(cron.includes("CRON_SECRET"));
assert.ok(cron.includes('request.headers.get("authorization")'));
assert.deepEqual(vercel.crons, [
  {
    path: "/api/cron/sns-publish",
    schedule: "* * * * *",
  },
]);
console.log("SNS media publish workflow: OK");
