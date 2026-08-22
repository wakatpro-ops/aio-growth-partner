import { createHmac, timingSafeEqual } from "node:crypto";

const tokenLifetimeSeconds = 7 * 24 * 60 * 60;

function secret() {
  const value = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("Operator review token secret is not configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOperatorReviewToken(applicationId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ application_id: applicationId, exp: Math.floor(now / 1_000) + tokenLifetimeSeconds })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyOperatorReviewToken(token: string, now = Date.now()) {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(payload);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { application_id?: unknown; exp?: unknown };
    if (typeof value.application_id !== "string" || typeof value.exp !== "number" || value.exp <= Math.floor(now / 1_000)) return null;
    return { applicationId: value.application_id, expiresAt: new Date(value.exp * 1_000) };
  } catch {
    return null;
  }
}
