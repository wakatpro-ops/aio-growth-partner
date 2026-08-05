import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export const authAccessTokenCookie = "aio_auth_access_token";

export type CurrentUserAccess = {
  userId: string;
  email: string | null;
  role: string;
  organizationIds: string[];
  organizationRoles: Record<string, string>;
  isPlatformAdmin: boolean;
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

  if (profileResult.data?.status === "archived" || profileResult.data?.archived_at) return null;

  const role = String(profileResult.data?.role ?? "user");
  const activeMemberships = (membershipsResult.data ?? []).filter((item) => item.status !== "archived" && !item.archived_at);
  const membershipOrganizationIds = activeMemberships
    .map((item) => String(item.organization_id ?? ""))
    .filter(Boolean);
  const { data: activeOrganizations } = membershipOrganizationIds.length > 0
    ? await supabase.from("organizations").select("id").in("id", membershipOrganizationIds).neq("status", "archived").is("archived_at", null)
    : { data: [] as Array<{ id: string }> };
  const organizationIds = (activeOrganizations ?? []).map((organization) => String(organization.id));
  const activeOrganizationSet = new Set(organizationIds);
  const organizationRoles = Object.fromEntries(
    activeMemberships
      .filter((membership) => activeOrganizationSet.has(String(membership.organization_id)))
      .map((membership) => [String(membership.organization_id), String(membership.role_key ?? "staff")])
  );

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    organizationIds,
    organizationRoles,
    isPlatformAdmin: role === "platform_admin"
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
  if (access.isPlatformAdmin) return true;
  return access.organizationIds.includes(organizationId);
}

export async function canManageOrganization(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) return false;
  if (access.isPlatformAdmin) return true;
  return access.organizationRoles[organizationId] === "org_owner";
}
