import { NextResponse } from "next/server";
import { syncDueAiVisibilityObservations, syncDueSearchConsoleStores } from "@/lib/results-visibility";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [searchConsole, aiVisibility] = await Promise.all([syncDueSearchConsoleStores(), syncDueAiVisibilityObservations()]);
  return NextResponse.json({ searchConsole, aiVisibility });
}
