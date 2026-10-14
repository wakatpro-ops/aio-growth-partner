import { NextRequest, NextResponse } from "next/server";
import { completeInstagramOAuth, consumeInstagramOAuth } from "@/lib/instagram/service";
import { INSTAGRAM_STATE_COOKIE, verifyInstagramState } from "@/lib/instagram/policy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  let storeId = "";
  let destination: string;
  try {
    const hash = verifyInstagramState(url.searchParams.get("state"), request.cookies.get(INSTAGRAM_STATE_COOKIE)?.value);
    const session = await consumeInstagramOAuth(hash, url.origin);
    storeId = session.storeId;
    if (url.searchParams.has("error")) throw new Error("Instagram接続をキャンセルしました。Facebook連携は変更していません。");
    await completeInstagramOAuth(session, url.searchParams.get("code") ?? "");
    destination = `/stores/${storeId}/settings/channels?instagram_connected=1`;
  } catch (error) {
    destination = `${storeId ? `/stores/${storeId}/settings/channels` : "/stores"}?error=${encodeURIComponent(error instanceof Error ? error.message : "Instagram接続を完了できませんでした。")}`;
  }
  const response = NextResponse.redirect(new URL(destination, url.origin));
  response.cookies.set(INSTAGRAM_STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/instagram/oauth", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
