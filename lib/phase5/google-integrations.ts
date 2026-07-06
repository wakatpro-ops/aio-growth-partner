import "server-only";
import crypto from "node:crypto";
import { buildGooglePreparationPayload, googlePublishTargets, type GooglePublishTarget } from "@/lib/phase5/google-adapters";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type {
  ExternalIntegrationLog,
  ExternalPublishJob,
  GoogleBusinessProfileSetting,
  GoogleCalendarSetting,
  GoogleGmailSetting,
  GoogleOAuthConnection,
  GrowthAction
} from "@/types/phase5";

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
} as const;

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type GoogleOAuthState = {
  storeId: string;
  nonce: string;
  createdAt: string;
  signature: string;
};
type GoogleIdentity = {
  email: string | null;
  providerUserId: string | null;
  name: string | null;
};
type GoogleExecutionTarget = "gmail" | "google_calendar";
type GoogleBusinessAccountCandidate = {
  name: string;
  accountName: string | null;
  type: string | null;
  role: string | null;
};
type GoogleBusinessLocationCandidate = {
  accountName: string;
  name: string;
  title: string | null;
  address: string | null;
  storeCode: string | null;
  metadata: Record<string, unknown>;
};

export type GoogleIntegrationState = {
  connection: GoogleOAuthConnection | null;
  businessProfile: GoogleBusinessProfileSetting | null;
  gmail: GoogleGmailSetting | null;
  calendar: GoogleCalendarSetting | null;
  jobs: ExternalPublishJob[];
  logs: ExternalIntegrationLog[];
  scopes: string[];
  envReady: boolean;
};

function persistenceFor(store: Store) {
  const demo = demoPersistence[store.id as keyof typeof demoPersistence];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id
  };
}

async function ensureGooglePersistence(supabase: SupabaseClient, store: Store) {
  const resolved = persistenceFor(store);
  if (!demoPersistence[store.id as keyof typeof demoPersistence]) return resolved;

  await supabase.from("organizations").upsert({
    id: resolved.organizationId,
    name: "AIOデモ組織",
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: resolved.storeId,
    organization_id: resolved.organizationId,
    industry_type_key: store.industry_type_key,
    name: store.name,
    address: store.address,
    phone: store.phone,
    status: "active",
    feature_flags: {
      ...(store.feature_flags ?? {}),
      google_integrations: true,
      google_oauth_connection: true,
      google_business_profile_integration: true,
      gmail_draft_integration: true,
      google_calendar_integration: true,
      external_publish_jobs: true
    },
    profile_data: store.profile_data ?? {},
    updated_at: new Date().toISOString()
  });

  return resolved;
}

export function googleScopes() {
  const configured = process.env.GOOGLE_OAUTH_SCOPES;
  if (configured) {
    return configured.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/calendar.events"
  ];
}

function hasGoogleOAuthEnv() {
  return missingGoogleOAuthEnv().length === 0;
}

function missingGoogleOAuthEnv() {
  return [
    ["GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET],
    ["GOOGLE_REDIRECT_URI", process.env.GOOGLE_REDIRECT_URI]
  ].filter(([, value]) => !value).map(([key]) => key);
}

function googleOAuthEnvError() {
  const missing = missingGoogleOAuthEnv();
  if (missing.length === 0) return null;
  return `Google OAuth環境変数が未設定です: ${missing.join(", ")}。VercelのEnvironment Variablesに追加してください。`;
}

function stateSecret() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("OAuth state検証用の秘密情報が未設定です。GOOGLE_CLIENT_SECRET を設定してください。");
  return secret;
}

function signStatePayload(storeId: string, nonce: string, createdAt: string) {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(`${storeId}.${nonce}.${createdAt}`)
    .digest("base64url");
}

