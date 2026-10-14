import "server-only";
import { z } from "zod";
import { getCurrentUserAccess, canManageOrganization } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import { getAirRegiAdapter, requireAirRegiAdapter } from "./adapter";
import type { AirRegiAdapter, AirRegiCredentials } from "./contracts";
import { encryptAirRegiCredentials, decryptAirRegiCredentials } from "./secrets";
import { validateAirRegiPage } from "./normalize";

type Database = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
export type AirRegiConnectionView = {
  id: string; external_store_name: string; status: string; revision: number;
  last_success_at: string | null; archived_at: string | null; last_error_code: string | null;
};
const uuid = z.string().uuid();
const identity = z.object({ externalStoreId: z.string().min(1).max(160), name: z.string().min(1).max(300) }).strict();
const viewFields = "id,external_store_name,status,revision,last_success_at,archived_at,last_error_code";

async function ownerContext(storeId: string) {
  uuid.parse(storeId);
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  if (!access || !await canManageOrganization(store.organization_id)) throw new Error("店舗オーナーの権限が必要です。");
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Airレジ設定を取得できません。");
  const allowed = await db.rpc("air_regi_owner_allowed", { p_actor: access.userId, p_store: storeId });
  if (allowed.error || !allowed.data) throw new Error("店舗オーナーの権限が必要です。");
  return { store, access, db };
}

export async function getAirRegiSettings(storeId: string) {
  const { db } = await ownerContext(storeId);
  const { data, error } = await db.from("air_regi_connections").select(viewFields).eq("store_id", storeId).maybeSingle();
  if (error) throw new Error("Airレジ設定を取得できません。時間をおいてお試しください。");
  return { ready: getAirRegiAdapter() !== null, connection: data as AirRegiConnectionView | null };
}

/** Not a server action/route. The future verified-adapter UI must confirm the
 * probed identity with the owner before calling this (no automatic binding). */
export async function connectAirRegi(storeId: string, credentials: AirRegiCredentials, confirmedExternalStoreId: string) {
  const { db, access, store } = await ownerContext(storeId);
  const adapter = requireAirRegiAdapter(); // Gate before any credential transfer.
  const ciphertext = encryptAirRegiCredentials(credentials, store.organization_id, storeId);
  const verified = identity.parse(await adapter.probe(credentials, AbortSignal.timeout(20_000)));
  if (verified.externalStoreId !== confirmedExternalStoreId) throw new Error("Airレジの店舗が一致しません。接続先を確認してください。");
  const { error } = await db.rpc("save_air_regi_connection", {
    p_actor: access.userId, p_store: storeId, p_external: verified.externalStoreId,
    p_name: verified.name, p_ciphertext: ciphertext, p_spec: adapter.specificationVersion,
    p_interval: adapter.minimumIntervalSeconds
  });
  if (error) throw new Error("接続を保存できません。店舗の重複や削除済みの接続を確認してください。");
}

export async function transitionAirRegi(storeId: string, id: string, action: string, revision: number) {
  const { db, access } = await ownerContext(storeId);
  uuid.parse(id);
  z.enum(["pause", "resume", "archive", "restore"]).parse(action);
  z.number().int().positive().parse(revision);
  if (action === "resume") requireAirRegiAdapter();
  const { error } = await db.rpc("transition_air_regi_connection", {
    p_actor: access.userId, p_store: storeId, p_id: id, p_action: action, p_revision: revision
  });
  if (error) throw new Error("設定が変わったか、再接続が必要です。画面を開き直してください。");
}

/** Dependency injection is for synthetic tests only; never chosen by a request
 * parameter or env mock switch. Production calls only getAirRegiAdapter(). */
export async function syncAirRegiConnection(db: Database, adapter: AirRegiAdapter, id: string) {
  if (!adapter.specificationVersion || !Number.isInteger(adapter.minimumIntervalSeconds) || adapter.minimumIntervalSeconds < 60) throw new Error("invalid_adapter");
  const claimed = await db.rpc("claim_air_regi_sync", { p_id: id, p_spec: adapter.specificationVersion });
  if (claimed.error) throw new Error("sync_claim_failed");
  if (!claimed.data) return { status: "skipped" as const };
  const connection = claimed.data as {
    id: string; organization_id: string; store_id: string; external_store_id: string;
    encrypted_credentials: string; lease_id: string; cursor: string | null; watermark: string | null; interval_seconds: number;
  };
  try {
    if (connection.interval_seconds < adapter.minimumIntervalSeconds) throw new Error("invalid_provider_data");
    const credentials = decryptAirRegiCredentials(connection.encrypted_credentials, connection.organization_id, connection.store_id);
    const input = await adapter.readPage({ credentials, externalStoreId: connection.external_store_id, cursor: connection.cursor, watermark: connection.watermark, signal: AbortSignal.timeout(20_000) });
    const page = validateAirRegiPage(input, connection.external_store_id, connection.cursor, connection.watermark);
    const result = await db.rpc("apply_air_regi_page", {
      p_id: id, p_lease: connection.lease_id, p_external: page.externalStoreId,
      p_transactions: page.transactions, p_cursor: page.nextCursor, p_watermark: page.watermark
    });
    if (result.error) throw new Error("sync_failed");
    return { status: "synced" as const, ...(result.data as { changed: number; has_more: boolean }) };
  } catch (error) {
    // Never retain raw provider errors, which can contain keys or customer data.
    const message = error instanceof Error ? error.message : "";
    const code = message === "store_mismatch" ? "store_mismatch" : ["invalid_provider_data", "cursor_did_not_advance", "watermark_regressed", "watermark_before_last_page", "duplicate_source_id"].includes(message) ? "invalid_provider_data" : "sync_failed";
    const failed = await db.rpc("fail_air_regi_sync", { p_id: id, p_lease: connection.lease_id, p_code: code });
    if (failed.error) throw new Error("sync_failure_record_failed");
    return { status: "error" as const, code };
  }
}

export async function runAirRegiSync() {
  const adapter = getAirRegiAdapter();
  if (!adapter) return { status: "awaiting_specification", synced: 0 }; // No DB or secret reads.
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("sync_database_unavailable");
  const { data, error } = await db.from("air_regi_connections").select("id")
    .is("archived_at", null).in("status", ["active", "error"]).lte("next_sync_at", new Date().toISOString()).order("next_sync_at").limit(2);
  if (error) throw new Error("sync_connections_unavailable");
  const results = [];
  for (const connection of data ?? []) results.push(await syncAirRegiConnection(db, adapter, connection.id));
  return { status: "completed", synced: results.filter(result => result.status === "synced").length, failed: results.filter(result => result.status === "error").length };
}
