import assert from "node:assert/strict";
import test from "node:test";
import { buildScannerSafeInviteUrl } from "../lib/auth/invite-links.ts";

const result = {
  data: {
    properties: {
      action_link: "https://project.supabase.co/auth/v1/verify?token=dangerous",
      hashed_token: "a".repeat(64),
      verification_type: "invite"
    }
  }
};

test("one-time invite token is kept out of the HTTP request URL", () => {
  const value = buildScannerSafeInviteUrl({
    appUrl: "https://app.aioboost.jp",
    result,
    redirectTo: "https://app.aioboost.jp/auth/set-password?next=%2Fonboarding%2Fsetup-review%3FstoreId%3Dstore-1"
  });
  assert.ok(value);
  const url = new URL(value);
  assert.equal(url.origin, "https://app.aioboost.jp");
  assert.equal(url.pathname, "/auth/accept-invite");
  assert.equal(url.search, "");
  assert.doesNotMatch(value, /auth\/v1\/verify/u);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("token_hash"), "a".repeat(64));
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("type"), "invite");
  assert.equal(new URLSearchParams(url.hash.slice(1)).get("next"), "/onboarding/setup-review?storeId=store-1");
});

test("invalid provider result cannot produce an invitation URL", () => {
  assert.equal(buildScannerSafeInviteUrl({ appUrl: "https://app.aioboost.jp", result: {}, redirectTo: "https://app.aioboost.jp" }), null);
});
