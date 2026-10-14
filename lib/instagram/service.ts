import "server-only";
import crypto from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import { InstagramClient } from "./client";
import { decryptInstagramToken, encryptInstagramToken } from "./secrets";
import { INSTAGRAM_LOGIN_PROVIDER, instagramAuthorizationUrl, instagramLoginAllowed, instagramRedirectUri, instagramStateHash, publishingAccountReady, type PublishingAccount } from "./policy";

function database() {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Instagram接続の保存設定は準備中です。");
  return db;
}
async function editorContext(storeId: string) {
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const role = access?.organizationRoles[store.organization_id] ?? access?.storeRoles[store.id];
  if (!access || (!access.isPlatformAdmin && !["org_owner", "store_manager", "staff"].includes(role ?? ""))) throw new Error("Instagram接続を変更する権限がありません。");
  if (!isFeatureEnabled(resolveFeatureFlags(store), "external_channel_accounts")) throw new Error("この店舗では外部サービス連携を利用できません。");
  return { store, access };
}
function config(origin?: string) {
  const redirectUri = instagramRedirectUri(process.env.INSTAGRAM_REDIRECT_URI);
  if (origin && new URL(redirectUri).origin !== origin) throw new Error("Instagramの接続は正式なAIObのURLから開始してください。");
  if (!process.env.INSTAGRAM_APP_ID || !process.env.INSTAGRAM_APP_SECRET || !(process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY || process.env.SNS_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY)) throw new Error("Instagramの接続設定は準備中です。");
  return { redirectUri, appId: process.env.INSTAGRAM_APP_ID, appSecret: process.env.INSTAGRAM_APP_SECRET };
}
export function instagramClient() { return new InstagramClient(process.env.INSTAGRAM_APP_ID ?? "", process.env.INSTAGRAM_APP_SECRET ?? "", process.env.INSTAGRAM_GRAPH_VERSION || "v26.0"); }

export async function startInstagramOAuth(storeId: string, origin: string) {
  const { store, access } = await editorContext(storeId);
  if (!instagramLoginAllowed(store.id)) throw new Error("Instagram直接接続は審査準備中です。一般店舗への提供は承認後に開始します。");
  const settings = config(origin);
  const state = crypto.randomBytes(32).toString("base64url");
  const { error } = await database().rpc("start_instagram_oauth", { p_actor: access.userId, p_store: store.id, p_hash: instagramStateHash(state), p_redirect: settings.redirectUri });
  if (error) throw new Error("Instagram接続を開始できませんでした。もう一度お試しください。");
  return { state, url: instagramAuthorizationUrl(settings.appId, settings.redirectUri, state) };
}

export async function consumeInstagramOAuth(hash: string, origin: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインしてからInstagramを接続し直してください。");
  const settings = config(origin);
  const { data, error } = await database().rpc("consume_instagram_oauth", { p_actor: access.userId, p_hash: hash, p_redirect: settings.redirectUri });
  if (error || !data?.store_id) throw new Error("Instagram接続の有効期限が切れたか、すでに使用済みです。接続し直してください。");
  const { store } = await editorContext(String(data.store_id));
  if (!instagramLoginAllowed(store.id)) throw new Error("この店舗のInstagram直接接続は現在利用できません。");
  return { hash, storeId: store.id, userId: access.userId, redirectUri: settings.redirectUri };
}

export async function completeInstagramOAuth(session: Awaited<ReturnType<typeof consumeInstagramOAuth>>, code: string) {
  if (!code || code.length > 4096 || /[\r\n]/u.test(code)) throw new Error("Instagramから認証コードを受け取れませんでした。");
  const { store, access } = await editorContext(session.storeId);
  if (access.userId !== session.userId || !instagramLoginAllowed(store.id)) throw new Error("接続の操作者または店舗が変わりました。接続し直してください。");
  const identity = await instagramClient().exchangeCode(code, session.redirectUri);
  const cipher = encryptInstagramToken(identity.token, store.organization_id, store.id);
  const { error } = await database().rpc("finish_instagram_oauth", { p_actor: access.userId, p_hash: session.hash, p_external_id: identity.userId, p_username: identity.username, p_account_type: identity.accountType, p_cipher: cipher, p_expires: new Date(Date.now() + identity.expiresIn * 1000).toISOString() });
  if (error) throw new Error("接続中に設定が変更されたか、接続を保存できませんでした。Facebook連携は変更していません。接続し直してください。");
  return store.id;
}

