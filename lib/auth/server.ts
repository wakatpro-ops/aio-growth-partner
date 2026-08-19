import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";
import {
  evaluateAccountAccess,
  mayEditResults,
  mayManageOrganization,
  mayReadOrganization
} from "@/lib/auth/access-policy";

export const authAccessTokenCookie = "aio_auth_access_token";

export type CurrentUserAccess = {
  userId: string;
  email: string | null;
  role: string;
  organizationIds: string[];
  organizationRoles: Record<string, string>;
  isPlatformAdmin: boolean;
  accountActive: true;
};

export const getCurrentUserAccess = cache(async (): Promise<CurrentUserAccess | null> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(authAccessTokenCookie)?.value;
  if (!accessToken || !hasSupabaseBrowserEnv()) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  const { data: userResult, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userResult.user;
  if (userError || !user) return null;

  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const [profileResult, membershipsResult] = await Promise.all([
    supabase.from("user_profiles").select("role, status, archived_at").eq("user_id", user.id).maybeSingle(),
    supabase.from("organization_members").select("organization_id, role_key, status, archived_at").eq("user_id", user.id)
  ]);

  if (profileResult.error || membershipsResult.error || !profileResult.data) return null;

  const membershipOrganizationIds = (membershipsResult.data ?? [])
    .map((item) => String(item.organization_id ?? ""))
    .filter(Boolean);
  const { data: activeOrganizations } = membershipOrganizationIds.length > 0
    ? await supabase.from("organizations").select("id, status, archived_at").in("id", membershipOrganizationIds)
    : { data: [] as Array<{ id: string; status: string | null; archived_at: string | null }> };
  const organizationsById = new Map((activeOrganizations ?? []).map((organization) => [String(organization.id), organization]));
  const bannedUntil = user.banned_until ? Date.parse(user.banned_until) : Number.NaN;
  const evaluated = evaluateAccountAccess({
    authenticated: true,
    sessionState: "active",
    profileRole: String(profileResult.data.role ?? "user"),
    profileStatus: String(profileResult.data.status ?? ""),
    profileArchived: Boolean(profileResult.data.archived_at),
    authUserBanned: Number.isFinite(bannedUntil) && bannedUntil > Date.now(),
    memberships: (membershipsResult.data ?? []).map((membership) => {
      const organizationId = String(membership.organization_id ?? "");
      const organization = organizationsById.get(organizationId);
      return {
        organizationId,
        role: String(membership.role_key ?? "viewer"),
        membershipStatus: String(membership.status ?? ""),
        membershipArchived: Boolean(membership.archived_at),
        organizationStatus: organization ? String(organization.status ?? "") : null,
        organizationArchived: Boolean(organization?.archived_at)
      };
    })
  });

  if (!evaluated.accountActive) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    role: String(profileResult.data.role ?? "user"),
    organizationIds: evaluated.organizationIds,
    organizationRoles: evaluated.organizationRoles,
    isPlatformAdmin: evaluated.isPlatformAdmin,
    accountActive: true
  };
});

export async function requirePlatformAdmin() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (!access.isPlatformAdmin) redirect("/forbidden");
  return access;
}

export async function canAccessOrganization(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) return false;
  return mayReadOrganization(access, organizationId);
}

export async function canManageOrganization(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) return false;
  return mayManageOrganization(access, organizationId);
}

export async function canEditResults(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) return false;
  return mayEditResults(access, organizationId);
}
