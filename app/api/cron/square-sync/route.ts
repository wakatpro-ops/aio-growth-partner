import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runSquareSync } from "@/lib/square/service";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (!expected || expected.length !== received.length || !timingSafeEqual(expected, received)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runSquareSync(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "square_sync_unavailable" }, { status: 503 }); }
}
