import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type StripeOAuthState = {
  storeId: string;
  nonce: string;
  createdAt: string;
  signature: string;
};

type StripeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  stripe_publishable_key?: string;
  stripe_user_id?: string;
  scope?: string;
  livemode?: boolean;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type StripeAccountResponse = {
  id?: string;
  business_profile?: {
    name?: string | null;
    url?: string | null;
  } | null;
  settings?: {
    dashboard?: {
      display_name?: string | null;
    } | null;
  } | null;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  email?: string | null;
  country?: string | null;
  default_currency?: string | null;
};

const demoStoreIds: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
};

async function resolveStore(supabase: SupabaseClient, storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id,
    publicStoreId: store.id
  };
}

function stripeOAuthEnvError(requestOrigin?: string) {
  const missing = [
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY],
    ["STRIPE_CONNECT_CLIENT_ID", process.env.STRIPE_CONNECT_CLIENT_ID]
  ].filter(([, value]) => !value).map(([key]) => key);
  const redirectUri = stripeRedirectUri(requestOrigin);
  if (!redirectUri) missing.push("APP_BASE_URL");
  if (missing.length === 0) return null;
  return `Stripe接続に必要な設定が未完了です: ${missing.join(", ")}。`;
}

export function isStripeConnectEnvReady(requestOrigin?: string) {
  return stripeOAuthEnvError(requestOrigin) === null;
}

export function stripeRedirectUri(requestOrigin?: string) {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/api/stripe/oauth/callback`;
}

function stateSecret() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Stripe接続の検証に必要な設定が未完了です。");
  return secret;
}

function signStatePayload(storeId: string, nonce: string, createdAt: string) {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(`${storeId}.${nonce}.${createdAt}`)
    .digest("base64url");
}

function encodeStripeOAuthState(storeId: string) {
  const nonce = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload: StripeOAuthState = {
    storeId,
    nonce,
    createdAt,
    signature: signStatePayload(storeId, nonce, createdAt)
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeStripeOAuthState(state: string | null) {
  if (!state) throw new Error("Stripe接続の確認情報がありません。もう一度接続してください。");
  let payload: StripeOAuthState;
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as StripeOAuthState;
  } catch {
    throw new Error("Stripe接続の確認情報を読み取れませんでした。もう一度接続してください。");
  }
  if (!payload.storeId || !payload.nonce || !payload.createdAt || !payload.signature) {
    throw new Error("Stripe接続の確認情報が不足しています。もう一度接続してください。");
  }
  const created = Date.parse(payload.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 15 * 60 * 1000) {
    throw new Error("Stripe接続の有効期限が切れました。もう一度接続してください。");
  }
  const expected = signStatePayload(payload.storeId, payload.nonce, payload.createdAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(payload.signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("Stripe接続の確認に失敗しました。もう一度接続してください。");
  }
  return { storeId: payload.storeId, nonce: payload.nonce, createdAt: payload.createdAt };
}

function encryptToken(value: string | null | undefined) {
  if (!value) return { encryptedValue: null, storageMode: "not_returned" };
  const secret = process.env.STRIPE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) return { encryptedValue: null, storageMode: "not_stored_missing_encryption_key" };
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedValue: `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`,
    storageMode: "encrypted"
  };
}

async function logStripeIntegration(
  supabase: SupabaseClient,
  resolved: { organizationId: string; storeId: string },
  actionType: string,
  status: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("external_integration_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "stripe",
    action_type: actionType,
    status,
    message,
    metadata_json: metadata
  });
}

async function fetchStripeAccount(accountId: string) {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const response = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, {
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`
    },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return await response.json() as StripeAccountResponse;
}

