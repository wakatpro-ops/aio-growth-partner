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
    supabase.from("user_profiles").select("role").eq("user_id", user.id).maybeSingle(),
    supabase.from("organization_members").select("organization_id").eq("user_id", user.id)
  ]);

  const role = String(profileResult.data?.role ?? "user");
  const organizationIds = (membershipsResult.data ?? [])
    .map((item) => String(item.organization_id ?? ""))
    .filter(Boolean);

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    organizationIds,
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
