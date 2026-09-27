import assert from "node:assert/strict";
import test from "node:test";
import { initialSetupStoreIdFromInvite, resolvePostLoginDestination } from "../lib/auth/post-login.ts";

test("platform_admin is sent to the operator console", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: true,
    initialSetupStoreId: "11111111-1111-4111-8111-111111111111",
    lastStoreId: "11111111-1111-4111-8111-111111111111",
    accessibleStoreIds: ["11111111-1111-4111-8111-111111111111"]
  }), "/admin");
});

test("an explicitly authorized initial invitation continues setup", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    initialSetupStoreId: "11111111-1111-4111-8111-111111111111",
    accessibleStoreIds: ["11111111-1111-4111-8111-111111111111"]
  }), "/onboarding/setup-review?storeId=11111111-1111-4111-8111-111111111111");
});

test("a user with one assigned store is sent directly to its store home", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
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
    initialSetupStoreId: "other-store",
    accessibleStoreIds: ["store-a"]
  }), "/stores/store-a");
});

test("daily login never derives initial setup from an old unfinished application", () => {
  for (const status of ["not_started", "started", "completed", null]) {
    assert.equal(resolvePostLoginDestination({
      isPlatformAdmin: false,
      accessibleStoreIds: ["store-a"],
      onboardingStatus: status,
      // Regression: the former field must not be a daily-login routing input.
      onboardingStoreId: "store-a"
    }), "/stores/store-a");
  }
});

test("only an explicit setup invitation supplies a store; recovery never does", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const path = `/onboarding/setup-review?storeId=${id}`;
  assert.equal(initialSetupStoreIdFromInvite(path, false), id);
  for (const input of ["/dashboard", "/admin", `/stores/${id}`, "//evil.test/", "/\\evil.test/", "/onboarding/setup-review?storeId=wrong"]) {
    assert.equal(initialSetupStoreIdFromInvite(input, false), null);
  }
  assert.equal(initialSetupStoreIdFromInvite(path, true), null);
});

test("an authenticated user without an assigned store sees the no-store screen", () => {
  assert.equal(resolvePostLoginDestination({
    isPlatformAdmin: false,
    accessibleStoreIds: []
  }), "/no-store");
});
