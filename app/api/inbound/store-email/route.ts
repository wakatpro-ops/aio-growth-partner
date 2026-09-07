import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processInboundStoreEmail } from "@/lib/store-email/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxBodyBytes = 5_000_000;

function authorized(request: Request, secret: string) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : request.headers.get("x-aio-inbound-secret") ?? url.searchParams.get("token") ?? "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function recipients(formData: FormData) {
  const result = [field(formData, "to")];
  try {
    const envelope = JSON.parse(field(formData, "envelope") || "{}") as { to?: unknown };
    if (Array.isArray(envelope.to)) result.push(...envelope.to.filter((value): value is string => typeof value === "string"));
  } catch {
    // The explicit `to` field remains available when envelope JSON is malformed.
  }
  return result.filter(Boolean);
}

export async function POST(request: Request) {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  if (!authorized(request, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBodyBytes) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) return NextResponse.json({ error: "Unsupported content type." }, { status: 415 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > maxBodyBytes) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  try {
    const formData = await new Response(raw, { headers: { "content-type": contentType } }).formData();
    const result = await processInboundStoreEmail({
      recipients: recipients(formData),
      from: field(formData, "from"),
      subject: field(formData, "subject"),
      text: field(formData, "text"),
      html: field(formData, "html"),
      headers: field(formData, "headers")
    });
    return NextResponse.json({ received: true, processed: result.accepted, duplicate: "duplicate" in result ? result.duplicate : false }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "AIO boost store email inbound" });
}
