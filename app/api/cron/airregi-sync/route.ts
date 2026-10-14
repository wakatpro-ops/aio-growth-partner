import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAirRegiSync } from "@/lib/airregi/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET ? Buffer.from(`Bearer ${process.env.CRON_SECRET}`) : null;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!expected || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try { return NextResponse.json(await runAirRegiSync()); }
  catch { return NextResponse.json({ error: "Airレジ同期を完了できませんでした。" }, { status: 503 }); }
}
