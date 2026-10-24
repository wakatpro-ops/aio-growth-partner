import { NextRequest, NextResponse } from "next/server";
import { beginSquareConnection } from "@/lib/square/service";
import { SQUARE_COOKIE, SQUARE_TTL } from "@/lib/square/policy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("cross_site_start");
    const result = await beginSquareConnection(url.searchParams.get("storeId") ?? "", url.origin);
    const response = NextResponse.redirect(result.url);
    response.cookies.set(SQUARE_COOKIE, result.state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/square/oauth", maxAge: SQUARE_TTL });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/stores?square_error=1", url.origin));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
