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
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function encodeState(storeId: string) {
  const payload = {
    storeId,
    nonce: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeState(state: string | null) {
  if (!state) throw new Error("OAuth stateがありません。");
  const payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { storeId?: string };
  if (!payload.storeId) throw new Error("OAuth stateの店舗情報を確認できませんでした。");
  return { storeId: payload.storeId };
}

function encryptSecret(value: string | null | undefined) {
  if (!value) return null;
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY が未設定です。Vercel環境変数に追加してください。");
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decodeJwtEmail(idToken: string | undefined) {
  if (!idToken) return { email: null, providerUserId: null };
  const [, payload] = idToken.split(".");
  if (!payload) return { email: null, providerUserId: null };
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string; sub?: string };
    return { email: decoded.email ?? null, providerUserId: decoded.sub ?? null };
  } catch {
    return { email: null, providerUserId: null };
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
  if (!hasGoogleOAuthEnv()) throw new Error("Google OAuth用の環境変数が未設定です。");
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (supabase) {
    const resolved = await ensureGooglePersistence(supabase, store);
    await logIntegration(supabase, resolved, "oauth_start", "ready", "Google OAuth接続を開始しました。", { store_id: store.id });
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", googleScopes().join(" "));
  url.searchParams.set("state", encodeState(storeId));
  return url.toString();
}

export async function handleGoogleOAuthCallback(url: URL) {
  const state = decodeState(url.searchParams.get("state"));
  const store = await getStore(state.storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureGooglePersistence(supabase, store);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    await logIntegration(supabase, resolved, "oauth_callback", "error", `Google OAuthでエラーが返りました: ${oauthError}`);
    return { storeId: store.id, ok: false, message: oauthError };
  }

  const code = url.searchParams.get("code");
  if (!code) throw new Error("Google OAuth codeがありません。");
  if (!hasGoogleOAuthEnv()) throw new Error("Google OAuth用の環境変数が未設定です。");

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
    await logIntegration(supabase, resolved, "oauth_callback", "error", message, { token_error: token.error });
    return { storeId: store.id, ok: false, message };
  }

  const identity = decodeJwtEmail(token.id_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await supabase.from("google_oauth_connections").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider_user_id: identity.providerUserId,
    email: identity.email,
    access_token_encrypted: encryptSecret(token.access_token),
    refresh_token_encrypted: encryptSecret(token.refresh_token),
    expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(/\s+/) : googleScopes(),
    status: "connected",
    connected_at: new Date().toISOString(),
    metadata: { token_type: "encrypted", phase: "5-C" }
  });
  await logIntegration(supabase, resolved, "oauth_callback", "success", "Google OAuth接続を保存しました。", { email: identity.email });
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
  const { error } = await supabase.from("google_business_profiles").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    google_account_id: String(formData.get("google_account_id") ?? "") || null,
    location_id: String(formData.get("location_id") ?? "") || null,
    location_name: String(formData.get("location_name") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
    status: "ready",
    last_synced_at: new Date().toISOString(),
    metadata: { memo: String(formData.get("memo") ?? "") },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`Googleビジネスプロフィール設定を保存できませんでした: ${error.message}`);
  await logIntegration(supabase, resolved, "business_profile_setting", "success", "Googleビジネスプロフィール設定を保存しました。");
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

export function googleConnectionStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    connected: "接続済み",
    not_connected: "未接続",
    expired: "期限切れ",
    error: "エラー",
    disconnected: "解除済み",
    ready: "準備済み"
  };
  return labels[status ?? "not_connected"] ?? status ?? "未接続";
}
