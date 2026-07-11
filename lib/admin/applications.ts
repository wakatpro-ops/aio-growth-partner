import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getIndustryConfig } from "@/config/industries";
import { requirePlatformAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IndustryTypeKey } from "@/types/domain";

export const applicationStatuses = [
  ["new", "新規申込"],
  ["demo_scheduled", "説明予定"],
  ["demo_completed", "説明済み"],
  ["invoice_issued", "請求書発行済み"],
  ["payment_confirmed", "入金確認済み"],
  ["approved", "承認済み"],
  ["account_issued", "アカウント発行済み"],
  ["declined", "見送り"]
] as const;

export const applicationStatusLabel = Object.fromEntries(applicationStatuses) as Record<string, string>;

export const billingStatusLabels: Record<string, string> = {
  not_issued: "未発行",
  issued: "請求書発行済み",
  paid: "入金確認済み",
  canceled: "取消"
};

export const paymentStatusLabels: Record<string, string> = {
  unpaid: "未入金",
  pending: "確認中",
  paid: "入金確認済み",
  canceled: "取消"
};

export const approvalStatusLabels: Record<string, string> = {
  pending: "未承認",
  approved: "承認済み",
  rejected: "見送り"
};

export const accountStatusLabels: Record<string, string> = {
  not_created: "未発行",
  preparing: "発行準備中",
  invited: "招待準備済み",
  issued: "アカウント発行済み"
};

export type SalesApplication = {
  id: string;
  industry_type_key: string | null;
  store_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  store_count: number;
  pain_points: string | null;
  message: string | null;
  status: string;
  sales_notes?: string | null;
  scheduled_demo_at?: string | null;
  demo_completed_at?: string | null;
  billing_status?: string | null;
  billing_amount?: number | null;
  billing_memo?: string | null;
  invoice_issued_at?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  approval_status?: string | null;
  approved_at?: string | null;
  account_status?: string | null;
  organization_id?: string | null;
  store_id?: string | null;
  invited_user_id?: string | null;
  invite_email?: string | null;
  invitation_status?: string | null;
  onboarding_status?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type ApplicationActivityLog = {
  id: string;
  application_id: string;
  action_type: string;
  from_status: string | null;
  to_status: string | null;
  message: string | null;
  created_at: string;
};

function text(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result.length > 0 ? result : null;
}

function statusTimestamp(status: string) {
  const now = new Date().toISOString();
  return {
    demo_completed_at: status === "demo_completed" ? now : undefined,
    invoice_issued_at: status === "invoice_issued" ? now : undefined,
    payment_confirmed_at: status === "payment_confirmed" ? now : undefined,
    approved_at: status === "approved" ? now : undefined
  };
}

export async function listApplications() {
  await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [] as SalesApplication[];

  const { data } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []) as SalesApplication[];
}

