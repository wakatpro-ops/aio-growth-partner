import { NextResponse } from "next/server";
import { buildFreeeOAuthStartUrl } from "@/lib/phase6/freee-connect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  if (!storeId) {
    return NextResponse.redirect(new URL("/stores?error=freee接続を開始する店舗を確認できませんでした。", url.origin));
  }
  try {
    const authUrl = await buildFreeeOAuthStartUrl(storeId, url.origin);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "freee接続を開始できませんでした。";
    return NextResponse.redirect(new URL(`/stores/${storeId}/settings/accounting/freee?error=${encodeURIComponent(message)}`, url.origin));
  }
}
