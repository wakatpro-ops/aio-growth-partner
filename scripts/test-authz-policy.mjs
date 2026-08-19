import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAccountAccess,
  mayEditResults,
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
