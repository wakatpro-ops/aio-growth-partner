import { NextResponse } from "next/server";
import { buildStripeOAuthStartUrl } from "@/lib/phase6/stripe-connect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId");
  if (!storeId) {
    return NextResponse.redirect(new URL("/stores?error=Stripe接続を開始する店舗を確認できませんでした。", url.origin));
  }
  try {
    const authUrl = await buildStripeOAuthStartUrl(storeId, url.origin);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe接続を開始できませんでした。";
    return NextResponse.redirect(new URL(`/stores/${storeId}/settings/payments/stripe?error=${encodeURIComponent(message)}`, url.origin));
  }
}
