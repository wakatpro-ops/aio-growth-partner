import { NextRequest, NextResponse } from "next/server";
import { getStoreForApi } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await context.params;
  const resolved = await getStoreForApi(storeId);
  if (!resolved.ok) return NextResponse.json({ error: resolved.status === 401 ? "ログインが必要です。" : "店舗を確認できません。" }, { status: resolved.status });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "予約を取得できません。" }, { status: 503 });
  const startsAt = request.nextUrl.searchParams.get("starts_at") ?? new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const endsAt = request.nextUrl.searchParams.get("ends_at") ?? new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase.from("bookings").select("id,status,source,starts_at,ends_at,customer_name,service_name").eq("store_id", resolved.store.id).is("archived_at", null).gte("starts_at", startsAt).lt("starts_at", endsAt).order("starts_at").limit(500);
  if (error?.code === "42P01") return NextResponse.json({ bookings: [] });
  if (error) return NextResponse.json({ error: "予約を取得できません。" }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}
