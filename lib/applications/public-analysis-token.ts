import { createHash, createHmac, randomBytes } from "node:crypto";

export function createPublicAnalysisToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPublicAnalysisToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function rateLimitKey(value: string) {
  const secret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "aio-boost-public-analysis";
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function publicRequestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 160) || "unknown-agent";
  return rateLimitKey(`${forwarded}|${agent}`);
}
