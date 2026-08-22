import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createVerificationCode,
  normalizeVerificationEmail,
  verificationCodeHash,
  verificationCodeLifetimeMinutes,
  verificationEmailHash,
  verificationMaxSendsPerEmailHour,
  verificationMaxSendsPerWindow,
  verificationResendSeconds,
  verificationWindowMinutes
} from "@/lib/applications/contact-verification";
import { hashPublicAnalysisToken } from "@/lib/applications/public-analysis-token";
import { sendEmail } from "@/lib/email/sendgrid";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  analysis_token: z.string().trim().min(32).max(128),
  contact_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(240)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "名前とメールアドレスを確認してください。" }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "現在、確認メールを送信できません。時間をおいてお試しください。" }, { status: 503 });

  const tokenHash = hashPublicAnalysisToken(parsed.data.analysis_token);
  const { data: draft } = await supabase.from("public_store_analyses").select("*").eq("public_token_hash", tokenHash).maybeSingle();
  if (!draft || !["success", "partial"].includes(draft.status) || new Date(draft.expires_at).getTime() <= Date.now() || draft.converted_application_id) {
    return NextResponse.json({ ok: false, error: "診断結果を確認できません。URLからもう一度診断してください。" }, { status: 404 });
  }

  const now = Date.now();
  const sentAt = draft.verification_sent_at ? new Date(draft.verification_sent_at).getTime() : 0;
  if (sentAt && now - sentAt < verificationResendSeconds * 1_000) {
    return NextResponse.json({ ok: false, code: "verification_cooldown", error: "確認メールは送信済みです。1分ほど待ってから再送してください。" }, { status: 429 });
  }

  const windowStarted = draft.verification_window_started_at ? new Date(draft.verification_window_started_at).getTime() : 0;
  const inWindow = windowStarted > now - verificationWindowMinutes * 60_000;
  const sendCount = inWindow ? Number(draft.verification_send_count ?? 0) : 0;
  if (sendCount >= verificationMaxSendsPerWindow) {
    return NextResponse.json({ ok: false, code: "verification_rate_limited", error: "確認メールの送信回数が上限に達しました。30分ほど待ってからお試しください。" }, { status: 429 });
  }

  const email = normalizeVerificationEmail(parsed.data.email);
  const emailHash = verificationEmailHash(email);
  const hourAgo = new Date(now - 60 * 60_000).toISOString();
  const { count: emailSends } = await supabase.from("public_store_analyses")
    .select("id", { count: "exact", head: true })
    .eq("verification_email_hash", emailHash)
    .gte("verification_sent_at", hourAgo);
  if ((emailSends ?? 0) >= verificationMaxSendsPerEmailHour) {
    return NextResponse.json({ ok: false, code: "verification_rate_limited", error: "このメールアドレスへの送信回数が上限に達しました。時間をおいてお試しください。" }, { status: 429 });
  }

  const code = createVerificationCode();
  const expiresAt = new Date(now + verificationCodeLifetimeMinutes * 60_000).toISOString();
  const nextWindowStart = inWindow ? draft.verification_window_started_at : new Date(now).toISOString();
  const { error: updateError } = await supabase.from("public_store_analyses").update({
    verification_name: parsed.data.contact_name,
    verification_email: email,
    verification_email_hash: emailHash,
    verification_code_hash: verificationCodeHash(parsed.data.analysis_token, email, code),
    verification_code_expires_at: expiresAt,
    verification_attempts: 0,
    verification_sent_at: new Date(now).toISOString(),
    verification_send_count: sendCount + 1,
    verification_window_started_at: nextWindowStart,
    verified_at: null,
    updated_at: new Date(now).toISOString()
  }).eq("id", draft.id);
  if (updateError) return NextResponse.json({ ok: false, error: "現在、確認メールを送信できません。時間をおいてお試しください。" }, { status: 503 });

  const emailResult = await sendEmail({
    to: email,
    subject: "AIO boost メールアドレス確認コード",
    templateKey: "url_diagnosis_verification",
    text: [
      `${parsed.data.contact_name} 様`, "", "AIO boostの詳細診断申込に使用する確認コードです。", "",
      `確認コード: ${code}`, "", `有効期限: ${verificationCodeLifetimeMinutes}分`, "",
      "このコードをAIO boostの画面へ入力してください。心当たりがない場合は、このメールを破棄してください。",
      "この確認はメールの到達確認であり、店舗の所有権確認ではありません。", "", "AIO boost"
    ].join("\n")
  }).catch(() => ({ ok: false as const, status: "failed" as const, errorMessage: "send_failed" }));
  if (!emailResult.ok) {
    await supabase.from("public_store_analyses").update({ verification_code_hash: null, verification_code_expires_at: null }).eq("id", draft.id);
    return NextResponse.json({ ok: false, error: "確認メールを送信できませんでした。時間をおいてお試しください。" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, expires_in_minutes: verificationCodeLifetimeMinutes });
}
