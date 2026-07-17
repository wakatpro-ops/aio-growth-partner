import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authAccessTokenCookie } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export async function POST(request: Request) {
  if (!hasSupabaseBrowserEnv()) {
    return NextResponse.json({ ok: false, error: "パスワード設定の準備が完了していません。担当者へお問い合わせください。" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const bodyAccessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "パスワードは8文字以上で設定してください。" }, { status: 400 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const accessToken = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${authAccessTokenCookie}=`))
    ?.slice(authAccessTokenCookie.length + 1);

  const verifiedAccessToken = bodyAccessToken || (accessToken ? decodeURIComponent(accessToken) : "");

  if (!verifiedAccessToken) {
    return NextResponse.json({ ok: false, error: "招待リンクの確認ができませんでした。招待メールを開き直してください。" }, { status: 401 });
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

  const { data, error } = await authClient.auth.getUser(verifiedAccessToken);
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "招待リンクの有効期限が切れている可能性があります。担当者へ再発行をご依頼ください。" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "パスワード設定の準備が完了していません。担当者へお問い合わせください。" }, { status: 500 });
  }

  const updateResult = await admin.auth.admin.updateUserById(data.user.id, {
    password,
    email_confirm: true
  });

  if (updateResult.error) {
    return NextResponse.json({ ok: false, error: "パスワードを設定できませんでした。別のパスワードで再度お試しください。" }, { status: 400 });
  }

  await admin
    .from("applications")
    .update({
      invitation_status: "password_set",
      account_status: "issued",
      onboarding_status: "started",
      updated_at: new Date().toISOString()
    })
    .eq("invited_user_id", data.user.id)
    .in("invitation_status", ["invite_link_sent", "invite_generated", "password_set"]);

  return NextResponse.json({ ok: true, email: data.user.email ?? null });
}
