import "server-only";

import { calendarDays, japanDay, shiftDay } from "@/lib/customer-workbench-rules";
import { storedGoogleReviewSummary, type GoogleReviewSummary } from "@/lib/google-review-summary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";

type Db = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
export type HomeGoogleRating = { state: "ready"; summary: GoogleReviewSummary } | { state: "unavailable" | "disconnected" | "not_selected" | "not_synced" };

export function homeBookingWeek(now = new Date()) {
  const days = calendarDays(japanDay(now), true);
  return { days, startsAt: `${days[0]}T00:00:00+09:00`, endsAt: `${shiftDay(days[6], 1)}T00:00:00+09:00` };
}

async function weeklyBookingCount(db: Db, store: Store, week: ReturnType<typeof homeBookingWeek>) {
  const result = await db.from("bookings").select("id", { count: "exact", head: true })
    .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null)
    .lt("starts_at", week.endsAt).gt("ends_at", week.startsAt).not("status", "in", "(cancelled,no_show)");
  if (result.error || typeof result.count !== "number" || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error("home_bookings_unavailable");
  return result.count;
}

async function googleRating(db: Db, store: Store): Promise<HomeGoogleRating> {
  const [connections, locations] = await Promise.all([
    db.from("google_oauth_connections").select("id,status").eq("store_id", store.id).eq("organization_id", store.organization_id),
    db.from("google_business_locations").select("id,google_oauth_connection_id,google_location_name,metadata")
      .eq("store_id", store.id).eq("organization_id", store.organization_id).is("archived_at", null).eq("is_selected", true)
  ]);
  if (connections.error || locations.error) throw new Error("home_google_unavailable");
  const accounts = connections.data ?? [];
  if (!accounts.some(account => account.status === "connected")) return { state: "disconnected" };
  // Do not blend ratings from multiple or previously selected locations/accounts.
  const selected = (locations.data ?? []).filter(location => accounts.some(account => account.id === location.google_oauth_connection_id && account.status === "connected"));
  if (selected.length !== 1) return { state: "not_selected" };
  const summary = storedGoogleReviewSummary(selected[0].metadata, selected[0].google_location_name);
  return summary ? { state: "ready", summary } : { state: "not_synced" };
}

export async function getStoreHomeMetrics(storeId: string, now = new Date()) {
  const store = await getStore(storeId); // Authorize before any service-role read.
  const week = homeBookingWeek(now), db = createSupabaseAdminClient();
  if (!db) return { week, bookingCount: null, googleRating: { state: "unavailable" } as HomeGoogleRating };
  const [bookings, rating] = await Promise.allSettled([weeklyBookingCount(db, store, week), googleRating(db, store)]);
  return {
    week,
    bookingCount: bookings.status === "fulfilled" ? bookings.value : null,
    googleRating: rating.status === "fulfilled" ? rating.value : { state: "unavailable" } as HomeGoogleRating
  };
}