function encodeState(storeId: string) {
  const nonce = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = {
    storeId,
    nonce,
    createdAt,
    signature: signStatePayload(storeId, nonce, createdAt)
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeGoogleOAuthState(state: string | null) {
  if (!state) throw new Error("OAuth stateがありません。");
  let payload: GoogleOAuthState;
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as GoogleOAuthState;
  } catch {
    throw new Error("OAuth stateを読み取れませんでした。もう一度接続してください。");
  }
  if (!payload.storeId || !payload.nonce || !payload.createdAt || !payload.signature) {
    throw new Error("OAuth stateの内容を確認できませんでした。もう一度接続してください。");
  }
  const created = Date.parse(payload.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 15 * 60 * 1000) {
    throw new Error("OAuth stateの有効期限が切れました。もう一度接続してください。");
  }
  const expected = signStatePayload(payload.storeId, payload.nonce, payload.createdAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(payload.signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("OAuth stateの検証に失敗しました。もう一度接続してください。");
  }
  return { storeId: payload.storeId, nonce: payload.nonce, createdAt: payload.createdAt };
}

function encryptToken(value: string) {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) return null;
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptToken(value: string | null | undefined) {
  if (!value) return null;
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY が未設定のため、保存済みGoogle tokenを復号できません。");
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Google tokenの保存形式を確認できませんでした。再接続してください。");
  }
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}

function protectGoogleToken(value: string | null | undefined) {
  if (!value) return { encryptedValue: null, storageMode: "not_returned" };
  const encrypted = encryptToken(value);
  if (encrypted) return { encryptedValue: encrypted, storageMode: "encrypted" };
  return { encryptedValue: null, storageMode: "not_stored_missing_encryption_key" };
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJwtIdentity(idToken: string | undefined): GoogleIdentity {
  if (!idToken) return { email: null, providerUserId: null, name: null };
  const [, payload] = idToken.split(".");
  if (!payload) return { email: null, providerUserId: null, name: null };
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; sub?: string; name?: string };
    return { email: decoded.email ?? null, providerUserId: decoded.sub ?? null, name: decoded.name ?? null };
  } catch {
    return { email: null, providerUserId: null, name: null };
  }
}

async function fetchGoogleIdentity(accessToken: string | undefined, idToken: string | undefined): Promise<GoogleIdentity> {
  const fromJwt = decodeJwtIdentity(idToken);
  if (fromJwt.email && fromJwt.providerUserId) return fromJwt;
  if (!accessToken) return fromJwt;
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return fromJwt;
    const data = await response.json() as { email?: string; sub?: string; name?: string };
    return {
      email: data.email ?? fromJwt.email,
      providerUserId: data.sub ?? fromJwt.providerUserId,
      name: data.name ?? fromJwt.name
    };
  } catch {
    return fromJwt;
  }
}

async function logIntegration(
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
    provider: "google",
    action_type: actionType,
    status,
    message,
    metadata_json: metadata
  });
}

