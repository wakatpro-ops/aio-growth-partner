import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emailConfig, sendEmail } from "@/lib/email/sendgrid";
import { requirePlatformAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SalesApplication } from "@/lib/admin/applications";

export type ApplicationEmailLog = {
  id: string;
  application_id: string;
  to_email: string;
  from_email: string;
  subject: string;
  template_key: string;
  status: string;
  error_message: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
};

export const applicationEmailTemplates = [
  ["demo_invitation", "オンライン説明案内"],
  ["invoice_issued", "請求書発行案内"],
  ["payment_approved", "入金確認・承認完了案内"],
  ["account_started", "利用開始案内"]
] as const;

export const applicationEmailTemplateLabels: Record<string, string> = {
  application_received: "申込者自動返信",
  applicant_auto_reply: "申込者自動返信",
  admin_new_application: "管理者通知",
  account_invite: "初回パスワード設定案内",
  demo_invitation: "オンライン説明案内",
  invoice_issued: "請求書発行案内",
  payment_approved: "入金確認・承認完了案内",
  account_started: "利用開始案内"
};

export const applicationEmailStatusLabels: Record<string, string> = {
  sent: "送信成功",
  failed: "送信失敗",
  skipped: "未送信",
  queued: "送信待ち"
};

export type ApplicationEmailTemplateKey =
  | typeof applicationEmailTemplates[number][0]
  | "application_received"
  | "admin_new_application"
  | "account_invite";

function formatDateTime(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString("ja-JP");
  return date.toLocaleString("ja-JP");
}

function listText(values: unknown) {
  if (!Array.isArray(values) || values.length === 0) return "-";
  return values.map(String).filter(Boolean).join("、") || "-";
}

function socialText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "-";
  const social = value as Record<string, unknown>;
  const lines = [
    social.instagram ? `Instagram: ${String(social.instagram)}` : "",
    social.line ? `LINE: ${String(social.line)}` : "",
    ...(Array.isArray(social.other) ? social.other.map(String) : [])
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "-";
}

