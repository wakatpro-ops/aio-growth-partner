import { NextResponse } from "next/server";
import { completeMetaOAuth, decodeMetaState } from "@/lib/phase5/sns-publishing";

export async function GET(request: Request) {
  const url = new URL(request.url); const state = url.searchParams.get("state");
  let storeId = "";
  try { storeId = decodeMetaState(state); }
  catch { return NextResponse.redirect(new URL("/stores?error=Meta%E6%8E%A5%E7%B6%9A%E3%81%AE%E6%9C%89%E5%8A%B9%E6%9C%9F%E9%99%90%E3%81%8C%E5%88%87%E3%82%8C%E3%81%BE%E3%81%97%E3%81%9F", request.url)); }
  const providerError = url.searchParams.get("error_description");
  if (providerError) return NextResponse.redirect(new URL(`/stores/${storeId}/settings/channels?error=${encodeURIComponent(providerError)}`, request.url));
  try {
    const code = url.searchParams.get("code"); if (!code) throw new Error("Metaから認証コードを受け取れませんでした。");
    await completeMetaOAuth(code, state);
    return NextResponse.redirect(new URL(`/stores/${storeId}/settings/channels?meta_connected=1`, request.url));
  } catch (error) { return NextResponse.redirect(new URL(`/stores/${storeId}/settings/channels?error=${encodeURIComponent(error instanceof Error ? error.message : "Meta接続を完了できませんでした。")}`, request.url)); }
}
