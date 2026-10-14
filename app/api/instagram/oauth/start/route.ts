import { NextResponse } from "next/server";
import { startInstagramOAuth } from "@/lib/instagram/service";
import { INSTAGRAM_STATE_COOKIE, INSTAGRAM_STATE_TTL } from "@/lib/instagram/policy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("store_id") ?? "";
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(storeId)) return NextResponse.json({ error: "店舗を確認してください。" }, { status: 400 });
  try {
    const result = await startInstagramOAuth(storeId, url.origin);
    const response = NextResponse.redirect(result.url);
    response.cookies.set(INSTAGRAM_STATE_COOKIE, result.state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/instagram/oauth", maxAge: INSTAGRAM_STATE_TTL });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const response = NextResponse.redirect(new URL(`/stores/${storeId}/settings/channels?error=${encodeURIComponent(error instanceof Error ? error.message : "Instagram接続を開始できませんでした。")}`, url.origin));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
