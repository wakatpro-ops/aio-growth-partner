import { NextRequest, NextResponse } from "next/server";
import { completeSquareConnection } from "@/lib/square/service";
import { SQUARE_COOKIE, verifySquareState } from "@/lib/square/policy";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  let destination = "/stores?square_error=1";
  try {
    const hash = verifySquareState(url.searchParams.get("state"), request.cookies.get(SQUARE_COOKIE)?.value);
    if (url.searchParams.has("error")) throw new Error("authorization_canceled");
    const result = await completeSquareConnection(hash, url.searchParams.get("code") ?? "", url.origin);
    destination = `/stores/${result.storeId}/settings/integrations/square?pending=${result.pendingId}`;
  } catch { /* No OAuth codes, tokens, customer data, or provider errors in URLs/logs. */ }
  const response = NextResponse.redirect(new URL(destination, url.origin));
  response.cookies.set(SQUARE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/square/oauth", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
