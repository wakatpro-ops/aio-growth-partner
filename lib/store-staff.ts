import "server-only";

import { notFound } from "next/navigation";
import { emailConfig, sendEmail } from "@/lib/email/sendgrid";
import { canManageStoreStaff, getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export const storeStaffRoles = [
  ["store_manager", "店舗管理者"],
  ["staff", "スタッフ"],
  ["viewer", "閲覧のみ"]
] as const;

export const storeStaffRoleLabels = Object.fromEntries(storeStaffRoles) as Record<string, string>;

export type StoreStaffMembership = {
  id: string;
  organization_id: string;
  store_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role_key: string;
  status: string;
  invitation_status: string;
  invited_at: string;
  accepted_at: string | null;
  last_sent_at: string | null;
  email_status: string | null;
  email_error: string | null;
  archived_at: string | null;
};

function normalizedEmail(value: FormDataEntryValue | null) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/u.test(email)) throw new Error("正しいメールアドレスを入力してください。");
  return email;
}

function staffRole(value: FormDataEntryValue | null) {
  const role = String(value ?? "staff");
  if (!storeStaffRoles.some(([key]) => key === role)) throw new Error("権限を選び直してください。");
  return role;
}

async function ownerContext(storeId: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access) throw new Error("ログインが必要です。");
  if (!(await canManageStoreStaff(store.organization_id))) {
    notFound();
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

async function findAuthUserByEmail(supabase: SupabaseAdmin, email: string) {
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("既存アカウントを確認できませんでした。");
    const user = data.users.find((item) => (item.email ?? "").toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) break;
  }
  return null;
}

function generatedLink(result: unknown) {
  const data = result && typeof result === "object" ? (result as { data?: unknown }).data : null;
  const properties = data && typeof data === "object" ? (data as { properties?: unknown }).properties : null;
  const link = properties && typeof properties === "object" ? (properties as { action_link?: unknown }).action_link : null;
  return typeof link === "string" ? link : null;
}

function generatedUserId(result: unknown) {
  const data = result && typeof result === "object" ? (result as { data?: unknown }).data : null;
  const user = data && typeof data === "object" ? (data as { user?: unknown }).user : null;
  const id = user && typeof user === "object" ? (user as { id?: unknown }).id : null;
  return typeof id === "string" ? id : null;
}

async function recordAudit(supabase: SupabaseAdmin, input: {
  organizationId: string;
  storeId: string;
  actorUserId: string;
  actionType: string;
  targetId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: input.storeId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_type: "store_membership",
    target_id: input.targetId,
    message: input.message,
    metadata: input.metadata ?? {}
  });
}

async function invitationDelivery(supabase: SupabaseAdmin, input: {
  email: string;
  displayName: string;
  role: string;
  storeId: string;
  storeName: string;
  existingUserId?: string | null;
  existingUserHasSignedIn?: boolean;
}) {
  const baseUrl = emailConfig().appBaseUrl.replace(/\/$/u, "");
  const nextPath = `/stores/${input.storeId}`;
  const redirectTo = `${baseUrl}/auth/set-password?next=${encodeURIComponent(nextPath)}`;
  let actionUrl = `${baseUrl}/login?next=${encodeURIComponent(nextPath)}`;
  let userId = input.existingUserId ?? null;
  let isPasswordSetup = false;

  if (!userId) {
    const result = await supabase.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options: {
        data: { display_name: input.displayName, store_id: input.storeId, role_key: input.role },
        redirectTo
      }
    });
    if (result.error) throw new Error(`招待リンクを作成できませんでした: ${result.error.message}`);
    actionUrl = generatedLink(result) ?? actionUrl;
    userId = generatedUserId(result);
    isPasswordSetup = true;
  } else if (!input.existingUserHasSignedIn) {
    const result = await supabase.auth.admin.generateLink({ type: "recovery", email: input.email, options: { redirectTo } });
    if (result.error) throw new Error(`初回設定リンクを作成できませんでした: ${result.error.message}`);
    actionUrl = generatedLink(result) ?? actionUrl;
    userId = generatedUserId(result) ?? userId;
    isPasswordSetup = true;
  }

  if (!userId) throw new Error("招待するユーザーを作成できませんでした。");
  const roleLabel = storeStaffRoleLabels[input.role] ?? "スタッフ";
  const result = await sendEmail({
    to: input.email,
    subject: `【AIO boost】${input.storeName}のスタッフアカウント招待`,
    templateKey: "store_staff_invite",
    text: [
      `${input.displayName} 様`, "",
      `AIO boostの「${input.storeName}」へ、${roleLabel}として招待されました。`,
      "このアカウントで見られるのは、割り当てられた店舗だけです。", "",
      isPasswordSetup ? "下のリンクからパスワードを設定して利用を開始してください。" : "既存のAIO boostアカウントでログインしてください。",
      actionUrl, "", "心当たりがない場合は、このメールを破棄してください。", "", "AIO boost"
    ].join("\n")
  });
  return { userId, result };
}

export async function listStoreStaff(storeId: string, includeArchived = false) {
  const { store, supabase } = await ownerContext(storeId);
  let query = supabase.from("store_memberships").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
  query = includeArchived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`スタッフ一覧を取得できませんでした: ${error.message}`);
  return { store, memberships: (data ?? []) as StoreStaffMembership[] };
}

