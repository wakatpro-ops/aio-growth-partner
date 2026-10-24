import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { canManageOrganization, getCurrentUserAccess } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import { SquareClient, squareLocationSchema } from "./client";
import { decryptSquareTokens, encryptSquareTokens } from "./secrets";
import { normalizeSquareOrder, squareSyncWindow } from "./normalize";
import { squareAllowed, squareAuthorizationUrl, squareEnvironment, squareRedirect, squareStateHash, squareOAuthStep, SQUARE_SPEC, type SquareEnvironment } from "./policy";
import { transactionSchema } from "../airregi/contracts";

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
const uuid = z.string().uuid();
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u);
export type SquareConfig = { environment: SquareEnvironment; appId: string; redirect: string; client: SquareClient };
export function getSquareConfig(): SquareConfig | null {
  if (process.env.SQUARE_LOGIN_ENABLED !== "true") return null;
  try {
    const environment = squareEnvironment(process.env.SQUARE_ENVIRONMENT);
    const redirect = squareRedirect(process.env.SQUARE_REDIRECT_URI);
    if (new URL(redirect).origin !== new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").origin) return null;
    if (environment === "sandbox" && new URL(redirect).hostname === "app.aioboost.jp") return null;
    const appId = process.env.SQUARE_APPLICATION_ID ?? "", secret = process.env.SQUARE_APP_SECRET;
    if (!secret || !process.env.SQUARE_TOKEN_ENCRYPTION_KEY) return null;
    if (!(environment === "sandbox" ? /^sandbox-sq0csb-/u : /^sq0csp-/u).test(secret)) return null;
    squareAuthorizationUrl(environment, appId, redirect, "x".repeat(43));
    return { environment, appId, redirect, client: new SquareClient(environment, appId, secret) };
  } catch { return null; }
}
function configFor(storeId: string) {
  const config = getSquareConfig();
  if (!config || !squareAllowed(storeId)) throw new Error("Squareの接続設定は準備中です。");
  return config;
}
async function ownerContext(storeId: string) {
  uuid.parse(storeId);
  const store = await getStore(storeId), access = await getCurrentUserAccess();
  if (!access || !await canManageOrganization(store.organization_id)) throw new Error("店舗オーナーの権限が必要です。");
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Squareの設定を取得できません。");
  const allowed = await db.rpc("square_pos_owner_allowed", { p_actor: access.userId, p_store: storeId });
  if (allowed.error || allowed.data !== true) throw new Error("店舗オーナーの権限が必要です。");
  return { store, access, db };
}
const viewFields = "id,external_store_name,environment,status,revision,last_success_at,last_error_code,archived_at,cursor";
export type SquareConnectionView = { id: string; external_store_name: string; environment: SquareEnvironment; status: string; revision: number; last_success_at: string | null; last_error_code: string | null; archived_at: string | null; cursor: string | null };
export async function getSquareSettings(storeId: string, pendingId?: string) {
  const { db, access, store } = await ownerContext(storeId);
  const [result, organization] = await Promise.all([
    db.from("square_pos_connections").select(viewFields).eq("store_id", storeId).maybeSingle(),
    db.from("organizations").select("name").eq("id", store.organization_id).single()
  ]);
  if (result.error || organization.error || !organization.data?.name) throw new Error("Squareの設定を取得できません。時間をおいてお試しください。");
  const config = getSquareConfig();
  let pending = null;
  if (pendingId && uuid.safeParse(pendingId).success && config && squareAllowed(storeId)) {
    const response = await db.from("square_pos_oauth_sessions").select("id,locations")
      .eq("id", pendingId).eq("store_id", storeId).eq("actor_id", access.userId).eq("organization_id", store.organization_id)
      .eq("environment", config.environment).is("confirmed_at", null).not("pending_ciphertext", "is", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (response.error) throw new Error("接続先の確認情報を取得できません。");
    if (response.data) pending = { id: response.data.id as string, locations: z.array(squareLocationSchema).parse(response.data.locations) };
  }
  return { connection: result.data as SquareConnectionView | null, organizationName: organization.data.name as string, ready: Boolean(config && squareAllowed(storeId)), environment: config?.environment, pending };
}
export async function beginSquareConnection(storeId: string, origin: string) {
  const config = configFor(storeId);
  if (new URL(config.redirect).origin !== origin) throw new Error("invalid_origin");
  const { db, access } = await ownerContext(storeId);
  const state = randomBytes(32).toString("base64url");
  const result = await db.rpc("begin_square_pos_oauth", { p_actor: access.userId, p_store: storeId, p_state: squareStateHash(state), p_environment: config.environment, p_redirect: config.redirect });
  if (result.error) throw new Error("接続の準備に失敗しました。もう一度お試しください。");
  return { state, url: squareAuthorizationUrl(config.environment, config.appId, config.redirect, state) };
}
export async function completeSquareConnection(stateHash: string, code: string, origin: string) {
  const config = getSquareConfig(), access = await getCurrentUserAccess(), db = createSupabaseAdminClient();
  if (!config || !db || !access || new URL(config.redirect).origin !== origin || !/^[a-f0-9]{64}$/u.test(stateHash)) throw new Error("invalid_oauth");
  z.string().min(1).max(5000).parse(code);
  const consumed = await db.rpc("consume_square_pos_oauth", { p_actor: access.userId, p_state: stateHash, p_environment: config.environment, p_redirect: config.redirect });
  if (consumed.error || !consumed.data) throw new Error("invalid_oauth");
  const session = z.object({ id: uuid, store_id: uuid, organization_id: uuid }).parse(consumed.data);
  configFor(session.store_id);
  const tokens = await squareOAuthStep("exchange", () => config.client.exchange(code, config.redirect));
  const locations = await squareOAuthStep("locations", async () => {
    const rows = await config.client.locations(tokens);
    if (!rows.length) throw new Error("no_eligible_locations");
    return rows;
  });
  const ciphertext = await squareOAuthStep("encryption", () => encryptSquareTokens(tokens, session.organization_id, session.store_id));
  await squareOAuthStep("persistence", async () => {
    const staged = await db.rpc("stage_square_pos_oauth", { p_actor: access.userId, p_id: session.id, p_ciphertext: ciphertext, p_merchant: tokens.merchantId, p_locations: locations, p_expires: tokens.expiresAt });
    if (staged.error) throw new Error("database_rejected");
  });
  return { storeId: session.store_id, pendingId: session.id };
}
export async function confirmSquareConnection(storeId: string, pendingId: string, locationId: string) {
  const config = configFor(storeId), { db, access, store } = await ownerContext(storeId);
  uuid.parse(pendingId); id.parse(locationId);
  const response = await db.from("square_pos_oauth_sessions").select("pending_ciphertext,merchant_id,locations")
    .eq("id", pendingId).eq("actor_id", access.userId).eq("store_id", storeId).eq("organization_id", store.organization_id)
    .eq("environment", config.environment).is("confirmed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (response.error || !response.data?.pending_ciphertext) throw new Error("接続の有効期限が切れました。Squareを接続し直してください。");
  const tokens = decryptSquareTokens(response.data.pending_ciphertext, store.organization_id, storeId);
  if (tokens.merchantId !== response.data.merchant_id) throw new Error("store_mismatch");
  const locations = await config.client.locations(tokens);
  const previous = z.array(squareLocationSchema).parse(response.data.locations).find(x => x.id === locationId);
  const location = locations.find(x => x.id === locationId);
  if (!location || !previous || location.name !== previous.name) throw new Error("Squareの店舗情報が変わりました。接続し直して確認してください。");
  const result = await db.rpc("confirm_square_pos_oauth", { p_actor: access.userId, p_store: storeId, p_id: pendingId, p_location: location.id });
  if (result.error?.message.includes("square_csv_overlap_review_required")) throw new Error("square_csv_overlap_review_required");
  if (result.error) throw new Error("接続を保存できません。店舗の重複・削除済みの接続・設定の変更を確認してください。");
}
export async function transitionSquareConnection(storeId: string, connectionId: string, action: string, revision: number) {
  const { db, access } = await ownerContext(storeId);
  uuid.parse(connectionId); z.enum(["pause", "resume", "archive", "restore"]).parse(action); z.number().int().positive().parse(revision);
  if (action === "resume") configFor(storeId);
  const result = await db.rpc("transition_square_pos_connection", { p_actor: access.userId, p_store: storeId, p_id: connectionId, p_action: action, p_revision: revision });
  if (result.error) throw new Error("設定が変わったか、再接続が必要です。画面を開き直してください。");
}

type Claimed = { id: string; organization_id: string; store_id: string; environment: SquareEnvironment; merchant_id: string; location_id: string; external_store_id: string; encrypted_credentials: string; lease_id: string; cursor: string | null; watermark: string | null };
export async function syncSquareConnection(db: Database, config: SquareConfig, connectionId: string) {
  const claimed = await db.rpc("claim_square_pos_sync", { p_id: connectionId, p_spec: SQUARE_SPEC, p_environment: config.environment });
  if (claimed.error) throw new Error("square_claim_failed");
  if (!claimed.data) return { status: "skipped" as const };
  const connection = claimed.data as Claimed;
  try {
    if (!squareAllowed(connection.store_id) || connection.environment !== config.environment || connection.external_store_id !== `${config.environment}:${connection.merchant_id}:${connection.location_id}`) throw new Error("store_mismatch");
    let tokens = decryptSquareTokens(connection.encrypted_credentials, connection.organization_id, connection.store_id);
    if (tokens.merchantId !== connection.merchant_id) throw new Error("store_mismatch");
    if (Date.parse(tokens.expiresAt) - Date.now() < 7 * 86400_000) {
      tokens = await config.client.refresh(tokens);
      const refreshed = await db.rpc("refresh_square_pos_credentials", { p_id: connection.id, p_lease: connection.lease_id, p_previous: connection.encrypted_credentials, p_ciphertext: encryptSquareTokens(tokens, connection.organization_id, connection.store_id), p_expires: tokens.expiresAt });
      if (refreshed.error || refreshed.data !== true) throw new Error("square_reconnect_required");
    }
    if (!(await config.client.locations(tokens)).some(x => x.id === connection.location_id)) throw new Error("square_reconnect_required");
    const window = squareSyncWindow(connection.watermark, connection.cursor);
    const input = await config.client.orders(tokens, connection.location_id, window.start, window.end, window.cursor);
    if (input.cursor && input.cursor === window.cursor) throw new Error("invalid_provider_data");
    const transactions = input.orders.map(order => {
      // Validate every record, including ignored OPEN orders, before checkpointing.
      const row = z.object({ id, location_id: id, updated_at: z.string().datetime({ offset: true }) }).parse(order);
      if (row.location_id !== connection.location_id) throw new Error("store_mismatch");
      if (Date.parse(row.updated_at) < Date.parse(window.start) || Date.parse(row.updated_at) >= Date.parse(window.end)) throw new Error("invalid_provider_data");
      return normalizeSquareOrder(order, connection.location_id);
    }).filter((value): value is z.infer<typeof transactionSchema> => value !== null);
    if (new Set(transactions.map(x => x.sourceId)).size !== transactions.length || Buffer.byteLength(JSON.stringify(transactions)) > 2 * 1024 * 1024) throw new Error("invalid_provider_data");
    const result = await db.rpc("apply_square_pos_page", { p_id: connection.id, p_lease: connection.lease_id, p_external: connection.external_store_id, p_transactions: transactions, p_cursor: input.cursor ? JSON.stringify({ start: window.start, end: window.end, cursor: input.cursor }) : null, p_watermark: input.cursor ? connection.watermark : window.end });
    if (result.error) throw new Error("sync_failed");
    return { status: "synced" as const, ...(result.data as { changed: number; has_more: boolean }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = ["store_mismatch", "square_unavailable", "square_rate_limited", "square_reconnect_required"].includes(message) ? message : "invalid_provider_data";
    const failed = await db.rpc("fail_square_pos_sync", { p_id: connection.id, p_lease: connection.lease_id, p_code: code });
    if (failed.error) throw new Error("square_failure_record_failed");
    return { status: "error" as const, code };
  }
}
export async function runSquareSync(storeId?: string) {
  // Only the authenticated cron may omit a store. Empty/null request arguments
  // must never fall through to the global worker from a store server action.
  if (storeId !== undefined) uuid.parse(storeId);
  const config = getSquareConfig();
  if (!config) return { status: "disabled", synced: 0, failed: 0 };
  const unrestricted = config.environment === "production" && process.env.SQUARE_GENERAL_ACCESS === "true";
  const allowedStores = (process.env.SQUARE_TEST_STORE_IDS ?? "").split(",").map(x => x.trim()).filter(x => uuid.safeParse(x).success);
  if (!unrestricted && !allowedStores.length) return { status: "disabled", synced: 0, failed: 0 };
  let db: Database;
  if (storeId !== undefined) { configFor(storeId); db = (await ownerContext(storeId)).db; }
  else { const client = createSupabaseAdminClient(); if (!client) throw new Error("square_database_unavailable"); db = client; }
  let query = db.from("square_pos_connections").select("id,store_id").eq("environment", config.environment)
    .is("archived_at", null).in("status", ["active", "error"]).lte("next_sync_at", new Date().toISOString()).order("next_sync_at").limit(2);
  if (!unrestricted) query = query.in("store_id", allowedStores);
  if (storeId !== undefined) query = query.eq("store_id", storeId);
  const result = await query;
  if (result.error) throw new Error("square_connections_unavailable");
  const results = [];
  for (const connection of result.data ?? []) if (squareAllowed(connection.store_id)) results.push(await syncSquareConnection(db, config, connection.id));
  return { status: "completed", synced: results.filter(x => x.status === "synced").length, failed: results.filter(x => x.status === "error").length };
}
