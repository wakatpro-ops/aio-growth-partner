import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type FreeeOAuthState = {
  storeId: string;
  nonce: string;
  createdAt: string;
  signature: string;
};

type FreeeTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  company_id?: number | string;
  external_cid?: string;
  error?: string;
  error_description?: string;
};

type FreeeCompany = {
  id?: number | string;
  name?: string;
  display_name?: string;
  role?: string;
};

type FreeeCompaniesResponse = {
  companies?: FreeeCompany[];
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

export function freeeRedirectUri(requestOrigin?: string) {
  if (process.env.FREEE_REDIRECT_URI) return process.env.FREEE_REDIRECT_URI;
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/api/freee/oauth/callback`;
}

function freeeEnvError(requestOrigin?: string) {
  const missing = [
    ["FREEE_CLIENT_ID", process.env.FREEE_CLIENT_ID],
    ["FREEE_CLIENT_SECRET", process.env.FREEE_CLIENT_SECRET]
  ].filter(([, value]) => !value).map(([key]) => key);
  const redirectUri = freeeRedirectUri(requestOrigin);
  if (!redirectUri) missing.push("APP_BASE_URL");
  if (missing.length === 0) return null;
  return `freee接続に必要な設定が未完了です: ${missing.join(", ")}。`;
}

export function isFreeeConnectEnvReady(requestOrigin?: string) {
  return freeeEnvError(requestOrigin) === null;
}

function stateSecret() {
  const secret = process.env.FREEE_CLIENT_SECRET;
  if (!secret) throw new Error("freee接続の検証に必要な設定が未完了です。");
  return secret;
}

function signStatePayload(storeId: string, nonce: string, createdAt: string) {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(`${storeId}.${nonce}.${createdAt}`)
    .digest("base64url");
}

function encodeFreeeOAuthState(storeId: string) {
  const nonce = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload: FreeeOAuthState = {
    storeId,
    nonce,
    createdAt,
    signature: signStatePayload(storeId, nonce, createdAt)
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeFreeeOAuthState(state: string | null) {
  if (!state) throw new Error("freee接続の確認情報がありません。もう一度接続してください。");
  let payload: FreeeOAuthState;
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as FreeeOAuthState;
  } catch {
    throw new Error("freee接続の確認情報を読み取れませんでした。もう一度接続してください。");
  }
  if (!payload.storeId || !payload.nonce || !payload.createdAt || !payload.signature) {
    throw new Error("freee接続の確認情報が不足しています。もう一度接続してください。");
  }
  const created = Date.parse(payload.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 15 * 60 * 1000) {
    throw new Error("freee接続の有効期限が切れました。もう一度接続してください。");
  }
  const expected = signStatePayload(payload.storeId, payload.nonce, payload.createdAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(payload.signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("freee接続の確認に失敗しました。もう一度接続してください。");
  }
  return { storeId: payload.storeId, nonce: payload.nonce, createdAt: payload.createdAt };
}

function encryptToken(value: string | null | undefined) {
  if (!value) return { encryptedValue: null, storageMode: "not_returned" };
  const secret = process.env.FREEE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
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

async function logFreeeIntegration(
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
    provider: "freee",
    action_type: actionType,
    status,
    message,
    metadata_json: metadata
  });
}

async function fetchFreeeCompanies(accessToken: string) {
  const response = await fetch("https://api.freee.co.jp/api/1/companies", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return await response.json() as FreeeCompaniesResponse;
}

export async function buildFreeeOAuthStartUrl(storeId: string, requestOrigin?: string) {
  const envError = freeeEnvError(requestOrigin);
  if (envError) throw new Error(envError);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const state = encodeFreeeOAuthState(storeId);
  await logFreeeIntegration(supabase, resolved, "freee_oauth_started", "ready", "freee接続を開始しました。");

  const url = new URL("https://accounts.secure.freee.co.jp/public_api/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.FREEE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", freeeRedirectUri(requestOrigin)!);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_company");
  return url.toString();
}

export async function handleFreeeOAuthCallback(url: URL) {
  const state = decodeFreeeOAuthState(url.searchParams.get("state"));
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, state.storeId);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description = url.searchParams.get("error_description") ?? oauthError;
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", description, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続が完了しませんでした。もう一度お試しください。" };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", "freee接続コードがありません。", { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続情報を確認できませんでした。もう一度お試しください。" };
  }
  const envError = freeeEnvError(url.origin);
  if (envError) {
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", envError, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: envError };
  }

  const response = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.FREEE_CLIENT_ID!,
      client_secret: process.env.FREEE_CLIENT_SECRET!,
      code,
      redirect_uri: freeeRedirectUri(url.origin)!
    }),
    cache: "no-store"
  });
  const token = await response.json() as FreeeTokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    const message = token.error_description ?? token.error ?? "freee接続情報の取得に失敗しました。";
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", message, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続情報の取得に失敗しました。時間をおいて再度お試しください。" };
  }

  const companies = await fetchFreeeCompanies(token.access_token);
  const selectedCompanyId = token.company_id ? String(token.company_id) : null;
  const selectedCompany = companies?.companies?.find((company) => String(company.id) === selectedCompanyId) ?? companies?.companies?.[0] ?? null;
  const companyId = selectedCompanyId ?? (selectedCompany?.id ? String(selectedCompany.id) : null);
  const officeName = selectedCompany?.display_name ?? selectedCompany?.name ?? (companyId ? `freee事業所 ${companyId}` : "freee事業所");
  const accessToken = encryptToken(token.access_token);
  const refreshToken = encryptToken(token.refresh_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

  await supabase.from("store_accounting_integrations").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "freee",
    status: "connected",
    external_company_id: companyId,
    office_name: officeName,
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : ["read", "write"],
    access_token_encrypted: accessToken.encryptedValue,
    refresh_token_encrypted: refreshToken.encryptedValue,
    token_expires_at: expiresAt,
    config: {
      export_template: "freee_csv",
      target_data: ["invoices", "payments", "sales_transactions"],
      connection_mode: "oauth",
      prompt: "select_company"
    },
    metadata: {
      operation_mode: "freee_oauth_accounting",
      token_type: token.token_type ?? null,
      external_cid: token.external_cid ?? null,
      access_token_storage: accessToken.storageMode,
      refresh_token_storage: refreshToken.storageMode,
      companies_returned: companies?.companies?.length ?? 0,
      connected_via: "freee_oauth"
    },
    error_message: null,
    last_synced_at: new Date().toISOString(),
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider" });

  if (accessToken.storageMode === "not_stored_missing_encryption_key" || refreshToken.storageMode === "not_stored_missing_encryption_key") {
    await logFreeeIntegration(
      supabase,
      resolved,
      "freee_token_storage_warning",
      "warning",
      "暗号化キーが未設定のため、freee token本体は保存せず、事業所情報のみ保存しました。",
      { company_id: companyId, nonce: state.nonce }
    );
  }

  await logFreeeIntegration(supabase, resolved, "freee_oauth_connected", "success", "freee接続を保存しました。", {
    company_id: companyId,
    office_name: officeName,
    nonce: state.nonce
  });

  return { storeId: state.storeId, ok: true, message: "freee接続が完了しました。" };
}

export async function disconnectFreeeConnect(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を更新する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const { error } = await supabase
    .from("store_accounting_integrations")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        operation_mode: "freee_oauth_disconnected"
      }
    })
    .eq("store_id", resolved.storeId)
    .eq("provider", "freee");
  if (error) throw new Error(`freee接続を解除できませんでした: ${error.message}`);
  await logFreeeIntegration(supabase, resolved, "freee_oauth_disconnected", "success", "freee接続を解除しました。");
}