async function latestConnectedGoogleAccount(supabase: SupabaseClient, storeId: string) {
  const { data, error } = await supabase
    .from("google_oauth_connections")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Google接続情報を確認できませんでした: ${error.message}`);
  return data as GoogleOAuthConnection | null;
}

async function getUsableGoogleAccessToken(
  supabase: SupabaseClient,
  connection: GoogleOAuthConnection,
  resolved: { organizationId: string; storeId: string }
) {
  const accessToken = decryptToken(connection.access_token_encrypted);
  const refreshToken = decryptToken(connection.refresh_token_encrypted);
  const expiresAt = connection.expires_at ? Date.parse(connection.expires_at) : 0;
  if (accessToken && expiresAt > Date.now() + 5 * 60 * 1000) return accessToken;
  if (!refreshToken) {
    await logIntegration(supabase, resolved, "google_token_refresh_failed", "error", "refresh tokenが保存されていないためGoogle APIを実行できません。", { connection_id: connection.id });
    throw new Error("Google refresh tokenが保存されていません。Google連携画面から再接続してください。");
  }
  const envError = googleOAuthEnvError();
  if (envError) throw new Error(envError);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const token = await response.json() as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !token.access_token) {
    const message = token.error_description ?? token.error ?? "Google access tokenの更新に失敗しました。";
    await logIntegration(supabase, resolved, "google_token_refresh_failed", "error", message, { connection_id: connection.id, token_error: token.error });
    throw new Error(message);
  }
  const protectedAccessToken = protectGoogleToken(token.access_token);
  const nextExpiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await supabase
    .from("google_oauth_connections")
    .update({
      access_token_encrypted: protectedAccessToken.encryptedValue,
      expires_at: nextExpiresAt,
      scopes: token.scope ? token.scope.split(/\s+/) : connection.scopes,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(connection.metadata ?? {}),
        access_token_storage: protectedAccessToken.storageMode,
        refreshed_at: new Date().toISOString()
      }
    })
    .eq("id", connection.id);
  await logIntegration(supabase, resolved, "google_token_refreshed", "success", "Google access tokenを更新しました。", { connection_id: connection.id, expires_at: nextExpiresAt });
  return token.access_token;
}

export async function getGoogleIntegrationState(storeId: string): Promise<GoogleIntegrationState> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { connection: null, businessProfile: null, gmail: null, calendar: null, jobs: [], logs: [], scopes: googleScopes(), envReady: hasGoogleOAuthEnv() };
  }
  const resolved = await ensureGooglePersistence(supabase, store);
  const [connection, businessProfile, gmail, calendar, jobs, logs] = await Promise.all([
    supabase.from("google_oauth_connections").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("google_business_profiles").select("*").eq("store_id", resolved.storeId).maybeSingle(),
    supabase.from("google_gmail_settings").select("*").eq("store_id", resolved.storeId).maybeSingle(),
    supabase.from("google_calendar_settings").select("*").eq("store_id", resolved.storeId).maybeSingle(),
    supabase.from("external_publish_jobs").select("*").eq("store_id", resolved.storeId).eq("provider", "google").order("created_at", { ascending: false }).limit(10),
    supabase.from("external_integration_logs").select("*").eq("store_id", resolved.storeId).eq("provider", "google").order("created_at", { ascending: false }).limit(10)
  ]);

  return {
    connection: connection.data as GoogleOAuthConnection | null,
    businessProfile: businessProfile.data as GoogleBusinessProfileSetting | null,
    gmail: gmail.data as GoogleGmailSetting | null,
    calendar: calendar.data as GoogleCalendarSetting | null,
    jobs: (jobs.data ?? []) as ExternalPublishJob[],
    logs: (logs.data ?? []) as ExternalIntegrationLog[],
    scopes: googleScopes(),
    envReady: hasGoogleOAuthEnv()
  };
}

export async function buildGoogleOAuthStartUrl(storeId: string) {
  const envError = googleOAuthEnvError();
  if (envError) throw new Error(envError);
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  const state = encodeState(storeId);
  if (supabase) {
    const resolved = await ensureGooglePersistence(supabase, store);
    const decodedState = decodeGoogleOAuthState(state);
    await logIntegration(supabase, resolved, "google_oauth_started", "ready", "Google OAuth接続を開始しました。", {
      store_id: store.id,
      nonce: decodedState.nonce,
      scopes: googleScopes()
    });
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", googleScopes().join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function handleGoogleOAuthCallback(url: URL) {
  const state = decodeGoogleOAuthState(url.searchParams.get("state"));
  const store = await getStore(state.storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    await logIntegration(supabase, resolved, "google_oauth_failed", "error", `Google OAuthでエラーが返りました: ${oauthError}`, { nonce: state.nonce });
    return { storeId: store.id, ok: false, message: oauthError };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await logIntegration(supabase, resolved, "google_oauth_failed", "error", "Google OAuth codeがありません。", { nonce: state.nonce });
    return { storeId: store.id, ok: false, message: "Google OAuth codeがありません。もう一度接続してください。" };
  }
  const envError = googleOAuthEnvError();
  if (envError) {
    await logIntegration(supabase, resolved, "google_oauth_failed", "error", envError, { nonce: state.nonce });
    return { storeId: store.id, ok: false, message: envError };
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code"
    })
  });
  const token = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    const message = token.error_description ?? token.error ?? "Googleトークン取得に失敗しました。";
    await logIntegration(supabase, resolved, "google_oauth_failed", "error", message, { token_error: token.error, nonce: state.nonce });
    return { storeId: store.id, ok: false, message };
  }

  const identity = await fetchGoogleIdentity(token.access_token, token.id_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  const accessToken = protectGoogleToken(token.access_token);
  const refreshToken = protectGoogleToken(token.refresh_token);
  const tokenStorageWarning = [accessToken, refreshToken].some((item) => item.storageMode === "not_stored_missing_encryption_key");
  await supabase.from("google_oauth_connections").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider_user_id: identity.providerUserId,
    email: identity.email,
    access_token_encrypted: accessToken.encryptedValue,
    refresh_token_encrypted: refreshToken.encryptedValue,
    expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(/\s+/) : googleScopes(),
    status: "connected",
    connected_at: new Date().toISOString(),
    metadata: {
      token_type: tokenStorageWarning ? "not_stored_missing_encryption_key" : "encrypted",
      access_token_storage: accessToken.storageMode,
      refresh_token_storage: refreshToken.storageMode,
      google_name: identity.name,
      nonce: state.nonce,
      phase: "5-C-2"
    }
  });
  if (tokenStorageWarning) {
    await logIntegration(
      supabase,
      resolved,
      "google_token_storage_warning",
      "warning",
      "GOOGLE_TOKEN_ENCRYPTION_KEY が未設定のため、Google token本体は保存していません。接続情報のみ保存しました。",
      { email: identity.email, nonce: state.nonce }
    );
  }
  await logIntegration(supabase, resolved, "google_oauth_connected", "success", "Google OAuth接続を保存しました。", {
    email: identity.email,
    name: identity.name,
    expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(/\s+/) : googleScopes(),
    nonce: state.nonce
  });
  return { storeId: store.id, ok: true, message: "Google接続が完了しました。" };
}

export async function disconnectGoogle(storeId: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const { error } = await supabase
    .from("google_oauth_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("store_id", resolved.storeId)
    .in("status", ["connected", "expired", "error"]);
  if (error) throw new Error(`Google接続を解除できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "disconnect", "success", "Google接続を解除しました。");
}

