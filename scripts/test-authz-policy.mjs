import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAccountAccess,
  mayEditStore,
  mayEditResults,
  mayManageStoreStaff,
  mayReadStore,
  mayReadOrganization
} from "../lib/auth/access-policy.ts";

const active = {
  authenticated: true,
  sessionState: "active",
  profileStatus: "active",
  profileArchived: false,
  authUserBanned: false
};

test("認証済みでも組織・役割に未所属なら店舗データを読めない", () => {
  const access = evaluateAccountAccess({ ...active, profileRole: "user", memberships: [] });
  assert.equal(access.accountActive, true);
  assert.equal(mayReadOrganization(access, "org-a"), false);
  assert.equal(mayEditResults(access, "org-a"), false);
  assert.equal(mayReadStore(access, "store-a", "org-a"), false);
  assert.equal(mayEditStore(access, "store-a", "org-a"), false);
});

test("店舗スタッフは割り当て店舗だけを利用し、他店舗とスタッフ管理を拒否される", () => {
  for (const role of ["store_manager", "staff", "viewer"]) {
    const access = evaluateAccountAccess({
      ...active,
      profileRole: "user",
      memberships: [],
      storeMemberships: [{
        storeId: "store-a", organizationId: "org-a", role,
        membershipStatus: "active", membershipArchived: false,
        storeStatus: "active", storeArchived: false,
        organizationStatus: "active", organizationArchived: false
      }]
    });
    assert.equal(mayReadStore(access, "store-a", "org-a"), true);
    assert.equal(mayReadStore(access, "store-b", "org-a"), false);
    assert.equal(mayReadStore(access, "store-c", "org-b"), false);
    assert.equal(mayEditStore(access, "store-a", "org-a"), role !== "viewer");
    assert.equal(mayManageStoreStaff(access, "org-a"), false);
  }
});

test("停止・削除済み・店舗削除済みの店舗所属は採用しない", () => {
  const variants = [
    { membershipStatus: "suspended", membershipArchived: false, storeStatus: "active", storeArchived: false },
    { membershipStatus: "active", membershipArchived: true, storeStatus: "active", storeArchived: false },
    { membershipStatus: "active", membershipArchived: false, storeStatus: "archived", storeArchived: false },
    { membershipStatus: "active", membershipArchived: false, storeStatus: "active", storeArchived: true }
  ];
  for (const variant of variants) {
    const access = evaluateAccountAccess({ ...active, profileRole: "user", memberships: [], storeMemberships: [{
      storeId: "store-a", organizationId: "org-a", role: "staff", organizationStatus: "active", organizationArchived: false, ...variant
    }] });
    assert.equal(mayReadStore(access, "store-a", "org-a"), false);
  }
});

test("法人オーナーは全店舗とスタッフ管理を利用できる", () => {
  const access = evaluateAccountAccess({ ...active, profileRole: "user", memberships: [{
    organizationId: "org-a", role: "org_owner", membershipStatus: "active", membershipArchived: false,
    organizationStatus: "active", organizationArchived: false
  }] });
  assert.equal(mayReadStore(access, "store-any", "org-a"), true);
  assert.equal(mayEditStore(access, "store-any", "org-a"), true);
  assert.equal(mayManageStoreStaff(access, "org-a"), true);
  assert.equal(mayManageStoreStaff(access, "org-b"), false);
});

test("申請が承認・入金・発行済みでも未所属なら店舗データを読めない", () => {
  const access = evaluateAccountAccess({
    ...active,
    profileRole: "user",
    application: { status: "account_issued", approvalStatus: "approved", paymentStatus: "paid", accountStatus: "issued" },
    memberships: []
  });
  assert.equal(mayReadOrganization(access, "org-a"), false);
});

test("activeな所属だけを採用し、pending・archived・停止組織を除外する", () => {
  const access = evaluateAccountAccess({
    ...active,
    profileRole: "user",
    memberships: [
      { organizationId: "org-active", role: "viewer", membershipStatus: "active", membershipArchived: false, organizationStatus: "active", organizationArchived: false },
      { organizationId: "org-pending", role: "org_owner", membershipStatus: "pending", membershipArchived: false, organizationStatus: "active", organizationArchived: false },
      { organizationId: "org-archived-member", role: "org_owner", membershipStatus: "active", membershipArchived: true, organizationStatus: "active", organizationArchived: false },
      { organizationId: "org-suspended", role: "org_owner", membershipStatus: "active", membershipArchived: false, organizationStatus: "suspended", organizationArchived: false }
    ]
  });
  assert.deepEqual(access.organizationIds, ["org-active"]);
});

test("viewerは閲覧のみ、成果編集はowner・manager・staffだけ", () => {
  for (const role of ["org_owner", "store_manager", "staff"]) {
    const access = evaluateAccountAccess({
      ...active,
      profileRole: "user",
      memberships: [{ organizationId: "org-a", role, membershipStatus: "active", membershipArchived: false, organizationStatus: "active", organizationArchived: false }]
    });
    assert.equal(mayReadOrganization(access, "org-a"), true);
    assert.equal(mayEditResults(access, "org-a"), true);
  }
  const viewer = evaluateAccountAccess({
    ...active,
    profileRole: "user",
    memberships: [{ organizationId: "org-a", role: "viewer", membershipStatus: "active", membershipArchived: false, organizationStatus: "active", organizationArchived: false }]
  });
  assert.equal(mayReadOrganization(viewer, "org-a"), true);
  assert.equal(mayEditResults(viewer, "org-a"), false);
});

test("停止・削除済みアカウント、無効・失効セッションを拒否する", () => {
  const cases = [
    { ...active, profileRole: "user", profileStatus: "suspended" },
    { ...active, profileRole: "user", profileArchived: true },
    { ...active, profileRole: "user", authUserBanned: true },
    { ...active, profileRole: "user", sessionState: "invalid" },
    { ...active, profileRole: "user", authenticated: false, sessionState: "missing" }
  ];
  for (const input of cases) {
    const access = evaluateAccountAccess({
      ...input,
      memberships: [{ organizationId: "org-a", role: "org_owner", membershipStatus: "active", membershipArchived: false, organizationStatus: "active", organizationArchived: false }]
    });
    assert.equal(access.accountActive, false);
    assert.equal(mayReadOrganization(access, "org-a"), false);
  }
});

test("activeなplatform_adminは未所属でも全組織へアクセスできる", () => {
  const access = evaluateAccountAccess({ ...active, profileRole: "platform_admin", memberships: [] });
  assert.equal(access.isPlatformAdmin, true);
  assert.equal(mayReadOrganization(access, "org-any"), true);
  assert.equal(mayEditResults(access, "org-any"), true);
});
