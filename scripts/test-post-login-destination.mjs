import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostLoginDestination } from "../lib/auth/post-login.ts";

test("platform_admin is sent to the operator console", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: true,
    onboardingStoreId: "11111111-1111-4111-8111-111111111111"
  }), "/admin");
});

test("a store user with incomplete onboarding is sent to setup review", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: "11111111-1111-4111-8111-111111111111"
  }), "/onboarding/setup-review?storeId=11111111-1111-4111-8111-111111111111");
});

test("a regular user without incomplete onboarding is sent to dashboard", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: null
  }), "/dashboard");
});