export async function upsertGoogleBusinessProfile(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const { data: current } = await supabase
    .from("google_business_profiles")
    .select("metadata")
    .eq("store_id", resolved.storeId)
    .maybeSingle();
  const currentMetadata = asRecord(current?.metadata);
  const { error } = await supabase.from("google_business_profiles").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    google_account_id: String(formData.get("google_account_id") ?? "") || null,
    location_id: String(formData.get("location_id") ?? "") || null,
    location_name: String(formData.get("location_name") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
    status: String(formData.get("api_status") ?? "") || "api_review_pending",
    last_synced_at: new Date().toISOString(),
    metadata: {
      ...currentMetadata,
      memo: String(formData.get("memo") ?? ""),
      api_status: String(formData.get("api_status") ?? "") || "api_review_pending",
      basic_api_access_case_id: String(formData.get("basic_api_access_case_id") ?? "") || null,
      basic_api_access_submitted_at: String(formData.get("basic_api_access_submitted_at") ?? "") || null,
      basic_api_access_expected_review: String(formData.get("basic_api_access_expected_review") ?? "") || null,
      manual_posting_mode: String(formData.get("manual_posting_mode") ?? "enabled") === "enabled",
      review_note: String(formData.get("review_note") ?? "") || null
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`Googleビジネスプロフィール設定を保存できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "business_profile_setting", "success", "Googleビジネスプロフィール設定を保存しました。");
}

function postalAddressText(value: unknown) {
  const address = asRecord(value);
  const lines = Array.isArray(address.addressLines) ? address.addressLines.filter((line): line is string => typeof line === "string") : [];
  return [
    typeof address.postalCode === "string" ? address.postalCode : null,
    typeof address.administrativeArea === "string" ? address.administrativeArea : null,
    typeof address.locality === "string" ? address.locality : null,
    ...lines
  ].filter(Boolean).join(" ");
}

function accountCandidate(raw: Record<string, unknown>): GoogleBusinessAccountCandidate {
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    accountName: typeof raw.accountName === "string" ? raw.accountName : null,
    type: typeof raw.type === "string" ? raw.type : null,
    role: typeof raw.role === "string" ? raw.role : null
  };
}

function locationCandidate(accountName: string, raw: Record<string, unknown>): GoogleBusinessLocationCandidate {
  return {
    accountName,
    name: typeof raw.name === "string" ? raw.name : "",
    title: typeof raw.title === "string" ? raw.title : null,
    address: postalAddressText(raw.storefrontAddress) || null,
    storeCode: typeof raw.storeCode === "string" ? raw.storeCode : null,
    metadata: asRecord(raw.metadata)
  };
}

export async function syncGoogleBusinessProfileCandidates(storeId: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const connection = await latestConnectedGoogleAccount(supabase, resolved.storeId);
  if (!connection) throw new Error("Googleアカウントが接続されていません。Google連携画面から接続してください。");
  const accessToken = await getUsableGoogleAccessToken(supabase, connection, resolved);

  const accountsResponse = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const accountsResult = await accountsResponse.json() as Record<string, unknown>;
  if (!accountsResponse.ok) {
    const message = googleBusinessProfileApiErrorMessage(accountsResult, "Googleビジネスプロフィールのアカウント一覧を取得できませんでした。");
    await logIntegration(supabase, resolved, "gbp_accounts_sync_failed", "error", message, { response: accountsResult });
    throw new Error(message);
  }

  const accounts = Array.isArray(accountsResult.accounts)
    ? accountsResult.accounts.map((item) => accountCandidate(asRecord(item))).filter((item) => item.name)
    : [];
  const locations: GoogleBusinessLocationCandidate[] = [];

  for (const account of accounts) {
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("readMask", "name,title,storeCode,storefrontAddress,metadata");
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) {
      await logIntegration(
        supabase,
        resolved,
        "gbp_locations_sync_warning",
        "warning",
        googleBusinessProfileApiErrorMessage(result, `${account.name} のロケーション一覧を取得できませんでした。`),
        { account: account.name, response: result }
      );
      continue;
    }
    if (Array.isArray(result.locations)) {
      locations.push(...result.locations.map((item) => locationCandidate(account.name, asRecord(item))).filter((item) => item.name));
    }
  }

  const { data: current } = await supabase
    .from("google_business_profiles")
    .select("metadata")
    .eq("store_id", resolved.storeId)
    .maybeSingle();
  const currentMetadata = asRecord(current?.metadata);
  const selectedLocation = locations[0] ?? null;
  const { error } = await supabase.from("google_business_profiles").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    google_account_id: selectedLocation?.accountName ?? accounts[0]?.name ?? null,
    location_id: selectedLocation?.name ?? null,
    location_name: selectedLocation?.title ?? null,
    address: selectedLocation?.address ?? null,
    status: locations.length ? "ready" : "needs_location",
    last_synced_at: new Date().toISOString(),
    metadata: {
      ...currentMetadata,
      accounts,
      locations,
      last_sync_status: "success",
      posting_capabilities: {
        supported_post_types: ["STANDARD", "EVENT", "OFFER"],
        supported_call_to_actions: ["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"],
        product_posts_supported: false,
        requires_manual_review_before_publish: true
      },
      sync_note: locations.length ? "Google Business Profileの候補ロケーションを取得しました。" : "アカウントは取得できましたが、投稿対象ロケーションは見つかりませんでした。"
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`Googleビジネスプロフィール候補を保存できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "gbp_accounts_locations_synced", "success", "Googleビジネスプロフィールのアカウント・ロケーション候補を取得しました。", {
    accounts_count: accounts.length,
    locations_count: locations.length
  });
  return { accountsCount: accounts.length, locationsCount: locations.length };
}

export async function upsertGoogleGmail(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const { error } = await supabase.from("google_gmail_settings").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    email: String(formData.get("email") ?? "") || null,
    sender_name: String(formData.get("sender_name") ?? "") || null,
    signature: String(formData.get("signature") ?? "") || null,
    status: "ready",
    metadata: {},
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`Gmail設定を保存できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "gmail_setting", "success", "Gmail下書き設定を保存しました。");
}

export async function upsertGoogleCalendar(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const { error } = await supabase.from("google_calendar_settings").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    calendar_id: String(formData.get("calendar_id") ?? "") || null,
    calendar_name: String(formData.get("calendar_name") ?? "") || null,
    timezone: String(formData.get("timezone") ?? "Asia/Tokyo") || "Asia/Tokyo",
    status: "ready",
    metadata: {},
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`Googleカレンダー設定を保存できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "calendar_setting", "success", "Googleカレンダー設定を保存しました。");
}

