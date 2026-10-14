import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AirRegiCredentials } from "./contracts";

function key() {
  const secret = process.env.AIRREGI_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.SNS_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("Airレジ接続情報の保護設定が未完了です。");
  return createHash("sha256").update(secret).digest();
}
export function encryptAirRegiCredentials(credentials: AirRegiCredentials, organizationId: string, storeId: string) {
  if (![credentials.apiKey, credentials.apiToken].every(value => typeof value === "string" && value.length > 0 && value.length <= 8192)) {
    throw new Error("Airレジの接続情報を確認してください。");
  }
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(organizationId + ":" + storeId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptAirRegiCredentials(value: string, organizationId: string, storeId: string): AirRegiCredentials {
  try {
    if (value.length > 30_000) throw new Error();
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(organizationId + ":" + storeId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const credentials = JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"));
    if (![credentials.apiKey, credentials.apiToken].every(value => typeof value === "string" && value.length > 0 && value.length <= 8192)) throw new Error();
    return { apiKey: credentials.apiKey, apiToken: credentials.apiToken };
  } catch { throw new Error("Airレジの接続情報を復号できません。再接続してください。"); }
}
