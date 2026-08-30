import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostLoginDestination } from "../lib/auth/post-login.ts";

test("platform_admin is sent to the operator console", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: true,
    onboardingStoreId: "11111111-1111-4111-8111-111111111111",
    accessibleStoreIds: ["11111111-1111-4111-8111-111111111111"]
  }), "/admin");
});

test("a store user with incomplete onboarding is sent to setup review", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: "11111111-1111-4111-8111-111111111111",
    accessibleStoreIds: ["11111111-1111-4111-8111-111111111111"]
  }), "/onboarding/setup-review?storeId=11111111-1111-4111-8111-111111111111");
});

test("a user with one assigned store is sent directly to its store home", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: null,
    accessibleStoreIds: ["22222222-2222-4222-8222-222222222222"]
  }), "/stores/22222222-2222-4222-8222-222222222222");
});

test("a multi-store user returns to the last authorized store", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    accessibleStoreIds: ["store-a", "store-b"],
    lastStoreId: "store-b"
  }), "/stores/store-b");
});

test("a multi-store user without a valid recent store is sent to store selection", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    accessibleStoreIds: ["store-a", "store-b"],
    lastStoreId: "other-store"
  }), "/stores");
});

test("an inaccessible onboarding store is never used as a redirect target", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    onboardingStoreId: "other-store",
    accessibleStoreIds: ["store-a"]
  }), "/stores/store-a");
});

test("an authenticated user without an assigned store sees the no-store screen", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    accessibleStoreIds: []
  }), "/no-store");
});
