export type SessionState = "active" | "missing" | "invalid" | "expired" | "revoked";

export type ApplicationAccessState = {
  status?: string | null;
  approvalStatus?: string | null;
  paymentStatus?: string | null;
  accountStatus?: string | null;
};

export type MembershipAccessState = {
  organizationId: string;
  role: string;
  membershipStatus?: string | null;
  membershipArchived?: boolean;
  organizationStatus?: string | null;
  organizationArchived?: boolean;
};

export type StoreMembershipAccessState = {
  storeId: string;
  organizationId: string;
  role: string;
  membershipStatus?: string | null;
  membershipArchived?: boolean;
  storeStatus?: string | null;
  storeArchived?: boolean;
  organizationStatus?: string | null;
  organizationArchived?: boolean;
};

export type AccountAccessInput = {
  authenticated: boolean;
  sessionState: SessionState;
  profileRole?: string | null;
  profileStatus?: string | null;
  profileArchived?: boolean;
  authUserBanned?: boolean;
  application?: ApplicationAccessState | null;
  memberships: MembershipAccessState[];
  storeMemberships?: StoreMembershipAccessState[];
};

export type EvaluatedAccountAccess = {
  accountActive: boolean;
  isPlatformAdmin: boolean;
  organizationIds: string[];
  organizationRoles: Record<string, string>;
  storeIds: string[];
  storeRoles: Record<string, string>;
  application?: ApplicationAccessState | null;
};

const resultEditorRoles = new Set(["org_owner", "store_manager", "staff"]);

export function evaluateAccountAccess(input: AccountAccessInput): EvaluatedAccountAccess {
  const accountActive = input.authenticated
    && input.sessionState === "active"
    && input.profileStatus === "active"
    && !input.profileArchived
    && !input.authUserBanned;

  if (!accountActive) {
    return {
      accountActive: false,
      isPlatformAdmin: false,
      organizationIds: [],
      organizationRoles: {},
      storeIds: [],
      storeRoles: {},
      application: input.application ?? null
    };
  }

  const activeMemberships = input.memberships.filter((membership) => (
    membership.membershipStatus === "active"
    && !membership.membershipArchived
    && membership.organizationStatus === "active"
    && !membership.organizationArchived
  ));

  const organizationRoles = Object.fromEntries(
    activeMemberships.map((membership) => [membership.organizationId, membership.role])
  );

  const activeStoreMemberships = (input.storeMemberships ?? []).filter((membership) => (
    membership.membershipStatus === "active"
    && !membership.membershipArchived
    && membership.storeStatus === "active"
    && !membership.storeArchived
    && membership.organizationStatus === "active"
    && !membership.organizationArchived
  ));
  const storeRoles = Object.fromEntries(
    activeStoreMemberships.map((membership) => [membership.storeId, membership.role])
  );

  return {
    accountActive: true,
    isPlatformAdmin: input.profileRole === "platform_admin",
    organizationIds: Object.keys(organizationRoles),
    organizationRoles,
    storeIds: Object.keys(storeRoles),
    storeRoles,
    application: input.application ?? null
  };
}

export function mayReadStore(access: EvaluatedAccountAccess, storeId: string, organizationId: string) {
  return access.accountActive
    && (access.isPlatformAdmin
      || access.organizationIds.includes(organizationId)
      || access.storeIds.includes(storeId));
}

export function mayEditStore(access: EvaluatedAccountAccess, storeId: string, organizationId: string) {
  if (!mayReadStore(access, storeId, organizationId)) return false;
  if (access.isPlatformAdmin) return true;
  const organizationRole = access.organizationRoles[organizationId] ?? "";
  const storeRole = access.storeRoles[storeId] ?? "";
  return resultEditorRoles.has(organizationRole) || new Set(["store_manager", "staff"]).has(storeRole);
}

export function mayManageStoreStaff(access: EvaluatedAccountAccess, organizationId: string) {
  return mayManageOrganization(access, organizationId);
}

export function mayReadOrganization(access: EvaluatedAccountAccess, organizationId: string) {
  return access.accountActive
    && (access.isPlatformAdmin || access.organizationIds.includes(organizationId));
}

export function mayEditResults(access: EvaluatedAccountAccess, organizationId: string) {
  return mayReadOrganization(access, organizationId)
    && (access.isPlatformAdmin || resultEditorRoles.has(access.organizationRoles[organizationId] ?? ""));
}

export function mayManageOrganization(access: EvaluatedAccountAccess, organizationId: string) {
  return mayReadOrganization(access, organizationId)
    && (access.isPlatformAdmin || access.organizationRoles[organizationId] === "org_owner");
}