export async function getApplication(applicationId: string) {
  await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { application: null, logs: [] as ApplicationActivityLog[] };

  const [applicationResult, logsResult] = await Promise.all([
    supabase.from("applications").select("*").eq("id", applicationId).maybeSingle(),
    supabase
      .from("application_activity_logs")
      .select("id, application_id, action_type, from_status, to_status, message, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  return {
    application: applicationResult.data as SalesApplication | null,
    logs: (logsResult.data ?? []) as ApplicationActivityLog[]
  };
}

async function insertApplicationLog(
  applicationId: string,
  actionType: string,
  message: string,
  fromStatus?: string | null,
  toStatus?: string | null,
  metadata: Record<string, unknown> = {}
) {
  const access = await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  await supabase.from("application_activity_logs").insert({
    application_id: applicationId,
    actor_user_id: access.userId,
    action_type: actionType,
    from_status: fromStatus ?? null,
    to_status: toStatus ?? null,
    message,
    metadata
  });
}

export async function updateApplicationSalesAction(applicationId: string, formData: FormData) {
  "use server";

  const access = await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("Supabase環境変数が未設定です。")}`);

  const current = await supabase.from("applications").select("status").eq("id", applicationId).maybeSingle();
  const previousStatus = String(current.data?.status ?? "new");
  const nextStatus = String(formData.get("status") ?? previousStatus);
  const billingStatus = String(formData.get("billing_status") ?? "not_issued");
  const paymentStatus = String(formData.get("payment_status") ?? "unpaid");
  const approvalStatus = nextStatus === "approved" ? "approved" : String(formData.get("approval_status") ?? "pending");

  const updatePayload = {
    status: nextStatus,
    sales_notes: text(formData.get("sales_notes")),
    scheduled_demo_at: text(formData.get("scheduled_demo_at")),
    billing_status: billingStatus,
    billing_amount: Number(formData.get("billing_amount") || 0) || null,
    billing_memo: text(formData.get("billing_memo")),
    payment_status: paymentStatus,
    approval_status: approvalStatus,
    approved_by: approvalStatus === "approved" ? access.userId : null,
    updated_at: new Date().toISOString(),
    ...statusTimestamp(nextStatus)
  };

  const { error } = await supabase.from("applications").update(updatePayload).eq("id", applicationId);
  if (error) {
    redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(error.message)}`);
  }

  await insertApplicationLog(
    applicationId,
    "sales_status_updated",
    `申込ステータスを「${applicationStatusLabel[previousStatus] ?? previousStatus}」から「${applicationStatusLabel[nextStatus] ?? nextStatus}」へ更新しました。`,
    previousStatus,
    nextStatus,
    { billing_status: billingStatus, payment_status: paymentStatus, approval_status: approvalStatus }
  );

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${applicationId}`);
  redirect(`/admin/applications/${applicationId}?saved=1`);
}

export async function prepareApplicationAccountAction(applicationId: string) {
  "use server";

  await requirePlatformAdmin();
  const supabase = createSupabaseAdminClient();
  if (!supabase) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("Supabase環境変数が未設定です。")}`);

  const { data: application, error: appError } = await supabase
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError || !application) {
    redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("申込情報を取得できませんでした。")}`);
  }

  if (application.payment_status !== "paid" && application.status !== "payment_confirmed" && application.status !== "approved") {
    redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("入金確認後に承認してください。")}`);
  }

  const industryTypeKey: IndustryTypeKey = application.industry_type_key === "auto_repair" ? "auto_repair" : "general_store";
  const industry = getIndustryConfig(industryTypeKey);
  const organizationId = application.organization_id ?? randomUUID();
  const storeId = application.store_id ?? randomUUID();
  const inviteEmail = application.invite_email ?? application.email;

  if (!application.organization_id) {
    const { error } = await supabase.from("organizations").insert({
      id: organizationId,
      name: `${application.store_name} 運用組織`,
      plan_key: "starter"
    });
    if (error) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(`組織を作成できませんでした: ${error.message}`)}`);
  }

  if (!application.store_id) {
    const { error } = await supabase.from("stores").insert({
      id: storeId,
      organization_id: organizationId,
      industry_type_key: industryTypeKey,
      name: application.store_name,
      phone: application.phone,
      description: application.pain_points,
      profile_data: {
        data_mode: "production",
        onboarding_status: "not_started",
        created_from_application_id: applicationId,
        contact_name: application.contact_name,
        contact_email: application.email,
        sales_approved: true
      },
      feature_flags: industry.defaultFeatureFlags,
      status: "active"
    });
    if (error) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(`店舗を作成できませんでした: ${error.message}`)}`);

    await supabase.from("invoice_number_sequences").upsert({
      organization_id: organizationId,
      store_id: storeId,
      prefix: industryTypeKey === "auto_repair" ? "INV-AUTO" : "INV",
      next_number: 1,
      qualified_invoice_issuer_name: application.store_name,
      updated_at: new Date().toISOString()
    }, { onConflict: "store_id" });
  }

  const { data: generatedLink } = await supabase.auth.admin.generateLink({
    type: "invite",
    email: inviteEmail,
    options: {
      data: {
        display_name: application.contact_name,
        application_id: applicationId,
        organization_id: organizationId,
        store_id: storeId
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://aio-growth-partner.vercel.app"}/onboarding?storeId=${storeId}`
    }
  });

  const invitedUserId = generatedLink?.user?.id ?? application.invited_user_id ?? null;
  if (invitedUserId) {
    await supabase.from("user_profiles").upsert({
      user_id: invitedUserId,
      display_name: application.contact_name,
      role: "user",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

    await supabase.from("organization_members").upsert({
      organization_id: organizationId,
      user_id: invitedUserId,
      role_key: "org_owner"
    }, { onConflict: "organization_id,user_id" });

    await supabase.from("organizations").update({
      owner_user_id: invitedUserId,
      updated_at: new Date().toISOString()
    }).eq("id", organizationId);
  }

  const { error: updateError } = await supabase.from("applications").update({
    status: "account_issued",
    approval_status: "approved",
    approved_at: application.approved_at ?? new Date().toISOString(),
    organization_id: organizationId,
    store_id: storeId,
    invited_user_id: invitedUserId,
    invite_email: inviteEmail,
    invitation_status: invitedUserId ? "invite_generated" : "manual_invite_required",
    account_status: invitedUserId ? "invited" : "preparing",
    onboarding_status: "not_started",
    updated_at: new Date().toISOString()
  }).eq("id", applicationId);
  if (updateError) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(updateError.message)}`);

  await insertApplicationLog(
    applicationId,
    "account_prepared",
    invitedUserId
      ? "組織・店舗・ユーザー招待の準備を行いました。パスワードは管理画面に表示しません。"
      : "組織・店舗を作成しました。ユーザー招待は手動で行ってください。",
    application.status,
    "account_issued",
    { organization_id: organizationId, store_id: storeId, invite_email: inviteEmail, invited_user_id: invitedUserId }
  );

  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${applicationId}`);
  redirect(`/admin/applications/${applicationId}?prepared=1`);
}

export function loginGuideTemplate(application: SalesApplication) {
  const storeUrl = application.store_id
    ? `https://aio-growth-partner.vercel.app/stores/${application.store_id}`
    : "https://aio-growth-partner.vercel.app/onboarding";
  return [
    `${application.contact_name} 様`,
    "",
    "AIO Growth Partner の利用開始準備が整いました。",
    "以下の流れで初回設定を進めてください。",
    "",
    "1. 招待メールまたは案内されたログインURLを開く",
    "2. 初回パスワードを設定してログインする",
    "3. 初回オンボーディングを開く",
    "4. 店舗プロフィール、請求書設定、商品・サービス、顧客を登録する",
    "",
    `ログインURL: https://aio-growth-partner.vercel.app/login`,
    `初回オンボーディング: https://aio-growth-partner.vercel.app/onboarding${application.store_id ? `?storeId=${application.store_id}` : ""}`,
    `店舗画面: ${storeUrl}`,
    "",
    "注意:",
    "- パスワードはAIO運営側では管理・表示しません。",
    "- AIO利用料はMVP期間中、Stripe自動課金ではなく請求書ベースで運用します。",
    "- 店舗側のStripe/freee連携は、店舗業務用の手動連携であり、AIO利用料の課金とは別です。",
    "- AI生成文は公開・送信前に必ず確認してください。"
  ].join("\n");
}
