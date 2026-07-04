import { NextResponse } from "next/server";
import { handleGoogleOAuthCallback } from "@/lib/phase5/google-integrations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await handleGoogleOAuthCallback(url);
    const search = result.ok ? "connected=1" : `error=${encodeURIComponent(result.message)}`;
    return NextResponse.redirect(new URL(`/stores/${result.storeId}/settings/google?${search}`, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google OAuth callbackの処理に失敗しました。";
    return NextResponse.redirect(new URL(`/stores/store-auto-demo/settings/google?error=${encodeURIComponent(message)}`, url.origin));
  }
}
