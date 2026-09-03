import { NextResponse } from "next/server";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const roleLabels: Record<string, string> = {
  platform_admin: "運営管理者",
  org_owner: "法人オーナー",
  store_manager: "店舗管理者",
  staff: "スタッフ",
  viewer: "閲覧のみ"
};

function safeStoreId(request: Request) {
  const value = new URL(request.url).searchParams.get("store_id")?.trim() ?? "";
  return /^[0-9a-f-]{36}$/iu.test(value) ? value : null;
}

export async function GET(request: Request) {
  const access = await getCurrentUserAccess();
  if (!access) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "アカウント情報を確認できませんでした。" }, { status: 500 });

  const storeId = safeStoreId(request);
  let effectiveRole = access.isPlatformAdmin ? "platform_admin" : "";
  let scopeLabel = access.isPlatformAdmin ? "すべての運営管理画面" : "所属する法人の店舗";

  if (storeId) {
    const { data: store } = await supabase.from("stores")
      .select("id, organization_id, name")
      .eq("id", storeId).eq("status", "active").is("archived_at", null).maybeSingle();
    if (!store || (!access.isPlatformAdmin
      && !access.organizationIds.includes(String(store.organization_id))
      && !access.storeIds.includes(String(store.id)))) {
      return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
    }
    effectiveRole = access.isPlatformAdmin
      ? "platform_admin"
      : access.storeRoles[storeId] ?? access.organizationRoles[String(store.organization_id)] ?? "viewer";
    scopeLabel = access.isPlatformAdmin
      ? "すべての運営管理画面"
      : access.storeRoles[storeId]
        ? `「${String(store.name)}」のみ`
        : "法人内のすべての店舗";
  } else if (!effectiveRole) {
    const organizationRoles = Object.values(access.organizationRoles);
    effectiveRole = organizationRoles.includes("org_owner") ? "org_owner" : organizationRoles[0] ?? "staff";
    scopeLabel = access.organizationIds.length > 0 ? "所属する法人の店舗" : "割り当てられた店舗のみ";
  }

  const { data: profile } = await supabase.from("user_profiles")
    .select("display_name").eq("user_id", access.userId).maybeSingle();

  return NextResponse.json({
    displayName: String(profile?.display_name ?? "").trim() || access.email || "利用者",
    email: access.email,
    role: effectiveRole,
    roleLabel: roleLabels[effectiveRole] ?? "利用者",
    scopeLabel
  });
}
