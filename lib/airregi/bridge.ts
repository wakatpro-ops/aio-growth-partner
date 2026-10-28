import "server-only";
import { z } from "zod";
import type { AirRegiAdapter } from "./contracts";

// The provider-specific wire adapter stays in a private, fixed-egress worker.
// Only AIOb's existing canonical representation crosses this boundary.
const identity = z.object({ externalStoreId: z.string().min(1).max(160), name: z.string().min(1).max(300) }).strict();
const protocolVersion = "aiob-pos-v1";
export function airRegiTestStoreIds() {
  const values = (process.env.AIRREGI_TEST_STORE_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (values.length > 20 || values.some(value => !z.string().uuid().safeParse(value).success)) return [];
  return [...new Set(values)];
}
export class AirRegiBridgeError extends Error {
  constructor(public readonly code: "authentication_required" | "ip_not_registered" | "rate_limited" | "accounting_review_required" | "history_expired" | "store_mismatch" | "sync_failed") {
    super(code);
  }
}

export function bridgeConfiguration() {
  if (process.env.AIRREGI_ENABLED !== "true" || process.env.AIRREGI_EGRESS_APPROVED !== "true") return null;
  const secret = process.env.AIRREGI_BRIDGE_AUTH_SECRET;
  const encryptionKey = process.env.AIRREGI_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32 || !encryptionKey || encryptionKey.length < 32) return null;
  try {
    const url = new URL(process.env.AIRREGI_BRIDGE_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/v1/air-regi" || !url.hostname.includes(".") || /^[\d.:\[\]]+$/u.test(url.hostname) || /(^|\.)(localhost|local|internal)$/u.test(url.hostname)) return null;
    return { url: url.toString(), secret };
  } catch { return null; }
}

async function boundedJson(response: Response) {
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error();
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export function createAirRegiBridge(): AirRegiAdapter | null {
  const config = bridgeConfiguration();
  if (!config) return null;
  async function call(operation: string, input: object, signal: AbortSignal): Promise<unknown> {
    try {
      const response = await fetch(config!.url, {
        method: "POST", redirect: "error", cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        headers: { authorization: `Bearer ${config!.secret}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ protocolVersion, operation, ...input })
      });
      const body = z.object({ protocolVersion: z.literal(protocolVersion), data: z.unknown().optional(), error: z.string().optional() }).strict().parse(await boundedJson(response));
      if (!response.ok || body.error) {
        const code = z.enum(["authentication_required", "ip_not_registered", "rate_limited", "accounting_review_required", "history_expired", "store_mismatch"]).safeParse(body.error);
        throw new AirRegiBridgeError(code.success ? code.data : "sync_failed");
      }
      return body.data;
    } catch (error) {
      if (error instanceof AirRegiBridgeError) throw error;
      throw new AirRegiBridgeError("sync_failed"); // No response body, URL, key or provider message escapes.
    }
  }
  return {
    specificationVersion: "airregi-private-bridge-v1",
    minimumIntervalSeconds: 300,
    async probe(credentials, signal) { return identity.parse(await call("probe", { credentials }, signal)); },
    async readPage(input) {
      const { signal, ...payload } = input;
      return call("readPage", payload, signal);
    }
  };
}
