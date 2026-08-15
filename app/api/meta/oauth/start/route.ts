import { NextResponse } from "next/server";
import { getMetaOAuthUrl } from "@/lib/phase5/sns-publishing";

export async function GET(request: Request) {
  const storeId = new URL(request.url).searchParams.get("store_id");
  if (!storeId) return NextResponse.redirect(new URL("/stores?error=Meta%E6%8E%A5%E7%B6%9A%E5%85%88%E3%81%AE%E5%BA%97%E8%88%97%E3%81%8C%E3%81%82%E3%82%8A%E3%81%BE%E3%81%9B%E3%82%93", request.url));
  try { return NextResponse.redirect(await getMetaOAuthUrl(storeId)); }
  catch (error) { return NextResponse.redirect(new URL(`/stores/${storeId}/settings/channels?error=${encodeURIComponent(error instanceof Error ? error.message : "Meta接続を開始できませんでした。")}`, request.url)); }
}
