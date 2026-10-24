import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { SquareTokens } from "./client";
const schema = z.object({ accessToken: z.string().min(1).max(8192), refreshToken: z.string().min(1).max(8192), expiresAt: z.string().datetime({ offset: true }), merchantId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u) }).strict();
function key() {
  const value = process.env.SQUARE_TOKEN_ENCRYPTION_KEY;
  if (!value || value.length < 32) throw new Error("Square接続情報の保護設定が未完了です。");
  return createHash("sha256").update(value).digest();
}
export function encryptSquareTokens(tokens: SquareTokens, organization: string, store: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`square:${organization}:${store}`));
  const value = Buffer.concat([cipher.update(JSON.stringify(schema.parse(tokens)), "utf8"), cipher.final()]);
  return ["sp1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), value.toString("base64url")].join(".");
}
export function decryptSquareTokens(encrypted: string, organization: string, store: string): SquareTokens {
  try {
    if (encrypted.length > 30000) throw new Error();
    const [version, iv, tag, value, extra] = encrypted.split(".");
    if (version !== "sp1" || !iv || !tag || !value || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(`square:${organization}:${store}`)); decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return schema.parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(value, "base64url")), decipher.final()]).toString("utf8")));
  } catch { throw new Error("square_reconnect_required"); }
}