export async function getInstagramConnectionState(storeId: string) {
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  const role = access?.organizationRoles[store.organization_id] ?? access?.storeRoles[store.id];
  const canEdit = Boolean(access && (access.isPlatformAdmin || ["org_owner", "store_manager", "staff"].includes(role ?? "")));
  let envReady = false;
  try { config(); envReady = true; } catch { /* UI deliberately shows not-configured, never a fake connection. */ }
  const db = createSupabaseAdminClient();
  if (!db) return { envReady, allowed: false, reviewApproved: false, account: null, unavailable: true, canEdit };
  const { data, error } = await db.from("external_channel_accounts").select("id,channel,external_provider,external_account_id,account_name,connection_status,token_expires_at,connected_at,metadata").eq("store_id", store.id).eq("organization_id", store.organization_id).eq("channel", "instagram").eq("external_provider", INSTAGRAM_LOGIN_PROVIDER).maybeSingle();
  if (error) throw new Error("Instagramの接続状況を確認できませんでした。時間を置いて再表示してください。");
  const expired = data?.connection_status === "connected" && (!data.token_expires_at || !Number.isFinite(Date.parse(data.token_expires_at)) || Date.parse(data.token_expires_at) <= Date.now());
  return { envReady, allowed: instagramLoginAllowed(store.id), reviewApproved: process.env.INSTAGRAM_ADVANCED_ACCESS_APPROVED === "true", account: data ? { ...data, connection_status: expired ? "expired" : data.connection_status } : null, unavailable: false, canEdit };
}

export async function disconnectInstagramLogin(storeId: string) {
  const { store, access } = await editorContext(storeId);
  const { error } = await database().rpc("disconnect_instagram_login", { p_actor: access.userId, p_store: store.id });
  if (error) throw new Error("Instagramの接続を解除できませんでした。もう一度お試しください。");
  // Local per-store disconnect only: revoking the whole Instagram app would also affect other stores.
}

export async function refreshInstagramAccount(account: PublishingAccount, actorId: string | null = null) {
  if (!instagramLoginAllowed(account.store_id) || !publishingAccountReady(account)) throw new Error("Instagramの接続と認証期限を確認してください。");
  const issuedAt = Date.parse(String(account.metadata?.token_issued_at ?? ""));
  if (!Number.isFinite(issuedAt)) throw new Error("Instagramの認証日時を確認できません。接続し直してください。");
  if (Date.now() - issuedAt < 24 * 60 * 60_000) return account;
  const token = decryptInstagramToken(account.access_token_encrypted!, account.organization_id, account.store_id);
  const refreshed = await instagramClient().refresh(token);
  const cipher = encryptInstagramToken(refreshed.token, account.organization_id, account.store_id);
  const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString();
  const { data, error } = await database().rpc("refresh_instagram_login", { p_actor: actorId, p_store: account.store_id, p_account: account.id, p_old_cipher: account.access_token_encrypted, p_new_cipher: cipher, p_expires: expiresAt });
  if (error || data !== true) throw new Error("更新中にInstagramの接続が変更されました。接続状況を確認してください。");
  return { ...account, access_token_encrypted: cipher, token_expires_at: expiresAt };
}

export async function refreshInstagramLogin(storeId: string) {
  const { store, access } = await editorContext(storeId);
  const { data, error } = await database().from("external_channel_accounts").select("*").eq("store_id", store.id).eq("organization_id", store.organization_id).eq("channel", "instagram").eq("external_provider", INSTAGRAM_LOGIN_PROVIDER).maybeSingle();
  if (error || !data) throw new Error("Instagramを先に接続してください。");
  await refreshInstagramAccount(data as PublishingAccount, access.userId);
}
