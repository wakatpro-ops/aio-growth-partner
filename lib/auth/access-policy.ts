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

export type AccountAccessInput = {
  authenticated: boolean;
  sessionState: SessionState;
  profileRole?: string | null;
  profileStatus?: string | null;
  profileArchived?: boolean;
  authUserBanned?: boolean;
  application?: ApplicationAccessState | null;
  memberships: MembershipAccessState[];
};

export type EvaluatedAccountAccess = {
  accountActive: boolean;
  isPlatformAdmin: boolean;
  organizationIds: string[];
  organizationRoles: Record<string, string>;
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

  return {
    accountActive: true,
    isPlatformAdmin: input.profileRole === "platform_admin",
    organizationIds: Object.keys(organizationRoles),
    organizationRoles,
    application: input.application ?? null
  };
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
