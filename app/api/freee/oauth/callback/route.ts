import { NextResponse } from "next/server";
import { handleFreeeOAuthCallback } from "@/lib/phase6/freee-connect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await handleFreeeOAuthCallback(url);
    const search = result.ok ? "connected=1" : `error=${encodeURIComponent(result.message)}`;
    return NextResponse.redirect(new URL(`/stores/${result.storeId}/settings/accounting/freee?${search}`, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "freee接続の保存に失敗しました。";
    return NextResponse.redirect(new URL(`/stores?error=${encodeURIComponent(message)}`, url.origin));
  }
}
