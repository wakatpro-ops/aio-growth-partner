import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/202608230001_url_first_ai_onboarding.sql", "utf8");
const reviewMigration = readFileSync("supabase/migrations/202608230002_url_diagnosis_operator_review.sql", "utf8");
const schema = readFileSync("database/schema.sql", "utf8");
const analysisRoute = readFileSync("app/api/public/store-analysis/route.ts", "utf8");
const applicationRoute = readFileSync("app/api/applications/route.ts", "utf8");
const applyForm = readFileSync("app/apply/apply-form.tsx", "utf8");
const verificationRequest = readFileSync("app/api/public/store-analysis/verification/request/route.ts", "utf8");
const verificationConfirm = readFileSync("app/api/public/store-analysis/verification/confirm/route.ts", "utf8");
const approvedResult = readFileSync("app/apply/result/page.tsx", "utf8");
const handoff = readFileSync("lib/admin/applications.ts", "utf8");

for (const sql of [migration, schema]) {
  assert.match(sql, /create table if not exists public\.public_store_analyses/u);
  assert.match(sql, /public_token_hash text not null unique/u);
  assert.match(sql, /alter table public\.public_store_analyses enable row level security/u);
  assert.match(sql, /revoke all on table public\.public_store_analyses from anon, authenticated/u);
  assert.match(sql, /applications_source_analysis_uidx/u);
}
assert.doesNotMatch(migration, /create policy[\s\S]+public_store_analyses/iu, "anonymous/authenticated policies must not expose diagnosis drafts");
assert.match(migration, /drop policy if exists "anonymous applications insert"/u);
assert.match(migration, /revoke insert on table public\.applications from anon/u);
assert.match(analysisRoute, /publicRequestFingerprint/u);
assert.match(analysisRoute, /RATE_LIMIT_MAX_REQUESTS/u);
assert.match(analysisRoute, /hashPublicAnalysisToken/u);
assert.match(applicationRoute, /converted_application_id/u);
assert.match(applicationRoute, /already_submitted/u);
assert.match(analysisRoute, /publicAnalysisPreview/u);
assert.match(analysisRoute, /profile: preview\.profile/u);
assert.match(analysisRoute, /diagnosis: preview\.diagnosis/u);
assert.match(reviewMigration, /verification_code_hash/u);
assert.match(reviewMigration, /intake_review_status/u);
assert.match(verificationRequest, /verificationMaxSendsPerWindow/u);
assert.match(verificationRequest, /verificationMaxSendsPerEmailHour/u);
assert.match(verificationConfirm, /verificationMaxAttempts/u);
assert.match(verificationConfirm, /verification_code_expires_at/u);
assert.match(applicationRoute, /draft\.verified_at/u);
assert.match(applicationRoute, /intake_review_status: "pending"/u);
assert.match(applicationRoute, /authority_confirmed/u);
assert.match(applyForm, /URLから無料で簡易診断する/u);
assert.match(applyForm, /確認コードをメールで受け取る/u);
assert.match(applyForm, /株式会社 Navi Lifeが申込内容を確認/u);
assert.match(approvedResult, /intake_review_status === "approved"/u);
assert.match(approvedResult, /verifyOperatorReviewToken/u);
assert.match(handoff, /url_first_onboarding/u);
assert.match(handoff, /ai_target_questions/u);

console.log("URL-first onboarding integration contract checks passed.");
