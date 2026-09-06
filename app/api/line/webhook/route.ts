import { NextResponse } from "next/server";
import { beginLineWebhookEvent, processLineWebhookEvent } from "@/lib/line/booking-webhook";
import { lineEventId, lineUserHash, verifyLineSignature } from "@/lib/line/signature";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LineWebhookBody } from "@/types/line-bookings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxBodyBytes = 1_000_000;

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBodyBytes) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), channelSecret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }
  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Webhook storage is not configured." }, { status: 503 });
  const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
  let processed = 0;
  let duplicates = 0;
  for (const [index, event] of events.entries()) {
    const eventId = lineEventId(rawBody, index, event.webhookEventId);
    const sourceHash = event.source?.userId ? lineUserHash(event.source.userId, channelSecret) : undefined;
    try {
      if (!(await beginLineWebhookEvent(supabase, { eventId, eventType: String(event.type ?? "unknown"), sourceHash }))) {
        duplicates += 1;
        continue;
      }
      await processLineWebhookEvent(event, eventId);
      processed += 1;
    } catch {
      // LINE retries non-2xx deliveries. Failed events are retained and may be retried up to three times.
      return NextResponse.json({ error: "Processing failed." }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true, processed, duplicates });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "AIO boost LINE webhook" });
}

