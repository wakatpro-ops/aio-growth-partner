import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getIndustryConfig } from "@/config/industries";
import { normalizeIndustryTypeKey } from "@/lib/applications/options";
import { requirePlatformAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IndustryTypeKey } from "@/types/domain";
import type { ApplicationEmailLog } from "@/lib/admin/application-emails";

const productionAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.aioboost.jp";

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
  industry_detail_key?: string | null;
  industry_label?: string | null;
  website_url?: string | null;
  google_maps_url?: string | null;
  social_urls?: Record<string, unknown> | null;
  reference_urls?: string[] | null;
  current_tools?: string[] | null;
  improvement_goals?: string[] | null;
  ai_business_summary?: string | null;
  ai_recommended_setup_steps?: string[] | null;
  ai_growth_opportunities?: string[] | null;
  ai_first_meeting_points?: string[] | null;
  ai_analysis_status?: string | null;
  ai_analysis_error?: string | null;
  ai_analysis_error_code?: string | null;
  ai_analysis_model?: string | null;
  ai_analyzed_at?: string | null;
  admin_checklist?: Record<string, unknown> | null;
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
  approved_organization_id?: string | null;
  approved_store_id?: string | null;
  approved_user_id?: string | null;
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

function listFromJson(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map(String).map((item) => item.trim()).filter(Boolean);
}

function recordFromJson(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function buildApplicationHandoff(application: SalesApplication, applicationId: string) {
  const socialUrls = recordFromJson(application.social_urls);
  const otherSocialUrls = listFromJson(socialUrls.other);
  const referenceUrls = listFromJson(application.reference_urls);
  const currentTools = listFromJson(application.current_tools);
  const improvementGoals = listFromJson(application.improvement_goals);
  const setupSteps = listFromJson(application.ai_recommended_setup_steps);
  const growthOpportunities = listFromJson(application.ai_growth_opportunities);
  const meetingPoints = listFromJson(application.ai_first_meeting_points);

  return {
    application_id: applicationId,
    source: "public_application",
    copied_at: new Date().toISOString(),
    store_name: application.store_name,
    contact_name: application.contact_name,
    contact_email: application.email,
    contact_phone: application.phone,
    industry_label: application.industry_label,
    industry_detail_key: application.industry_detail_key,
    store_count: application.store_count,
    pain_points: application.pain_points,
    message: application.message,
    website_url: application.website_url,
    google_maps_url: application.google_maps_url,
    social_urls: {
      instagram: socialUrls.instagram ?? null,
      line: socialUrls.line ?? null,
      other: otherSocialUrls
    },
    reference_urls: referenceUrls,
    current_tools: currentTools,
    improvement_goals: improvementGoals,
    ai: {
      status: application.ai_analysis_status,
      model: application.ai_analysis_model,
      business_summary: application.ai_business_summary,
      growth_opportunities: growthOpportunities,
      recommended_setup_steps: setupSteps,
      first_meeting_points: meetingPoints
    }
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
  if (!supabase) return { application: null, logs: [] as ApplicationActivityLog[], emailLogs: [] as ApplicationEmailLog[] };

  const [applicationResult, logsResult, emailLogsResult] = await Promise.all([
    supabase.from("applications").select("*").eq("id", applicationId).maybeSingle(),
    supabase
      .from("application_activity_logs")
      .select("id, application_id, action_type, from_status, to_status, message, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("application_email_logs")
      .select("id, application_id, to_email, from_email, subject, template_key, status, error_message, provider_message_id, sent_at, created_at")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(30)
  ]);

  return {
    application: applicationResult.data as SalesApplication | null,
    logs: (logsResult.data ?? []) as ApplicationActivityLog[],
    emailLogs: (emailLogsResult.data ?? []) as ApplicationEmailLog[]
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

  const industryTypeKey: IndustryTypeKey = normalizeIndustryTypeKey(
    String(application.industry_detail_key ?? application.industry_type_key ?? "general_store")
  );
  const industry = getIndustryConfig(industryTypeKey);
  const organizationId = application.organization_id ?? randomUUID();
  const storeId = application.store_id ?? randomUUID();
  const inviteEmail = application.invite_email ?? application.email;
  const handoff = buildApplicationHandoff(application as SalesApplication, applicationId);

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
      source_application_id: applicationId,
      industry_type_key: industryTypeKey,
      name: application.store_name,
      phone: application.phone,
      website_url: application.website_url,
      google_business_url: application.google_maps_url,
      description: application.pain_points,
      profile_data: {
        data_mode: "production",
        onboarding_status: "not_started",
        created_from_application_id: applicationId,
        contact_name: application.contact_name,
        contact_email: application.email,
        sales_approved: true,
        application_intake: handoff
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

  const { data: currentStore } = await supabase
    .from("stores")
    .select("profile_data")
    .eq("id", storeId)
    .maybeSingle();
  const currentProfile = recordFromJson(currentStore?.profile_data);
  const { error: storeUpdateError } = await supabase.from("stores").update({
    source_application_id: applicationId,
    website_url: application.website_url ?? null,
    google_business_url: application.google_maps_url ?? null,
    description: application.pain_points ?? null,
    profile_data: {
      ...currentProfile,
      data_mode: currentProfile.data_mode ?? "production",
      onboarding_status: currentProfile.onboarding_status ?? "not_started",
      created_from_application_id: applicationId,
      contact_name: application.contact_name,
      contact_email: application.email,
      contact_phone: application.phone,
      application_intake: handoff
    },
    updated_at: new Date().toISOString()
  }).eq("id", storeId);
  if (storeUpdateError) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(`申込内容を店舗へ反映できませんでした: ${storeUpdateError.message}`)}`);

  const { error: snapshotError } = await supabase.from("onboarding_snapshots").upsert({
    organization_id: organizationId,
    store_id: storeId,
    application_id: applicationId,
    snapshot_type: "application_intake",
    title: "申込内容から作成した初期設定下書き",
    content: handoff,
    status: "active",
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,snapshot_type" });
  if (snapshotError) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent(`初期設定下書きを保存できませんでした: ${snapshotError.message}`)}`);

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
      redirectTo: `${productionAppUrl}/onboarding?storeId=${storeId}`
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
    approved_organization_id: organizationId,
    approved_store_id: storeId,
    approved_user_id: invitedUserId,
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
    ? `${productionAppUrl}/stores/${application.store_id}`
    : `${productionAppUrl}/onboarding`;
  return [
    `${application.contact_name} 様`,
    "",
    "AIO Growth Partner の利用開始準備が整いました。",
    "以下の流れで、店舗情報の確認と初回設定を進めてください。",
    "",
    "1. 招待メールまたは案内されたログインURLを開く",
    "2. 初回パスワードを設定してログインする",
    "3. 初回オンボーディングを開く",
    "4. 申込内容をもとにした店舗プロフィールを確認する",
    "5. 請求書設定、商品・サービス、顧客情報を整える",
    "",
    `ログインURL: ${productionAppUrl}/login`,
    `初回オンボーディング: ${productionAppUrl}/onboarding${application.store_id ? `?storeId=${application.store_id}` : ""}`,
    `店舗画面: ${storeUrl}`,
    "",
    "注意:",
    "- パスワードは安全のため、担当者側で確認・表示できません。",
    "- お支払い方法やご契約内容は、担当者より個別にご案内します。",
    "- 外部サービスとの連携は、各サービス側の設定や権限確認が必要になる場合があります。",
    "- AI生成文は公開・送信前に必ず確認してください。"
  ].join("\n");
}
