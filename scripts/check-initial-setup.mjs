import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  migration: readFileSync("supabase/migrations/202608230003_initial_setup_confirmation.sql", "utf8"),
  server: readFileSync("lib/onboarding/initial-setup.ts", "utf8"),
  rules: readFileSync("lib/onboarding/initial-setup-rules.ts", "utf8"),
  page: readFileSync("app/onboarding/setup-review/page.tsx", "utf8"),
  form: readFileSync("app/onboarding/setup-review/initial-setup-review-form.tsx", "utf8"),
  session: readFileSync("app/api/auth/session/route.ts", "utf8")
};

assert.match(files.migration, /confirmation_status/u);
assert.match(files.migration, /unique index[\s\S]*items_store_onboarding_source_uidx/u);
assert.match(files.server, /mayConfirmInitialSetup/u);
assert.match(files.server, /confirmation_status:\s*"applying"/u);
assert.match(files.server, /onConflict:\s*"store_id,onboarding_source_key"/u);
assert.match(files.server, /initial_setup_confirmed/u);
assert.match(files.rules, /access\.organizationRoles\[organizationId\]\s*===\s*"org_owner"/u);
assert.match(files.rules, /!access\.isPlatformAdmin/u);
assert.match(files.page, /株式会社 Navi Lifeによる申込者・利用権限の承認は完了/u);
assert.match(files.form, /すべて登録する/u);
assert.match(files.form, /すべて除外する/u);
assert.match(files.form, /この内容で利用を開始する/u);
assert.match(files.session, /onboarding\/setup-review/u);

console.log("Initial setup confirmation checks passed.");
