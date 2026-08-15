import { NextResponse } from "next/server";
import { buildGoogleOAuthStartUrl, GOOGLE_SEARCH_CONSOLE_SCOPE } from "@/lib/phase5/google-integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") ?? "store-auto-demo";
  const capability = url.searchParams.get("capability");
  try {
    const additionalScopes = capability === "search_console" ? [GOOGLE_SEARCH_CONSOLE_SCOPE] : [];
    const authUrl = await buildGoogleOAuthStartUrl(storeId, additionalScopes);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google接続を開始できませんでした。";
    return NextResponse.redirect(new URL(`/stores/${storeId}/settings/google?error=${encodeURIComponent(message)}`, url.origin));
  }
}