export async function buildStripeOAuthStartUrl(storeId: string, requestOrigin?: string) {
  const envError = stripeOAuthEnvError(requestOrigin);
  if (envError) throw new Error(envError);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Stripe接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const state = encodeStripeOAuthState(storeId);
  await logStripeIntegration(supabase, resolved, "stripe_oauth_started", "ready", "Stripe接続を開始しました。");

  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.STRIPE_CONNECT_CLIENT_ID!);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set("state", state);
  const redirectUri = stripeRedirectUri(requestOrigin);
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export async function handleStripeOAuthCallback(url: URL) {
  const state = decodeStripeOAuthState(url.searchParams.get("state"));
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Stripe接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, state.storeId);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description = url.searchParams.get("error_description") ?? oauthError;
    await logStripeIntegration(supabase, resolved, "stripe_oauth_failed", "error", description, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "Stripe接続が完了しませんでした。もう一度お試しください。" };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await logStripeIntegration(supabase, resolved, "stripe_oauth_failed", "error", "Stripe接続コードがありません。", { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "Stripe接続情報を確認できませんでした。もう一度お試しください。" };
  }
  const envError = stripeOAuthEnvError(url.origin);
  if (envError) {
    await logStripeIntegration(supabase, resolved, "stripe_oauth_failed", "error", envError, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: envError };
  }

  const response = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_secret: process.env.STRIPE_SECRET_KEY!
    }),
    cache: "no-store"
  });
  const token = await response.json() as StripeTokenResponse;
  if (!response.ok || token.error || !token.stripe_user_id) {
    const message = token.error_description ?? token.error ?? "Stripe接続情報の取得に失敗しました。";
    await logStripeIntegration(supabase, resolved, "stripe_oauth_failed", "error", message, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "Stripe接続情報の取得に失敗しました。時間をおいて再度お試しください。" };
  }

  const account = await fetchStripeAccount(token.stripe_user_id);
  const accessToken = encryptToken(token.access_token);
  const refreshToken = encryptToken(token.refresh_token);
  const accountName =
    account?.business_profile?.name ??
    account?.settings?.dashboard?.display_name ??
    account?.email ??
    token.stripe_user_id;

  await supabase.from("store_payment_integrations").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "stripe",
    connection_type: "stripe_connect",
    status: "connected",
    external_account_id: token.stripe_user_id,
    account_name: accountName,
    charges_enabled: Boolean(account?.charges_enabled),
    payouts_enabled: Boolean(account?.payouts_enabled),
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : ["read_write"],
    access_token_encrypted: accessToken.encryptedValue,
    refresh_token_encrypted: refreshToken.encryptedValue,
    config: {
      dashboard_url: `https://dashboard.stripe.com/connect/accounts/${token.stripe_user_id}`,
      manual_mode: false,
      connect_mode: "oauth",
      direct_charges: true
    },
    metadata: {
      operation_mode: "stripe_connect_direct_charge",
      platform_billing_separated: true,
      livemode: Boolean(token.livemode),
      token_type: token.token_type ?? null,
      stripe_publishable_key_returned: Boolean(token.stripe_publishable_key),
      access_token_storage: accessToken.storageMode,
      refresh_token_storage: refreshToken.storageMode,
      account_country: account?.country ?? null,
      default_currency: account?.default_currency ?? null,
      details_submitted: Boolean(account?.details_submitted),
      connected_via: "stripe_oauth"
    },
    error_message: null,
    last_synced_at: new Date().toISOString(),
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider" });

  if (accessToken.storageMode === "not_stored_missing_encryption_key" || refreshToken.storageMode === "not_stored_missing_encryption_key") {
    await logStripeIntegration(
      supabase,
      resolved,
      "stripe_token_storage_warning",
      "warning",
      "暗号化キーが未設定のため、Stripe token本体は保存せず、接続アカウントIDのみ保存しました。",
      { account_id: token.stripe_user_id, nonce: state.nonce }
    );
  }

  await logStripeIntegration(supabase, resolved, "stripe_oauth_connected", "success", "Stripe接続を保存しました。", {
    account_id: token.stripe_user_id,
    account_name: accountName,
    charges_enabled: Boolean(account?.charges_enabled),
    payouts_enabled: Boolean(account?.payouts_enabled),
    livemode: Boolean(token.livemode),
    nonce: state.nonce
  });

  return { storeId: state.storeId, ok: true, message: "Stripe接続が完了しました。" };
}

export async function disconnectStripeConnect(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Stripe接続を更新する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const { error } = await supabase
    .from("store_payment_integrations")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        operation_mode: "stripe_connect_disconnected",
        platform_billing_separated: true
      }
    })
    .eq("store_id", resolved.storeId)
    .eq("provider", "stripe");
  if (error) throw new Error(`Stripe接続を解除できませんでした: ${error.message}`);
  await logStripeIntegration(supabase, resolved, "stripe_oauth_disconnected", "success", "Stripe接続を解除しました。");
}
