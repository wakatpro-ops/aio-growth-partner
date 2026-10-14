import "server-only";
import crypto from "node:crypto";

function key() {
  const value = process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || process.env.SNS_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!value) throw new Error("Instagramの安全な保存設定は準備中です。");
  return crypto.createHash("sha256").update(value).digest();
}
function aad(organizationId: string, storeId: string) { return Buffer.from(JSON.stringify(["instagram_login", organizationId, storeId])); }

export function encryptInstagramToken(token: string, organizationId: string, storeId: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(organizationId, storeId));
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["ig1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptInstagramToken(value: string, organizationId: string, storeId: string) {
  try {
    const [version, iv, tag, data, extra] = value.split(":");
    if (version !== "ig1" || !iv || !tag || !data || extra) throw new Error("invalid");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAAD(aad(organizationId, storeId));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch { throw new Error("Instagramの認証情報を確認できません。再接続してください。"); }
}