export async function prepareGooglePublishJob(storeId: string, actionId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const target = String(formData.get("target")) as GooglePublishTarget;
  const targetConfig = googlePublishTargets.find((item) => item.key === target);
  if (!targetConfig) throw new Error("送信先を確認できませんでした。");
  const scheduledAt = String(formData.get("scheduled_at") ?? "") || null;
  const { data: action, error: actionError } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*)")
    .eq("store_id", resolved.storeId)
    .eq("id", actionId)
    .maybeSingle();
  if (actionError) throw new Error(`集客アクションを確認できませんでした: ${actionError.message}`);
  if (!action) throw new Error("集客アクションが見つかりませんでした。");

  const payload = buildGooglePreparationPayload(target, action as GrowthAction, scheduledAt);
  const { data: job, error } = await supabase.from("external_publish_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    channel: target,
    provider: "google",
    target_id: String(formData.get("target_id") ?? "") || null,
    status: "ready",
    scheduled_at: scheduledAt,
    payload_json: {
      ...payload,
      note: String(formData.get("note") ?? ""),
      external_provider: targetConfig.provider
    },
    response_json: {}
  }).select("id").single();
  if (error) throw new Error(`送信準備を保存できませんでした: ${error.message}`);

  await supabase
    .from("growth_actions")
    .update({ external_provider: targetConfig.provider, external_status: "ready", scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq("store_id", resolved.storeId)
    .eq("id", actionId);
  await logIntegration(supabase, resolved, "publish_prepare", "success", "Google向け送信準備を保存しました。", { job_id: job?.id, target });
}

function firstDraftText(action: GrowthAction) {
  const draft = action.drafts?.[0];
  if (!draft) return action.summary;
  return [draft.body, draft.hashtags?.join(" "), draft.call_to_action].filter(Boolean).join("\n\n");
}

function firstDraftTitle(action: GrowthAction) {
  return action.drafts?.[0]?.title ?? action.title;
}

function rfc822Message({
  to,
  fromName,
  subject,
  body
}: {
  to: string;
  fromName: string;
  subject: string;
  body: string;
}) {
  return [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    `From: ${fromName}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
}

function scheduledDateTime(value: string | null, fallbackDays = 1) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const date = new Date();
  date.setDate(date.getDate() + fallbackDays);
  date.setHours(10, 0, 0, 0);
  return date;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function googleJobExternalId(job: { response_json: Record<string, unknown> }) {
  const response = asRecord(job.response_json);
  const message = asRecord(response.message);
  if (typeof response.id === "string") return response.id;
  if (typeof response.name === "string") return response.name;
  if (typeof message.id === "string") return message.id;
  return null;
}

export function googleJobExternalLink(job: { channel: string; response_json: Record<string, unknown> }) {
  const response = asRecord(job.response_json);
  if (typeof response.htmlLink === "string") return response.htmlLink;
  if (job.channel === "gmail") return "https://mail.google.com/mail/u/0/#drafts";
  return null;
}

export function googleJobSummary(job: { channel: string; payload_json: Record<string, unknown>; response_json: Record<string, unknown>; scheduled_at: string | null; target_id: string | null }) {
  const payload = asRecord(job.payload_json);
  const response = asRecord(job.response_json);
  if (job.channel === "gmail") {
    return {
      title: typeof payload.subject === "string" ? payload.subject : "Gmail下書き",
      target: typeof payload.to === "string" ? payload.to : job.target_id,
      scheduledAt: null,
      externalId: googleJobExternalId(job),
      externalLink: googleJobExternalLink(job)
    };
  }
  const event = asRecord(payload.event);
  return {
    title: typeof event.summary === "string" ? event.summary : typeof response.summary === "string" ? response.summary : "Googleカレンダー予定",
    target: typeof payload.calendar_id === "string" ? payload.calendar_id : job.target_id,
    scheduledAt: job.scheduled_at,
    externalId: googleJobExternalId(job),
    externalLink: googleJobExternalLink(job)
  };
}

function friendlyGoogleApiError(message: string) {
  if (message.includes("has not been used") || message.includes("is disabled")) {
    if (message.includes("gmail.googleapis.com")) return "Google CloudでGmail APIが有効になっていません。Google Cloud Consoleで Gmail API を有効化し、数分待ってからもう一度実行してください。";
    if (message.includes("calendar-json.googleapis.com")) return "Google CloudでGoogle Calendar APIが有効になっていません。Google Cloud Consoleで Google Calendar API を有効化し、数分待ってからもう一度実行してください。";
    if (message.includes("mybusiness") || message.includes("business")) return "Google CloudでGoogle Business Profile APIが有効になっていない、または利用権限がありません。API有効化とGBP APIアクセス権限を確認してください。";
    return "Google Cloudで必要なAPIが有効になっていません。Google Cloud Consoleで対象APIを有効化してからもう一度実行してください。";
  }
  if (message.includes("insufficient") || message.includes("Insufficient Permission") || message.includes("Request had insufficient authentication scopes")) {
    return "Google連携の権限が不足しています。Google連携を一度解除し、必要な権限を含めて再接続してください。";
  }
  if (message.includes("invalid_grant") || message.includes("invalid credentials") || message.includes("Unauthorized") || message.includes("401")) {
    return "Google接続の有効期限が切れている可能性があります。Google連携画面から再接続してください。";
  }
  if (message.includes("quota") || message.includes("429")) {
    return "Google APIの利用上限に達した可能性があります。少し時間をおいてからもう一度実行してください。";
  }
  if (message.includes("PERMISSION_DENIED") || message.includes("permission") || message.includes("Permission")) {
    return "Googleビジネスプロフィールへの権限が不足しています。接続したGoogleアカウントが対象店舗の管理者になっているか確認してください。";
  }
  if (message.includes("not found") || message.includes("Not Found") || message.includes("404")) {
    return "指定したGoogle側の保存先が見つかりません。メールアドレス、カレンダーID、ロケーションIDを確認してください。";
  }
  return message || "Google連携の実行に失敗しました。設定を確認してからもう一度実行してください。";
}

function googleBusinessProfileApiErrorMessage(result: Record<string, unknown>, fallback: string) {
  const error = asRecord(result.error);
  const rawMessage = typeof error.message === "string" ? error.message : fallback;
  const message = rawMessage.toLowerCase();
  if (
    message.includes("quota") ||
    message.includes("429") ||
    message.includes("resource_exhausted") ||
    message.includes("permission_denied") ||
    message.includes("access") ||
    message.includes("not been used") ||
    message.includes("disabled")
  ) {
    return "GoogleビジネスプロフィールAPIはGoogle側のBasic API Access / quota付与、または対象ビジネスプロフィールのオーナー・管理者権限が必要です。Gmailやカレンダー接続が成功していても、GBP候補取得だけ失敗する場合はアプリ不具合ではなくGoogle承認待ちとして扱い、承認完了までは手動投稿支援モードを使ってください。";
  }
  return friendlyGoogleApiError(rawMessage);
}

async function createExternalPublishJob(
  supabase: SupabaseClient,
  resolved: { organizationId: string; storeId: string },
  actionId: string,
  target: GoogleExecutionTarget,
  targetId: string | null,
  scheduledAt: string | null,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase.from("external_publish_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    channel: target,
    provider: "google",
    target_id: targetId,
    status: "processing",
    scheduled_at: scheduledAt,
    payload_json: payload,
    response_json: {}
  }).select("id").single();
  if (error) throw new Error(`外部連携ジョブを保存できませんでした: ${error.message}`);
  return data?.id as string;
}

async function findSuccessfulExternalJob(
  supabase: SupabaseClient,
  resolved: { storeId: string },
  actionId: string,
  target: GoogleExecutionTarget,
  targetId: string | null,
  scheduledAt: string | null
) {
  let query = supabase
    .from("external_publish_jobs")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("provider", "google")
    .eq("growth_action_id", actionId)
    .eq("channel", target)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);
  if (targetId) query = query.eq("target_id", targetId);
  if (target === "google_calendar" && scheduledAt) query = query.eq("scheduled_at", scheduledAt);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`既存の連携履歴を確認できませんでした: ${error.message}`);
  return data as ExternalPublishJob | null;
}

async function loadGoogleActionForExecution(supabase: SupabaseClient, storeId: string, actionId: string) {
  const { data, error } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*)")
    .eq("store_id", storeId)
    .eq("id", actionId)
    .maybeSingle();
  if (error) throw new Error(`集客アクションを確認できませんでした: ${error.message}`);
  if (!data) throw new Error("集客アクションが見つかりませんでした。");
  return data as GrowthAction;
}

type PreparedGmailDraft = {
  targetEmail: string;
  senderName: string;
  subject: string;
  body: string;
  targetId: string;
  scheduledAt: null;
  payload: Record<string, unknown>;
};

async function prepareGmailDraftExecution(
  supabase: SupabaseClient,
  resolved: { organizationId: string; storeId: string },
  action: GrowthAction,
  formData: FormData
) {
  const { data: gmailSetting } = await supabase
    .from("google_gmail_settings")
    .select("*")
    .eq("store_id", resolved.storeId)
    .maybeSingle();
  const targetEmail = String(formData.get("recipient_email") ?? formData.get("target_id") ?? "") || (gmailSetting as GoogleGmailSetting | null)?.email;
  if (!targetEmail) throw new Error("Gmail下書きの宛先メールアドレスを入力してください。");
  const senderName = (gmailSetting as GoogleGmailSetting | null)?.sender_name ?? "AIO Growth Partner";
  const signature = (gmailSetting as GoogleGmailSetting | null)?.signature;
  const subject = String(formData.get("subject") ?? "") || firstDraftTitle(action);
  const body = [firstDraftText(action), signature].filter(Boolean).join("\n\n");
  return {
    targetEmail,
    senderName,
    subject,
    body,
    targetId: targetEmail,
    scheduledAt: null,
    payload: { subject, to: targetEmail, body_preview: body.slice(0, 500) }
  };
}

async function executeGmailDraft(accessToken: string, prepared: PreparedGmailDraft) {
  const { targetEmail, senderName, subject, body } = prepared;
  const raw = base64Url(rfc822Message({ to: targetEmail, fromName: senderName, subject, body }));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ message: { raw } })
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof result.error === "object" && result.error && "message" in result.error ? String((result.error as { message?: string }).message) : "Gmail下書き作成に失敗しました。";
    throw new Error(friendlyGoogleApiError(message));
  }
  return {
    targetId: prepared.targetId,
    scheduledAt: prepared.scheduledAt,
    payload: prepared.payload,
    response: result
  };
}

type PreparedCalendarEvent = {
  calendarId: string;
  scheduledAt: string;
  payload: Record<string, unknown>;
  event: {
    summary: string;
    description: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  };
};

async function prepareCalendarEventExecution(
  supabase: SupabaseClient,
  resolved: { organizationId: string; storeId: string },
  action: GrowthAction,
  formData: FormData
) {
  const { data: calendarSetting } = await supabase
    .from("google_calendar_settings")
    .select("*")
    .eq("store_id", resolved.storeId)
    .maybeSingle();
  const calendarId = String(formData.get("calendar_id") ?? formData.get("target_id") ?? "") || (calendarSetting as GoogleCalendarSetting | null)?.calendar_id || "primary";
  const timezone = (calendarSetting as GoogleCalendarSetting | null)?.timezone || "Asia/Tokyo";
  const start = scheduledDateTime(String(formData.get("scheduled_at") ?? action.scheduled_at ?? "") || null);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const event = {
    summary: String(formData.get("event_title") ?? "") || firstDraftTitle(action),
    description: firstDraftText(action),
    start: { dateTime: start.toISOString(), timeZone: timezone },
    end: { dateTime: end.toISOString(), timeZone: timezone }
  };
  return {
    calendarId,
    scheduledAt: start.toISOString(),
    event,
    payload: { calendar_id: calendarId, event, timezone }
  };
}

async function executeCalendarEvent(accessToken: string, prepared: PreparedCalendarEvent) {
  const { calendarId, event } = prepared;
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(event)
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof result.error === "object" && result.error && "message" in result.error ? String((result.error as { message?: string }).message) : "Googleカレンダー予定作成に失敗しました。";
    throw new Error(friendlyGoogleApiError(message));
  }
  return {
    targetId: calendarId,
    scheduledAt: prepared.scheduledAt,
    payload: prepared.payload,
    response: result
  };
}

export async function executeGoogleIntegration(storeId: string, actionId: string, target: GoogleExecutionTarget, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const connection = await latestConnectedGoogleAccount(supabase, resolved.storeId);
  if (!connection) throw new Error("Googleアカウントが接続されていません。Google連携画面から接続してください。");
  const action = await loadGoogleActionForExecution(supabase, resolved.storeId, actionId);
  const preparedGmail = target === "gmail" ? await prepareGmailDraftExecution(supabase, resolved, action, formData) : null;
  const preparedCalendar = target === "google_calendar" ? await prepareCalendarEventExecution(supabase, resolved, action, formData) : null;
  const targetId = preparedGmail?.targetId ?? preparedCalendar?.calendarId ?? null;
  const targetScheduledAt = preparedCalendar?.scheduledAt ?? null;
  const attemptedPayload = preparedGmail?.payload ?? preparedCalendar?.payload ?? { target };
  const forceDuplicate = String(formData.get("force_duplicate") ?? "") === "1";
  if (!forceDuplicate) {
    const existing = await findSuccessfulExternalJob(
      supabase,
      resolved,
      actionId,
      target,
      targetId,
      targetScheduledAt
    );
    if (existing) {
      const summary = googleJobSummary(existing);
      const externalId = summary.externalId ? ` 外部ID: ${summary.externalId}` : "";
      throw new Error(`${target === "gmail" ? "このGmail下書き" : "このGoogleカレンダー予定"}はすでに作成済みです。再作成したい場合は「同じ内容でも再作成する」にチェックしてください。${externalId}`);
    }
  }
  const accessToken = await getUsableGoogleAccessToken(supabase, connection, resolved);
  const startedAt = new Date().toISOString();
  let jobId: string | null = null;

  try {
    const result = preparedGmail
      ? await executeGmailDraft(accessToken, preparedGmail)
      : await executeCalendarEvent(accessToken, preparedCalendar as PreparedCalendarEvent);
    const scheduledAt = target === "google_calendar" ? result.scheduledAt ?? startedAt : null;
    jobId = await createExternalPublishJob(supabase, resolved, actionId, target, result.targetId, scheduledAt, result.payload);
    await supabase
      .from("external_publish_jobs")
      .update({
        status: "success",
        sent_at: new Date().toISOString(),
        response_json: result.response,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);
    await supabase
      .from("growth_actions")
      .update({
        external_provider: target,
        external_status: "success",
        external_post_id: typeof result.response.id === "string" ? result.response.id : null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("store_id", resolved.storeId)
      .eq("id", actionId);
    await logIntegration(
      supabase,
      resolved,
      target === "gmail" ? "gmail_draft_created" : "calendar_event_created",
      "success",
      target === "gmail" ? "Gmail下書きを作成しました。" : "Googleカレンダー予定を作成しました。",
      { job_id: jobId, action_id: actionId, target_id: result.targetId, response_id: result.response.id }
    );
    return { jobId, target, externalId: typeof result.response.id === "string" ? result.response.id : null };
  } catch (error) {
    const message = friendlyGoogleApiError(error instanceof Error ? error.message : "Google API実行に失敗しました。");
    if (!jobId) {
      jobId = await createExternalPublishJob(supabase, resolved, actionId, target, targetId, targetScheduledAt, {
        target,
        failed_before_request: true,
        attempted_payload: attemptedPayload
      });
    }
    await supabase
      .from("external_publish_jobs")
      .update({
        status: "error",
        error_message: message,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId);
    await supabase
      .from("growth_actions")
      .update({
        external_provider: target,
        external_status: "error",
        failed_reason: message,
        updated_at: new Date().toISOString()
      })
      .eq("store_id", resolved.storeId)
      .eq("id", actionId);
    await logIntegration(
      supabase,
      resolved,
      target === "gmail" ? "gmail_draft_failed" : "calendar_event_failed",
      "error",
      message,
      { job_id: jobId, action_id: actionId, target }
    );
    throw new Error(message);
  }
}

export function googleConnectionStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    connected: "接続済み",
    not_connected: "未接続",
    expired: "期限切れ",
    error: "エラー",
    disconnected: "解除済み",
    ready: "準備済み",
    needs_location: "ロケーション確認待ち",
    api_review_pending: "Google審査待ち",
    manual_mode: "手動投稿支援モード",
    approved: "API承認済み",
    not_applied: "未申請"
  };
  return labels[status ?? "not_connected"] ?? status ?? "未接続";
}
