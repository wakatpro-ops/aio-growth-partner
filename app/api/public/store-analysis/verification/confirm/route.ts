import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeVerificationEmail,
  verificationCodeHash,
  verificationCodeMatches,
  verificationEmailHash,
  verificationMaxAttempts
} from "@/lib/applications/contact-verification";
import { hashPublicAnalysisToken } from "@/lib/applications/public-analysis-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeOperatingModel } from "@/lib/applications/operating-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  analysis_token: z.string().trim().min(32).max(128),
  email: z.string().trim().email().max(240),
  code: z.string().trim().regex(/^\d{6}$/u)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "6桁の確認コードを入力してください。" }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "現在、確認できません。時間をおいてお試しください。" }, { status: 503 });

  const tokenHash = hashPublicAnalysisToken(parsed.data.analysis_token);
  const { data: draft } = await supabase.from("public_store_analyses").select("*").eq("public_token_hash", tokenHash).maybeSingle();
  const email = normalizeVerificationEmail(parsed.data.email);
  if (!draft || draft.converted_application_id || verificationEmailHash(email) !== draft.verification_email_hash) {
    return NextResponse.json({ ok: false, error: "確認コードを確認できません。もう一度メールを送信してください。" }, { status: 400 });
  }
  if (!draft.verification_code_hash || !draft.verification_code_expires_at || new Date(draft.verification_code_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, code: "verification_expired", error: "確認コードの有効期限が切れました。新しいコードを送信してください。" }, { status: 410 });
  }
  const attempts = Number(draft.verification_attempts ?? 0);
  if (attempts >= verificationMaxAttempts) {
    return NextResponse.json({ ok: false, code: "verification_locked", error: "確認コードの入力回数が上限に達しました。新しいコードを送信してください。" }, { status: 429 });
  }

  const actualHash = verificationCodeHash(parsed.data.analysis_token, email, parsed.data.code);
  if (!verificationCodeMatches(draft.verification_code_hash, actualHash)) {
    await supabase.from("public_store_analyses").update({ verification_attempts: attempts + 1, updated_at: new Date().toISOString() }).eq("id", draft.id);
    return NextResponse.json({ ok: false, code: "verification_invalid", error: "確認コードが一致しません。メールに記載された6桁をご確認ください。" }, { status: 400 });
  }

  const verifiedAt = new Date().toISOString();
  const { error } = await supabase.from("public_store_analyses").update({
    verified_at: verifiedAt,
    verification_code_hash: null,
    verification_code_expires_at: null,
    updated_at: verifiedAt
  }).eq("id", draft.id);
  if (error) return NextResponse.json({ ok: false, error: "現在、確認結果を保存できません。時間をおいてお試しください。" }, { status: 503 });
  return NextResponse.json({
    ok: true,
    contact_name: draft.verification_name,
    email,
    operating_model_draft: normalizeOperatingModel(draft.operating_model_draft)
  });
}
