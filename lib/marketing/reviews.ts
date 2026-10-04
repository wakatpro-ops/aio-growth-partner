import "server-only";
import { cache } from "react";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GoogleBusinessReview } from "@/types/phase5";

/** Counts are exact, not the length of the latest-review preview. No private review text. */
export const getReviewSummary = cache(async (storeId: string) => {
  const store = await getStore(storeId);
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("口コミ情報を取得できませんでした。");
  const scoped = (table: string, fields: string) => db.from(table).select(fields).eq("store_id", store.id).eq("organization_id", store.organization_id);
  const [connections, locations] = await Promise.all([
    scoped("google_oauth_connections", "id,status"),
    scoped("google_business_locations", "id,google_oauth_connection_id").is("archived_at", null).eq("is_selected", true)
  ]);
  if (connections.error || locations.error) throw new Error("Googleの接続状況を取得できませんでした。");
  const selected = (locations.data ?? []) as unknown as { id: string; google_oauth_connection_id: string }[];
  const accounts = (connections.data ?? []) as unknown as { id: string; status: string }[];
  const ids = selected.map(row => row.id);
  const connected = selected.some(location => accounts.some(connection => connection.id === location.google_oauth_connection_id && connection.status === "connected"));
  let unanswered = 0;
  if (ids.length) {
    const result = await db.from("google_business_reviews").select("id", { count: "exact", head: true })
      .eq("store_id", store.id).eq("organization_id", store.organization_id).in("google_business_location_id", ids)
      .or("google_reply_text.is.null,google_reply_text.eq.\"\"").neq("reply_status", "published");
    if (result.error || result.count === null) throw new Error("未返信件数を取得できませんでした。");
    unanswered = result.count;
  }
  return { connected, unanswered, locationIds: ids };
});

export async function getReviewPage(storeId: string, page: number, all: boolean) {
  const store = await getStore(storeId), summary = await getReviewSummary(storeId);
  if (!summary.locationIds.length) return { reviews: [] as GoogleBusinessReview[], count: 0 };
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("口コミを取得できませんでした。");
  let query = db.from("google_business_reviews").select("*", { count: "exact" })
    .eq("store_id", store.id).eq("organization_id", store.organization_id).in("google_business_location_id", summary.locationIds);
  if (!all) query = query.or("google_reply_text.is.null,google_reply_text.eq.\"\"").neq("reply_status", "published");
  const result = await query.order("google_updated_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1);
  if (result.error || result.count === null) throw new Error("口コミを取得できませんでした。再読み込みしてください。");
  return { reviews: result.data as GoogleBusinessReview[], count: result.count };
}
