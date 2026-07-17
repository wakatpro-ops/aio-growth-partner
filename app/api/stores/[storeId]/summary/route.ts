import { NextResponse } from "next/server";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { demoStores } from "@/lib/industry/demo-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_: Request, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const access = await getCurrentUserAccess();
  if (!access) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    const demoStore = demoStores.find((store) => store.id === storeId);
    if (!demoStore) return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
    return NextResponse.json({ id: demoStore.id, name: demoStore.name });
  }

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, organization_id")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
  }

  if (!access.isPlatformAdmin && !access.organizationIds.includes(String(data.organization_id))) {
    return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, name: data.name });
}
