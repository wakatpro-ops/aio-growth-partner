import "server-only";

import { requirePlatformAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AdminUserRow = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  archivedAt: string | null;
  organizations: string[];
  isCurrent: boolean;
};

export type AdminOrganizationRow = {
  id: string;
  name: string;
  planKey: string | null;
  archivedAt: string | null;
  activeStoreCount: number;
  memberCount: number;
};

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const access = await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const [{ data: authData, error: authError }, { data: profiles }, { data: memberships }, { data: organizations }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("user_profiles").select("user_id, display_name, role, archived_at"),
    supabase.from("organization_members").select("user_id, organization_id, archived_at"),
    supabase.from("organizations").select("id, name")
  ]);
  if (authError) throw new Error(`ユーザー一覧を取得できませんでした: ${authError.message}`);
  const profileMap = new Map((profiles ?? []).map((profile) => [String(profile.user_id), profile]));
  const organizationMap = new Map((organizations ?? []).map((organization) => [String(organization.id), String(organization.name)]));
  const organizationNamesByUser = new Map<string, string[]>();
  for (const membership of memberships ?? []) {
    if (membership.archived_at) continue;
    const userId = String(membership.user_id);
    const organizationName = organizationMap.get(String(membership.organization_id));
    if (!organizationName) continue;
    organizationNamesByUser.set(userId, [...(organizationNamesByUser.get(userId) ?? []), organizationName]);
  }
  return authData.users.map((user) => {
    const profile = profileMap.get(user.id);
    return {
      userId: user.id,
      email: user.email ?? "メール未設定",
      displayName: String(profile?.display_name ?? user.user_metadata?.display_name ?? "名称未設定"),
      role: String(profile?.role ?? "user"),
      archivedAt: profile?.archived_at ? String(profile.archived_at) : null,
      organizations: organizationNamesByUser.get(user.id) ?? [],
      isCurrent: user.id === access.userId
    };
  });
}

export async function setAdminUserArchived(userId: string, archived: boolean) {
  const access = await requirePlatformAdmin();
  if (access.userId === userId && archived) throw new Error("現在ログイン中の運営管理者はアーカイブできません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const timestamp = new Date().toISOString();
  const payload = archived
    ? { status: "archived", archived_at: timestamp, archived_by: access.userId, updated_at: timestamp }
    : { status: "active", archived_at: null, archived_by: null, updated_at: timestamp };
  const { data: profile } = await supabase.from("user_profiles").select("id").eq("user_id", userId).maybeSingle();
  const profileResult = profile
    ? await supabase.from("user_profiles").update(payload).eq("user_id", userId)
    : await supabase.from("user_profiles").insert({ user_id: userId, role: "user", ...payload });
  if (profileResult.error) throw new Error(`ユーザーを${archived ? "アーカイブ" : "復元"}できませんでした: ${profileResult.error.message}`);
  const membershipResult = await supabase.from("organization_members").update(archived
    ? { status: "archived", archived_at: timestamp, archived_by: access.userId }
    : { status: "active", archived_at: null, archived_by: null }
  ).eq("user_id", userId);
  if (membershipResult.error) throw new Error(`所属情報を更新できませんでした: ${membershipResult.error.message}`);
}

export async function listAdminOrganizations(): Promise<AdminOrganizationRow[]> {
  await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const [{ data: organizations, error }, { data: stores }, { data: memberships }] = await Promise.all([
    supabase.from("organizations").select("id, name, plan_key, archived_at").order("created_at", { ascending: false }),
    supabase.from("stores").select("organization_id, archived_at"),
    supabase.from("organization_members").select("organization_id, archived_at")
  ]);
  if (error) throw new Error(`組織一覧を取得できませんでした: ${error.message}`);
  return (organizations ?? []).map((organization) => ({
    id: String(organization.id),
    name: String(organization.name),
    planKey: organization.plan_key ? String(organization.plan_key) : null,
    archivedAt: organization.archived_at ? String(organization.archived_at) : null,
    activeStoreCount: (stores ?? []).filter((store) => store.organization_id === organization.id && !store.archived_at).length,
    memberCount: (memberships ?? []).filter((membership) => membership.organization_id === organization.id && !membership.archived_at).length
  }));
}

export async function setAdminOrganizationArchived(organizationId: string, archived: boolean) {
  const access = await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  if (archived) {
    const { count } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("archived_at", null);
    if ((count ?? 0) > 0) throw new Error("組織をアーカイブする前に、所属する利用中店舗をアーカイブしてください。");
  }
  const timestamp = new Date().toISOString();
  const { error } = await supabase.from("organizations").update(archived
    ? { status: "archived", archived_at: timestamp, archived_by: access.userId, updated_at: timestamp }
    : { status: "active", archived_at: null, archived_by: null, updated_at: timestamp }
  ).eq("id", organizationId);
  if (error) throw new Error(`組織を${archived ? "アーカイブ" : "復元"}できませんでした: ${error.message}`);
}
