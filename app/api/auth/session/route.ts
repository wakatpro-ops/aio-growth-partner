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
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role, status, archived_at")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ ok: false, error: "アカウントを確認できませんでした。もう一度お試しください。" }, { status: 503 });
    if (!profile || profile.status !== "active" || profile.archived_at) {
      return NextResponse.json({ ok: false, error: "このアカウントは現在利用できません。管理者にお問い合わせください。" }, { status: 403 });
    }
    const isPlatformAdmin = profile?.role === "platform_admin"
      && profile.status === "active"
      && !profile.archived_at;

    // Operators do not need store/application scans to open the admin console.
    if (isPlatformAdmin) return sessionResponse(accessToken, expiresIn, "/admin");

    const [{ data: organizationMemberships, error: organizationMembershipError }, { data: storeMemberships, error: storeMembershipError }] = await Promise.all([
      admin.from("organization_members")
        .select("organization_id, role_key")
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
    if (organizationMembershipError || storeMembershipError) {
      return NextResponse.json({ ok: false, error: "担当店舗を確認できませんでした。もう一度お試しください。" }, { status: 503 });
    }

    const candidateOrganizationIds = [...new Set([
      ...(organizationMemberships ?? []).map((membership) => String(membership.organization_id ?? "")),
      ...(storeMemberships ?? []).map((membership) => String(membership.organization_id ?? ""))
    ].filter(Boolean))];
    const directStoreIds = [...new Set((storeMemberships ?? []).map((membership) => String(membership.store_id ?? "")).filter(Boolean))];
    const { data: activeOrganizations, error: organizationError } = candidateOrganizationIds.length
      ? await admin.from("organizations").select("id").in("id", candidateOrganizationIds).eq("status", "active").is("archived_at", null)
      : { data: [], error: null };
    if (organizationError) return NextResponse.json({ ok: false, error: "担当店舗を確認できませんでした。もう一度お試しください。" }, { status: 503 });
    const activeOrganizationIds = (activeOrganizations ?? []).map((organization) => String(organization.id));
    const organizationIds = (organizationMemberships ?? [])
      .map((membership) => String(membership.organization_id))
      .filter((id) => activeOrganizationIds.includes(id));
    const [organizationStoresResult, directStoresResult] = await Promise.all([
      organizationIds.length
        ? admin.from("stores").select("id, organization_id").in("organization_id", organizationIds).eq("status", "active").is("archived_at", null)
        : Promise.resolve({ data: [], error: null }),
      directStoreIds.length
        ? admin.from("stores").select("id, organization_id").in("id", directStoreIds).eq("status", "active").is("archived_at", null)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (organizationStoresResult.error || directStoresResult.error) {
      return NextResponse.json({ ok: false, error: "担当店舗を確認できませんでした。もう一度お試しください。" }, { status: 503 });
    }
    const accessibleStoreIds = selectLoginStores({
      organizationIds, directStoreIds, activeOrganizationIds,
      stores: [...(organizationStoresResult.data ?? []), ...(directStoresResult.data ?? [])]
    });
    // Pending setup is not evidence of a first login. Only the invitation's
    // explicit setup request may choose this destination, after authorization.
    let initialSetupStoreId: string | null = null;
    const requestedSetupStoreId = typeof body.initial_setup_store_id === "string" ? body.initial_setup_store_id : "";
    const requestedStore = (organizationStoresResult.data ?? []).find((store) => store.id === requestedSetupStoreId);
    if (requestedStore && accessibleStoreIds.includes(requestedSetupStoreId)
      && organizationMemberships?.some((membership) => membership.organization_id === requestedStore.organization_id && membership.role_key === "org_owner")) {
      const [{ data: application }, { data: snapshot }] = await Promise.all([
        admin.from("applications").select("id").eq("invited_user_id", data.user.id)
          .eq("store_id", requestedSetupStoreId).neq("onboarding_status", "completed").limit(1).maybeSingle(),
        admin.from("onboarding_snapshots").select("id").eq("store_id", requestedSetupStoreId)
          .eq("snapshot_type", "application_intake").eq("confirmation_status", "pending").limit(1).maybeSingle()
      ]);
      if (application && snapshot) initialSetupStoreId = requestedSetupStoreId;
    }
    const lastStoreId = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("aio_last_store_id="))
      ?.slice("aio_last_store_id=".length);
    nextPath = resolvePostLoginDestination({
      isPlatformAdmin,
      initialSetupStoreId,
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
