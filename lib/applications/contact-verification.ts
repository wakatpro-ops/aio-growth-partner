import { randomInt, timingSafeEqual } from "node:crypto";
import { rateLimitKey } from "./public-analysis-token.ts";

export const verificationCodeLifetimeMinutes = 10;
export const verificationResendSeconds = 60;
export const verificationMaxSendsPerWindow = 3;
export const verificationWindowMinutes = 30;
export const verificationMaxSendsPerEmailHour = 5;
export const verificationMaxAttempts = 5;

export function normalizeVerificationEmail(value: string) {
  return value.trim().toLowerCase();
}

export function verificationEmailHash(email: string) {
  return rateLimitKey(`email:${normalizeVerificationEmail(email)}`);
}

export function createVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function verificationCodeHash(analysisToken: string, email: string, code: string) {
  return rateLimitKey(`verification:${analysisToken}:${normalizeVerificationEmail(email)}:${code}`);
}

export function verificationCodeMatches(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
