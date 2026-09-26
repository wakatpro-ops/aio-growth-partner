import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authAccessTokenCookie } from "@/lib/auth/server";
import { resolvePostLoginDestination } from "@/lib/auth/post-login";
import { selectLoginStores } from "@/lib/auth/login-session-policy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export async function POST(request: Request) {
  if (!hasSupabaseBrowserEnv()) {
    return NextResponse.json({ ok: false, error: "ログイン機能の準備が完了していません。担当者へお問い合わせください。" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const expiresIn = Number(body.expires_in ?? 3600);
  if (!accessToken) {
    return NextResponse.json({ ok: false, error: "ログイン情報を確認できませんでした。" }, { status: 400 });
  }

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

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "ログイン情報が無効です。もう一度ログインしてください。" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  let nextPath = "/no-store";
  if (admin) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role, status, archived_at")
      .eq("user_id", data.user.id)
      .maybeSingle();
    const isPlatformAdmin = profile?.role === "platform_admin"
      && profile.status === "active"
      && !profile.archived_at;

    // Operators do not need store/application scans to open the admin console.
    if (isPlatformAdmin) return sessionResponse(accessToken, expiresIn, "/admin");

    const [{ data: onboardingApplication }, { data: organizationMemberships }, { data: storeMemberships }] = await Promise.all([
      admin.from("applications")
        .select("store_id, onboarding_status")
        .eq("invited_user_id", data.user.id)
        .not("store_id", "is", null)
        .neq("onboarding_status", "completed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("organization_members")
        .select("organization_id")
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .is("archived_at", null),
      admin.from("store_memberships")
        .select("store_id, organization_id")
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .is("archived_at", null),
      admin.from("applications")
        .update({
          invitation_status: "password_set",
          account_status: "issued",
          updated_at: new Date().toISOString()
        })
        .eq("invited_user_id", data.user.id)
        // Repeated login must not reset completed onboarding or rewrite every row.
        .in("invitation_status", ["invite_link_sent", "invite_generated"]),
      admin.from("store_memberships").update({
        invitation_status: "accepted",
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("user_id", data.user.id).eq("status", "active").is("archived_at", null).neq("invitation_status", "accepted")
    ]);

    const candidateOrganizationIds = [...new Set([
      ...(organizationMemberships ?? []).map((membership) => String(membership.organization_id ?? "")),
      ...(storeMemberships ?? []).map((membership) => String(membership.organization_id ?? ""))
    ].filter(Boolean))];
    const directStoreIds = [...new Set((storeMemberships ?? []).map((membership) => String(membership.store_id ?? "")).filter(Boolean))];
    const { data: activeOrganizations } = candidateOrganizationIds.length
      ? await admin.from("organizations").select("id").in("id", candidateOrganizationIds).eq("status", "active").is("archived_at", null)
      : { data: [] };
    const activeOrganizationIds = (activeOrganizations ?? []).map((organization) => String(organization.id));
    const organizationIds = (organizationMemberships ?? [])
      .map((membership) => String(membership.organization_id))
      .filter((id) => activeOrganizationIds.includes(id));
    const [organizationStoresResult, directStoresResult] = await Promise.all([
      organizationIds.length
        ? admin.from("stores").select("id, organization_id").in("organization_id", organizationIds).eq("status", "active").is("archived_at", null)
        : Promise.resolve({ data: [] }),
      directStoreIds.length
        ? admin.from("stores").select("id, organization_id").in("id", directStoreIds).eq("status", "active").is("archived_at", null)
        : Promise.resolve({ data: [] })
    ]);
    const accessibleStoreIds = selectLoginStores({
      organizationIds, directStoreIds, activeOrganizationIds,
      stores: [...(organizationStoresResult.data ?? []), ...(directStoresResult.data ?? [])]
    });
    const lastStoreId = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("aio_last_store_id="))
      ?.slice("aio_last_store_id=".length);
    nextPath = resolvePostLoginDestination({
      isPlatformAdmin,
      onboardingStoreId: onboardingApplication?.store_id ? String(onboardingApplication.store_id) : null,
      accessibleStoreIds,
      lastStoreId: lastStoreId ?? null
    });
  }

  return sessionResponse(accessToken, expiresIn, nextPath);
}

function sessionResponse(accessToken: string, expiresIn: number, nextPath: string) {
  const response = NextResponse.json({ ok: true, next_path: nextPath });
  response.cookies.set(authAccessTokenCookie, accessToken, {
    httpOnly: true,
    maxAge: Math.max(60, Math.min(expiresIn, 60 * 60 * 24)),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authAccessTokenCookie, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
