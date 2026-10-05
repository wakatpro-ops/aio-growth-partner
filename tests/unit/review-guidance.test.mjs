import assert from "node:assert/strict";
import { test } from "node:test";
import { googleReviewIntegrationAvailable, reviewGuidance } from "../../lib/marketing/review-guidance.ts";
test("all existing settings gates are required, without granting access", () => {
  const flags = { google_integrations: true, google_oauth_connection: true, google_business_profile_integration: true };
  assert(googleReviewIntegrationAvailable(flags));
  for (const key of Object.keys(flags)) assert(!googleReviewIntegrationAvailable({ ...flags, [key]: false }));
  assert(!googleReviewIntegrationAvailable({}));
});
test("disabled, disconnected, ready and pending states use distinct guidance", () => {
  assert(reviewGuidance(false, false, 0).includes("利用対象外"));
  assert(!reviewGuidance(false, false, 0).includes("接続と対象店舗"));
  assert(reviewGuidance(true, false, 2).includes("接続と対象店舗"));
  assert(reviewGuidance(true, true, 2).includes("未返信の口コミが2件"));
  assert(reviewGuidance(true, true, 0).includes("未返信はありません"));
});
