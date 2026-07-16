import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authAccessTokenCookie } from "@/lib/auth/server";
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
  if (admin) {
    await admin
      .from("applications")
      .update({
        invitation_status: "password_set",
        account_status: "issued",
        onboarding_status: "started",
        updated_at: new Date().toISOString()
      })
      .eq("invited_user_id", data.user.id)
      .in("invitation_status", ["invite_link_sent", "invite_generated"]);
  }

  const response = NextResponse.json({ ok: true });
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
