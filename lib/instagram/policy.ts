import crypto from "node:crypto";

export const INSTAGRAM_LOGIN_PROVIDER = "instagram_login";
export const INSTAGRAM_LOGIN_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"] as const;
export const INSTAGRAM_STATE_COOKIE = "aio_instagram_oauth_state";
export const INSTAGRAM_STATE_TTL = 15 * 60;

export function instagramRedirectUri(value: string | undefined) {
  if (!value) throw new Error("Instagramの接続設定は準備中です。");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/instagram/oauth/callback") {
    throw new Error("Instagramの接続戻り先を確認してください。");
  }
  return url.href;
}

export function instagramLoginAllowed(storeId: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.INSTAGRAM_LOGIN_ENABLED !== "true") return false;
  if (env.INSTAGRAM_ADVANCED_ACCESS_APPROVED === "true") return true;
  return (env.INSTAGRAM_LOGIN_TEST_STORE_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean).includes(storeId);
}

export function instagramStateHash(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new Error("Instagram接続の安全性を確認できません。接続し直してください。");
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function verifyInstagramState(value: string | null, cookie: string | undefined) {
  if (!value || !cookie || !/^[A-Za-z0-9_-]{43}$/u.test(value) || !/^[A-Za-z0-9_-]{43}$/u.test(cookie) || !crypto.timingSafeEqual(Buffer.from(value), Buffer.from(cookie))) {
    throw new Error("Instagram接続の有効期限が切れたか、別のブラウザです。接続し直してください。");
  }
  return instagramStateHash(value);
}

export function instagramAuthorizationUrl(appId: string, redirectUri: string, state: string) {
  if (!/^\d+$/u.test(appId)) throw new Error("InstagramアプリIDを確認してください。");
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: appId, redirect_uri: instagramRedirectUri(redirectUri), response_type: "code", scope: INSTAGRAM_LOGIN_SCOPES.join(","), state, enable_fb_login: "false", force_reauth: "true" }).toString();
  return url.href;
}

export type PublishingAccount = {
  id: string; organization_id: string; store_id: string; channel: string; external_provider: string;
  external_account_id: string | null; access_token_encrypted?: string | null; connection_status: string;
  token_expires_at?: string | null; connected_at?: string | null; scopes?: string[]; metadata?: Record<string, unknown>;
};

// Once a direct connection exists, expiry/disconnection must not silently switch to a different legacy account.
export function preferredPublishingAccount<T extends PublishingAccount>(accounts: T[], channel: string): T | null {
  const relevant = accounts.filter(account => account.channel === channel);
  if (channel === "instagram") {
    const direct = relevant.find(account => account.external_provider === INSTAGRAM_LOGIN_PROVIDER);
    if (direct) return direct;
  }
  return relevant.find(account => account.external_provider === "meta") ?? null;
}

// Public context uses this projection without fetching encrypted credentials.
export function publishingAccountConnected(account: PublishingAccount | null, now = Date.now()) {
  if (!account || account.connection_status !== "connected" || !account.external_account_id) return false;
  if (account.token_expires_at && (!Number.isFinite(Date.parse(account.token_expires_at)) || Date.parse(account.token_expires_at) <= now)) return false;
  if (account.external_provider === INSTAGRAM_LOGIN_PROVIDER) {
    return Boolean(account.token_expires_at) && INSTAGRAM_LOGIN_SCOPES.every(scope => account.scopes?.includes(scope));
  }
  return account.external_provider === "meta";
}

export function publishingAccountReady(account: PublishingAccount | null, now = Date.now()) {
  return publishingAccountConnected(account, now) && Boolean(account?.access_token_encrypted);
}

export function publishingConnectionSnapshot(account: PublishingAccount | null) {
  return account ? { connection_account_id: account.id, connection_provider: account.external_provider, connection_target_id: account.external_account_id, connection_generation: account.metadata?.connection_generation ?? null } : {};
}

export function assertPublishingConnection(account: PublishingAccount, payload: Record<string, unknown>, targetId: unknown) {
  if (payload.connection_account_id && (payload.connection_account_id !== account.id || payload.connection_provider !== account.external_provider || payload.connection_target_id !== account.external_account_id || (payload.connection_generation && payload.connection_generation !== account.metadata?.connection_generation))) {
    throw new Error("投稿先の接続が変更されています。内容と投稿先を確認して、投稿を準備し直してください。");
  }
  if (!payload.connection_account_id && targetId && targetId !== account.external_account_id) {
    throw new Error("以前の投稿先と現在のアカウントが異なります。投稿先を確認してください。");
  }
}
