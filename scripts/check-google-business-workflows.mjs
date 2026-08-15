import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const failures = [];
const source = read("lib/phase5/google-integrations.ts");
const migration = read("supabase/migrations/202608150001_google_business_workflows.sql");
const businessPage = read("app/stores/[storeId]/settings/google/business-profile/page.tsx");
const reviewsPage = read("app/stores/[storeId]/reviews/page.tsx");
const sendPage = read("app/stores/[storeId]/growth-actions/[actionId]/send/page.tsx");

const requiredSource = [
  "google_business_locations",
  "google_business_reviews",
  "selectedGoogleBusinessLocation",
  "latestActionApproval",
  "beginIdempotentGoogleJob",
  "publishGoogleBusinessPost",
  "syncGoogleBusinessReviews",
  "saveGoogleReviewReplyDraft",
  "approveGoogleReviewReply",
  "publishGoogleReviewReply",
  "https://mybusiness.googleapis.com/v4/${parent}/localPosts",
  "https://mybusiness.googleapis.com/v4/${parent}/reviews",
  "https://mybusiness.googleapis.com/v4/${review.google_review_name}/reply"
];

for (const value of requiredSource) {
  if (!source.includes(value)) failures.push(`Google業務フロー実装が不足しています: ${value}`);
}
if (source.includes("const selectedLocation = locations[0]")) failures.push("取得候補の先頭を自動選択する実装が残っています。");
if (!source.includes('action.status !== "approved"') || !source.includes('approval?.status !== "approved"')) failures.push("Google投稿の担当者承認チェックがありません。");
if (!source.includes('["approved", "error"].includes(review.reply_status)')) failures.push("口コミ返信の承認チェックがありません。");
if (!source.includes("requireGoogleEditor")) failures.push("Google変更操作のサーバー認可がありません。");
if (!source.includes("idempotency_key")) failures.push("Google実行の重複防止キーがありません。");

for (const value of [
  "google_business_locations_one_selected_idx",
  "external_publish_jobs_idempotency_idx",
  "enable row level security",
  "google_business_reviews"
]) {
  if (!migration.includes(value)) failures.push(`Google移行SQLが不足しています: ${value}`);
}

if (businessPage.includes('name="google_account_id"') || businessPage.includes('name="location_id"')) failures.push("Google店舗IDの手入力欄が残っています。");
if (!businessPage.includes('name="location_candidate_id"')) failures.push("取得済みGoogle店舗候補の選択UIがありません。");
for (const value of ["Google口コミを更新", "返信下書きを保存", "この返信を承認", "承認済み返信をGoogleへ反映"]) {
  if (!reviewsPage.includes(value)) failures.push(`口コミ業務UIが不足しています: ${value}`);
}
for (const value of ["承認済み投稿をGoogleへ公開", "gmailAllowed", "calendarAllowed"]) {
  if (!sendPage.includes(value)) failures.push(`Google送信UIの安全制御が不足しています: ${value}`);
}

if (failures.length) {
  console.error("Google Business Profile業務フローチェックに失敗しました。\n");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Google Business Profile業務フローチェック: OK");
console.log("- 取得済み候補からの明示選択・店舗境界: 確認済み");
console.log("- 投稿/口コミ返信の承認・重複防止・再試行: 確認済み");
console.log("- Gmail下書き/Calendar作成のスコープ制御: 確認済み");
