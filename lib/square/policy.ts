import { createHash, timingSafeEqual } from "node:crypto";

export const SQUARE_VERSION = "2026-09-16";
export const SQUARE_SPEC = "orders-2026-09-16-v1";
export const SQUARE_SCOPES = ["MERCHANT_PROFILE_READ", "ORDERS_READ"] as const;
export const SQUARE_COOKIE = "aio_square_oauth_state";
export const SQUARE_TTL = 15 * 60;
export type SquareEnvironment = "sandbox" | "production";
export type SquareOAuthStage = "exchange" | "locations" | "encryption" | "persistence";
export class SquareOAuthFailure extends Error {
  readonly reason: string;
  constructor(readonly stage: SquareOAuthStage, error: unknown) {
    super("square_oauth_failed");
    const allowed = ["square_reconnect_required", "square_rate_limited", "square_unavailable", "invalid_provider_data", "store_mismatch", "square_response_too_large", "no_eligible_locations", "database_rejected"];
    const message = error instanceof Error ? error.message : "";
    this.reason = allowed.includes(message) ? message : "invalid_provider_data";
  }
}
export async function squareOAuthStep<T>(stage: SquareOAuthStage, operation: () => T | Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw new SquareOAuthFailure(stage, error); }
}
export function squareEnvironment(value: string | undefined): SquareEnvironment {
  if (value !== "sandbox" && value !== "production") throw new Error("Squareの利用環境を設定してください。");
  return value;
}
export function squareHost(environment: SquareEnvironment) {
  return environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com";
}
export function squareRedirect(value: string | undefined) {
  if (!value) throw new Error("Squareの接続設定は準備中です。");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/square/oauth/callback") throw new Error("Squareの接続戻り先を確認してください。");
  return url.href;
}
export function squareStateHash(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error("Square接続の有効期限が切れました。接続し直してください。");
  return createHash("sha256").update(value).digest("hex");
}
export function verifySquareState(state: string | null, cookie: string | undefined) {
  if (!state || !cookie || !/^[A-Za-z0-9_-]{43}$/u.test(state) || !/^[A-Za-z0-9_-]{43}$/u.test(cookie) || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new Error("Square接続の安全性を確認できません。接続し直してください。");
  return squareStateHash(state);
}
export function squareAuthorizationUrl(environment: SquareEnvironment, appId: string, redirect: string, state: string) {
  if (!(environment === "sandbox" ? /^sandbox-sq0idb-[A-Za-z0-9_-]+$/u : /^sq0idp-[A-Za-z0-9_-]+$/u).test(appId)) throw new Error("Squareアプリと利用環境を確認してください。");
  squareStateHash(state);
  const url = new URL("/oauth2/authorize", squareHost(environment));
  // Sandbox requires the seller-dashboard session; production explicitly asks
  // the seller to authenticate instead of silently reusing a different account.
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: squareRedirect(redirect), response_type: "code", scope: SQUARE_SCOPES.join(" "), state, session: environment === "sandbox" ? "true" : "false" }).toString();
  return url.href;
}
export function squareAllowed(storeId: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.SQUARE_LOGIN_ENABLED !== "true") return false;
  // Sandbox imports must remain in explicitly designated synthetic stores.
  const allowlist = (env.SQUARE_TEST_STORE_IDS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  if (env.SQUARE_ENVIRONMENT !== "sandbox" && env.SQUARE_ENVIRONMENT !== "production") return false;
  return (env.SQUARE_ENVIRONMENT === "production" && env.SQUARE_GENERAL_ACCESS === "true") || allowlist.includes(storeId);
}
