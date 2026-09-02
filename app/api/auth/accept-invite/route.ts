import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

const allowedTypes = new Set(["invite", "recovery"]);

export async function POST(request: Request) {
  if (!hasSupabaseBrowserEnv()) {
    return NextResponse.json({ ok: false, error: "招待確認の準備が完了していません。担当者へお問い合わせください。" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const tokenHash = typeof body.token_hash === "string" ? body.token_hash.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  if (tokenHash.length < 20 || tokenHash.length > 512 || !allowedTypes.has(type)) {
    return NextResponse.json({ ok: false, error: "招待リンクを確認できませんでした。新しい招待メールを開いてください。" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "invite" | "recovery"
  });
  const session = data.session;
  if (error || !session?.access_token || !session.refresh_token) {
    return NextResponse.json({
      ok: false,
      error: "この招待リンクは有効期限が切れているか、すでに使用されています。担当者へ再発行をご依頼ください。"
    }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600
  });
}