function appUrl(path: string) {
  const base = emailConfig().appBaseUrl.replace(/\/$/u, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function insertApplicationEmailLog(input: {
  applicationId: string;
  toEmail: string;
  subject: string;
  templateKey: string;
  status: string;
  errorMessage?: string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const config = emailConfig();
  await supabase.from("application_email_logs").insert({
    application_id: input.applicationId,
    to_email: input.toEmail,
    from_email: config.fromEmail,
    subject: input.subject,
    template_key: input.templateKey,
    status: input.status,
    error_message: input.errorMessage ?? null,
    provider_message_id: input.providerMessageId ?? null,
    sent_at: input.sentAt ?? (input.status === "sent" ? new Date().toISOString() : null)
  });
}

async function sendAndLog(applicationId: string, input: {
  to: string;
  subject: string;
  text: string;
  templateKey: ApplicationEmailTemplateKey;
}) {
  const result = await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    templateKey: input.templateKey,
    applicationId
  }).catch((error: unknown) => ({
    ok: false as const,
    status: "failed" as const,
    errorMessage: error instanceof Error ? error.message : "メール送信に失敗しました。"
  }));

  await insertApplicationEmailLog({
    applicationId,
    toEmail: input.to,
    subject: input.subject,
    templateKey: input.templateKey,
    status: result.status,
    errorMessage: result.ok ? null : result.errorMessage,
    providerMessageId: result.ok ? result.providerMessageId : null
  }).catch(() => undefined);

  return result;
}

export function applicantAutoReply(application: SalesApplication) {
  return {
    subject: "AIO boostへのお申し込みを受け付けました",
    text: [
      `${application.contact_name} 様`,
      "",
      "AIO boostへお申し込みいただき、ありがとうございます。",
      "以下の内容で導入相談を受け付けました。",
      "",
      `店舗名: ${application.store_name}`,
      `担当者名: ${application.contact_name}`,
      `受付日時: ${formatDateTime(application.created_at)}`,
      "",
      "担当者が内容を確認し、ご利用開始までの流れをご案内します。",
      "このフォームの送信だけで自動的に利用開始にはなりません。ご契約内容の確認後、初期設定とアカウント発行を進めます。",
      "",
      "ご不明点がありましたら、このメールへの返信、または info@aioboost.jp までご連絡ください。",
      "",
      "AIO boost"
    ].join("\n")
  };
}

export function adminNewApplicationNotice(application: SalesApplication) {
  return {
    subject: "【AIO】新しい導入申し込みが届きました",
    text: [
      "新しい導入申し込みが届きました。",
      "",
      `店舗名: ${application.store_name}`,
      `担当者名: ${application.contact_name}`,
      `メール: ${application.email}`,
      `電話番号: ${application.phone ?? "-"}`,
      `業態: ${application.industry_label ?? application.industry_type_key ?? "-"}`,
      `店舗数: ${application.store_count}`,
      "",
      `公式サイト: ${application.website_url ?? "-"}`,
      `Googleマップ / GBP: ${application.google_maps_url ?? "-"}`,
      `SNS:\n${socialText(application.social_urls)}`,
      `参考URL: ${listText(application.reference_urls)}`,
      "",
      `課題:\n${application.pain_points ?? "-"}`,
      "",
      `AI解析状態: ${application.ai_analysis_status ?? "not_started"}`,
      `AI解析概要:\n${application.ai_business_summary ?? "-"}`,
      "",
      `管理画面: ${appUrl(`/admin/applications/${application.id}`)}`,
      `申込一覧: ${appUrl("/admin/applications")}`
    ].join("\n")
  };
}

export async function sendApplicationReceivedEmails(application: SalesApplication) {
  const config = emailConfig();
  const applicant = applicantAutoReply(application);
  const admin = adminNewApplicationNotice(application);
  await Promise.allSettled([
    sendAndLog(application.id, {
      to: application.email,
      subject: applicant.subject,
      text: applicant.text,
      templateKey: "application_received"
    }),
    sendAndLog(application.id, {
      to: config.adminEmail,
      subject: admin.subject,
      text: admin.text,
      templateKey: "admin_new_application"
    })
  ]);
}

export function applicationInviteEmail(application: SalesApplication, passwordSetupUrl: string) {
  const onboardingUrl = appUrl(application.store_id ? `/onboarding?storeId=${application.store_id}` : "/onboarding");

  return {
    subject: "AIO boost 利用開始のご案内",
    text: [
      `${application.contact_name} 様`,
      "",
      "AIO boostの利用開始準備が整いました。",
      "以下のリンクからログイン用パスワードを設定し、初回導入ガイドへお進みください。",
      "",
      `パスワード設定リンク: ${passwordSetupUrl}`,
      `初回導入ガイド: ${onboardingUrl}`,
      "",
      "申込時の内容をもとに、店舗情報の下書きを用意しています。",
      "ログイン後、店舗名・業態・Webサイト・SNS情報などを確認し、必要に応じて修正してください。",
      "",
      "リンクの有効期限が切れている場合は、担当者へ再発行をご依頼ください。",
      "ご不明点がありましたら、このメールへの返信、または info@aioboost.jp までご連絡ください。",
      "",
      "AIO boost"
    ].join("\n")
  };
}

export async function sendApplicationInviteEmail(applicationId: string, application: SalesApplication, passwordSetupUrl: string) {
  const message = applicationInviteEmail(application, passwordSetupUrl);
  return sendAndLog(applicationId, {
    to: application.email,
    subject: message.subject,
    text: message.text,
    templateKey: "account_invite"
  });
}

export function applicationGuideEmail(application: SalesApplication, templateKey: string) {
  const loginUrl = appUrl("/login");
  const onboardingUrl = appUrl(application.store_id ? `/onboarding?storeId=${application.store_id}` : "/onboarding");
  const storeUrl = application.store_id ? appUrl(`/stores/${application.store_id}`) : onboardingUrl;

  const templates: Record<string, { subject: string; text: string }> = {
    demo_invitation: {
      subject: "AIO boost オンライン説明のご案内",
      text: [
        `${application.contact_name} 様`,
        "",
        "AIO boostへのご相談ありがとうございます。",
        "店舗の状況や導入目的を伺いながら、使い方と初期設定の流れをご案内します。",
        "",
        "当日は、現在お使いのツール、請求・入金管理、売上データ、集客まわりのお困りごとを中心に確認します。",
        "",
        "日程や参加URLは、担当者より別途ご案内します。",
        "",
        "AIO boost"
      ].join("\n")
    },
    invoice_issued: {
      subject: "AIO boost ご契約内容とお支払いのご案内",
      text: [
        `${application.contact_name} 様`,
        "",
        "AIO boostのご契約内容について確認が完了しました。",
        "担当者より、お支払い方法とご利用開始までの流れをご案内します。",
        "",
        "ご不明点がありましたら、担当者または info@aioboost.jp までご連絡ください。",
        "",
        "AIO boost"
      ].join("\n")
    },
    payment_approved: {
      subject: "AIO boost ご利用開始準備を進めています",
      text: [
        `${application.contact_name} 様`,
        "",
        "お手続きの確認が完了しました。",
        "担当者が初期設定とアカウント発行の準備を進めています。",
        "",
        "準備が整い次第、ログイン方法と初回設定の進め方をご案内します。",
        "",
        "AIO boost"
      ].join("\n")
    },
    account_started: {
      subject: "AIO boost 利用開始のご案内",
      text: [
        `${application.contact_name} 様`,
        "",
        "AIO boostの利用開始準備が整いました。",
        "以下のURLからログインし、初回導入ガイドに沿って店舗情報を確認してください。",
        "",
        `ログインURL: ${loginUrl}`,
        `初回導入ガイド: ${onboardingUrl}`,
        `店舗画面: ${storeUrl}`,
        "",
        "申込時の内容をもとに、店舗情報の下書きを用意しています。",
        "内容を確認しながら、商品・サービス、顧客、請求書設定などを整えてください。",
        "",
        "AIO boost"
      ].join("\n")
    }
  };

  return templates[templateKey] ?? templates.demo_invitation;
}

export function recommendedApplicationEmailTemplates(application: SalesApplication) {
  const recommendations: Array<{ templateKey: typeof applicationEmailTemplates[number][0]; reason: string }> = [];

  if (application.status === "demo_scheduled") {
    recommendations.push({ templateKey: "demo_invitation", reason: "説明予定になったため、参加方法や確認事項を案内します。" });
  }
  if (application.status === "invoice_issued" || application.billing_status === "issued") {
    recommendations.push({ templateKey: "invoice_issued", reason: "請求書発行後の支払い方法と利用開始までの流れを案内します。" });
  }
  if (application.status === "payment_confirmed" || application.status === "approved" || application.payment_status === "paid") {
    recommendations.push({ templateKey: "payment_approved", reason: "入金確認後、利用開始準備を進めていることを案内します。" });
  }
  if (application.status === "account_issued" || application.account_status === "invited" || application.account_status === "issued") {
    recommendations.push({ templateKey: "account_started", reason: "アカウント準備後、ログインと初回導入ガイドを案内します。" });
  }

  return recommendations;
}

export async function sendApplicationGuideEmailAction(applicationId: string, formData: FormData) {
  "use server";

  await requirePlatformAdmin();
  const templateKey = String(formData.get("template_key") ?? "demo_invitation");
  const subjectOverride = String(formData.get("subject") ?? "").trim();
  const bodyOverride = String(formData.get("body") ?? "").trim();
  const toEmail = String(formData.get("to_email") ?? "").trim();

  const supabase = createSupabaseAdminClient();
  if (!supabase) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("メール送信の準備に失敗しました。")}`);

  const { data: application, error } = await supabase.from("applications").select("*").eq("id", applicationId).maybeSingle();
  if (error || !application) redirect(`/admin/applications/${applicationId}?error=${encodeURIComponent("申込情報を取得できませんでした。")}`);

  const base = applicationGuideEmail(application as SalesApplication, templateKey);
  const subject = subjectOverride || base.subject;
  const text = bodyOverride || base.text;
  const target = toEmail || application.email;
  const result = await sendAndLog(applicationId, {
    to: target,
    subject,
    text,
    templateKey: templateKey as ApplicationEmailTemplateKey
  });

  if (!result.ok) {
    redirect(`/admin/applications/${applicationId}?email=${result.status}&error=${encodeURIComponent("メール送信に失敗しました。送信履歴で詳細を確認してください。")}`);
  }

  revalidatePath(`/admin/applications/${applicationId}`);
  redirect(`/admin/applications/${applicationId}?email=sent`);
}
