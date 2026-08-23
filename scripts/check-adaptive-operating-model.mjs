import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/202608230004_adaptive_operating_model.sql");
const setupReview = read("app/onboarding/setup-review/initial-setup-review-form.tsx");
const initialSetup = read("lib/onboarding/initial-setup.ts");
const settings = read("app/stores/[storeId]/settings/operations/page.tsx");

for (const column of ["operating_model_draft", "operating_model", "brand_name", "onboarding_source_key"]) assert.match(migration, new RegExp(column));
for (const field of ["structure_mode", "register_mode", "service_mode", "sharing_"]) assert.match(setupReview, new RegExp(field));
assert.match(setupReview, /AIと一緒に決めた内容/u);
assert.match(setupReview, /既存システムを選んでも/u);
assert.doesNotMatch(read("app/apply/diagnosis/diagnosis-client.tsx"), /structure_mode|register_mode|service_mode|sharing_/u);
assert.match(initialSetup, /additionalLocations/);
assert.match(initialSetup, /onboarding_source_key/);
assert.match(initialSetup, /organization_id,onboarding_source_key/);
assert.match(settings, /既存システムを残しながら/);
console.log("Adaptive operating model integration contract checks passed.");
