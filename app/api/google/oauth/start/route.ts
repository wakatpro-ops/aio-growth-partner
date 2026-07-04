import { NextResponse } from "next/server";
import { buildGoogleOAuthStartUrl } from "@/lib/phase5/google-integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") ?? "store-auto-demo";
  try {
    const authUrl = await buildGoogleOAuthStartUrl(storeId);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google接続を開始できませんでした。";
    return NextResponse.redirect(new URL(`/stores/${storeId}/settings/google?error=${encodeURIComponent(message)}`, url.origin));
  }
}