export async function inviteStoreStaff(storeId: string, formData: FormData) {
  const { store, access, supabase } = await ownerContext(storeId);
  const email = normalizedEmail(formData.get("email"));
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = staffRole(formData.get("role_key"));
  if (!displayName) throw new Error("スタッフ名を入力してください。");

  const existingUser = await findAuthUserByEmail(supabase, email);
  if (existingUser) {
    const { data: organizationMembership } = await supabase.from("organization_members")
      .select("id").eq("organization_id", store.organization_id).eq("user_id", existingUser.id)
      .eq("status", "active").is("archived_at", null).maybeSingle();
    if (organizationMembership) throw new Error("このユーザーはすでに法人全体の権限を持っています。");
  }

  const { data: existingMembership } = await supabase.from("store_memberships")
    .select("id, archived_at").eq("store_id", store.id).eq("email", email).maybeSingle();
  if (existingMembership && !existingMembership.archived_at) throw new Error("このメールアドレスはすでに登録されています。");

  const delivery = await invitationDelivery(supabase, {
    email, displayName, role, storeId: store.id, storeName: store.name,
    existingUserId: existingUser?.id,
    existingUserHasSignedIn: Boolean(existingUser?.last_sign_in_at)
  });
  const timestamp = new Date().toISOString();
  await supabase.from("user_profiles").upsert({
    user_id: delivery.userId, display_name: displayName, role: "user", status: "active", archived_at: null, updated_at: timestamp
  }, { onConflict: "user_id" });
  const payload = {
    organization_id: store.organization_id,
    store_id: store.id,
    user_id: delivery.userId,
    email,
    display_name: displayName,
    role_key: role,
    status: "active",
    invitation_status: delivery.result.ok ? "sent" : "failed",
    invited_by: access.userId,
    invited_at: timestamp,
    last_sent_at: timestamp,
    email_status: delivery.result.status,
    email_error: delivery.result.ok ? null : delivery.result.errorMessage.slice(0, 500),
    archived_at: null,
    archived_by: null,
    updated_at: timestamp
  };
  const membershipResult = existingMembership
    ? await supabase.from("store_memberships").update(payload).eq("id", existingMembership.id)
    : await supabase.from("store_memberships").insert(payload);
  if (membershipResult.error) throw new Error(`スタッフ権限を保存できませんでした: ${membershipResult.error.message}`);
  const { data: membership } = await supabase.from("store_memberships").select("id").eq("store_id", store.id).eq("user_id", delivery.userId).maybeSingle();
  if (membership?.id) await recordAudit(supabase, {
    organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId,
    actionType: "store_staff_invited", targetId: String(membership.id),
    message: `${displayName}さんを${storeStaffRoleLabels[role]}として招待しました。`, metadata: { role_key: role }
  });
  if (!delivery.result.ok) throw new Error("権限は保存しましたが、招待メールを送信できませんでした。一覧から再送してください。");
}

export async function updateStoreStaff(storeId: string, membershipId: string, formData: FormData) {
  const { store, access, supabase } = await ownerContext(storeId);
  const role = staffRole(formData.get("role_key"));
  const { data, error } = await supabase.from("store_memberships").update({ role_key: role, updated_at: new Date().toISOString() })
    .eq("id", membershipId).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id, display_name").maybeSingle();
  if (error || !data) throw new Error("スタッフ権限を更新できませんでした。");
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId,
    actionType: "store_staff_role_updated", targetId: membershipId, message: `${data.display_name ?? "スタッフ"}さんの権限を${storeStaffRoleLabels[role]}へ変更しました。`, metadata: { role_key: role } });
}

export async function archiveStoreStaff(storeId: string, membershipId: string) {
  const { store, access, supabase } = await ownerContext(storeId);
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase.from("store_memberships").update({ archived_at: timestamp, archived_by: access.userId, updated_at: timestamp })
    .eq("id", membershipId).eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).select("id, display_name").maybeSingle();
  if (error || !data) throw new Error("スタッフを削除できませんでした。");
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId,
    actionType: "store_staff_archived", targetId: membershipId, message: `${data.display_name ?? "スタッフ"}さんを削除しました。` });
}

export async function restoreStoreStaff(storeId: string, membershipId: string) {
  const { store, access, supabase } = await ownerContext(storeId);
  const { data, error } = await supabase.from("store_memberships").update({ archived_at: null, archived_by: null, status: "active", updated_at: new Date().toISOString() })
    .eq("id", membershipId).eq("store_id", store.id).eq("organization_id", store.organization_id).not("archived_at", "is", null).select("id, display_name").maybeSingle();
  if (error || !data) throw new Error("スタッフを元に戻せませんでした。");
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId,
    actionType: "store_staff_restored", targetId: membershipId, message: `${data.display_name ?? "スタッフ"}さんを元に戻しました。` });
}

export async function resendStoreStaffInvite(storeId: string, membershipId: string) {
  const { store, access, supabase } = await ownerContext(storeId);
  const { data: membership } = await supabase.from("store_memberships").select("*").eq("id", membershipId).eq("store_id", store.id).is("archived_at", null).maybeSingle();
  if (!membership) throw new Error("スタッフが見つかりません。");
  const existingUser = await findAuthUserByEmail(supabase, String(membership.email));
  const delivery = await invitationDelivery(supabase, {
    email: String(membership.email), displayName: String(membership.display_name ?? "スタッフ"), role: String(membership.role_key),
    storeId: store.id, storeName: store.name, existingUserId: existingUser?.id ?? String(membership.user_id), existingUserHasSignedIn: Boolean(existingUser?.last_sign_in_at)
  });
  const timestamp = new Date().toISOString();
  await supabase.from("store_memberships").update({ invitation_status: delivery.result.ok ? "sent" : "failed", last_sent_at: timestamp,
    email_status: delivery.result.status, email_error: delivery.result.ok ? null : delivery.result.errorMessage.slice(0, 500), updated_at: timestamp }).eq("id", membershipId);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId,
    actionType: "store_staff_invite_resent", targetId: membershipId, message: `${membership.display_name ?? "スタッフ"}さんへ招待を再送しました。` });
  if (!delivery.result.ok) throw new Error("招待メールを再送できませんでした。");
}
