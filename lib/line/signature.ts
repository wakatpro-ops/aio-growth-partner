import crypto from "node:crypto";

export function verifyLineSignature(rawBody: string, signature: string | null, channelSecret: string) {
  if (!signature || !channelSecret) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function lineEventId(rawBody: string, index: number, supplied?: string) {
  const value = supplied?.trim();
  return value || crypto.createHash("sha256").update(`${index}:${rawBody}`).digest("hex");
}

export function lineUserHash(userId: string, channelSecret: string) {
  return crypto.createHmac("sha256", channelSecret).update(userId).digest("hex");
}

export function lineLinkCodeHash(code: string, channelSecret: string) {
  return crypto.createHmac("sha256", channelSecret).update(normalizeLineLinkCode(code)).digest("hex");
}

export function normalizeLineLinkCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/gu, "").slice(0, 8);
}

export function encryptLineUserId(userId: string, channelSecret: string) {
  const key = crypto.createHash("sha256").update(`aio-boost-line-user-v1:${channelSecret}`).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptLineUserId(value: string, channelSecret: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("LINE利用者情報を復号できません。");
  const key = crypto.createHash("sha256").update(`aio-boost-line-user-v1:${channelSecret}`).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

