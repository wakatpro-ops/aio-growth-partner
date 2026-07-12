import { NextResponse } from "next/server";
import { handleStripeOAuthCallback } from "@/lib/phase6/stripe-connect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const result = await handleStripeOAuthCallback(url);
    const search = result.ok ? "connected=1" : `error=${encodeURIComponent(result.message)}`;
    return NextResponse.redirect(new URL(`/stores/${result.storeId}/settings/payments/stripe?${search}`, url.origin));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe接続の保存に失敗しました。";
    return NextResponse.redirect(new URL(`/stores?error=${encodeURIComponent(message)}`, url.origin));
  }
}
