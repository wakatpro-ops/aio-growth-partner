import { NextResponse } from "next/server";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { demoStores } from "@/lib/industry/demo-data";
import { getStoreNavigationLabels } from "@/lib/store-navigation";
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
    const response = NextResponse.json({
      id: demoStore.id,
      name: demoStore.name,
      navigationLabels: getStoreNavigationLabels(demoStore.industry_type_key),
      stores: access.isPlatformAdmin ? demoStores.map((store) => ({ id: store.id, name: store.name })) : [{ id: demoStore.id, name: demoStore.name }],
      canManageStores: access.isPlatformAdmin
    });
    response.cookies.set("aio_last_store_id", demoStore.id, { httpOnly: true, maxAge: 60 * 60 * 24 * 90, path: "/", sameSite: "lax" });
    return response;
  }

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, organization_id, industry_type_key")
    .eq("id", storeId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
  }

  if (!access.isPlatformAdmin && !access.organizationIds.includes(String(data.organization_id)) && !access.storeIds.includes(String(data.id))) {
    return NextResponse.json({ error: "店舗を確認できませんでした。" }, { status: 404 });
  }

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, name, organization_id")
    .eq("status", "active")
    .is("archived_at", null)
    .order("name");
  const stores = (storeRows ?? []).filter((store) => (
    access.isPlatformAdmin
    || access.organizationIds.includes(String(store.organization_id))
    || access.storeIds.includes(String(store.id))
  )).map((store) => ({ id: String(store.id), name: String(store.name) }));
  const canManageStores = access.isPlatformAdmin
    || access.organizationIds.some((organizationId) => access.organizationRoles[organizationId] === "org_owner");
  const response = NextResponse.json({
    id: data.id,
    name: data.name,
    stores,
    canManageStores,
    navigationLabels: getStoreNavigationLabels(data.industry_type_key)
  });
  response.cookies.set("aio_last_store_id", String(data.id), {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
