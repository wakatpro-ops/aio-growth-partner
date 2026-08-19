import "server-only";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { getIndustryConfig } from "@/config/industries";
import { canAccessOrganization, canManageOrganization, getCurrentUserAccess } from "@/lib/auth/server";
import { normalizeIndustryTypeKey } from "@/lib/applications/options";
import { demoStores, getDemoStore } from "@/lib/industry/demo-data";
import { isDemoStore } from "@/lib/mvp/status";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { IndustryTypeKey, Store } from "@/types/domain";

export type OnboardingSnapshot = {
  id: string;
  organization_id: string;
  store_id: string;
  application_id: string | null;
  snapshot_type: string;
  title: string;
  content: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function listStores({ includeArchived = false, includeDemo = false }: { includeArchived?: boolean; includeDemo?: boolean } = {}): Promise<Store[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoStores;
  }

  let query = supabase.from("stores").select("*").order("created_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) {
    console.error("店舗一覧を取得できませんでした", error.message);
    return [];
  }

  const stores = ((data ?? []) as Store[]).filter((store) => includeDemo || !isDemoStore(store));
  const access = await getCurrentUserAccess();
  if (!access) {
    return [];
  }
  if (access.isPlatformAdmin) {
    return stores;
  }
  return stores.filter((store) => access.organizationIds.includes(store.organization_id));
}

export async function listProductionStores(): Promise<Store[]> {
  const stores = await listStores();
  return stores.filter((store) => !isDemoStore(store));
}

export async function getStore(storeId: string): Promise<Store> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return getDemoStore(storeId);
  }

  const { data, error } = await supabase.from("stores").select("*").eq("id", storeId).is("archived_at", null).single();
  if (error || !data) {
    if (demoStores.some((store) => store.id === storeId)) {
      const access = await getCurrentUserAccess();
      if (!access?.isPlatformAdmin) notFound();
      return getDemoStore(storeId);
    }
    notFound();
  }

  const store = data as Store;
  if (isDemoStore(store)) {
    const access = await getCurrentUserAccess();
    if (!access?.isPlatformAdmin) notFound();
    return getDemoStore(storeId);
  }

  const access = await getCurrentUserAccess();
  if (!access) {
    redirect("/login");
  }
  if (!access.isPlatformAdmin && !access.organizationIds.includes(store.organization_id)) {
    notFound();
  }

  return store;
}

export type StoreApiAccessResult =
  | { ok: true; store: Store }
  | { ok: false; status: 401 | 404 };

export async function getStoreForApi(storeId: string): Promise<StoreApiAccessResult> {
  const access = await getCurrentUserAccess();
  if (!access) return { ok: false, status: 401 };

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    const demoStore = demoStores.find((store) => store.id === storeId);
    if (!demoStore || !access.isPlatformAdmin) return { ok: false, status: 404 };
    return { ok: true, store: demoStore };
  }

  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false, status: 404 };

  const store = data as Store;
  if (isDemoStore(store) && !access.isPlatformAdmin) return { ok: false, status: 404 };
  if (!access.isPlatformAdmin && !access.organizationIds.includes(store.organization_id)) {
    return { ok: false, status: 404 };
  }
  return { ok: true, store: isDemoStore(store) ? getDemoStore(storeId) : store };
}

export async function updateStoreFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  if (!(await canAccessOrganization(store.organization_id))) throw new Error("この店舗を更新する権限がありません。");

  const industryTypeKey = normalizeIndustryTypeKey(String(formData.get("industry") ?? store.industry_type_key));
  const industry = getIndustryConfig(industryTypeKey);
  const profileData = { ...store.profile_data };
  for (const field of industry.profileFields) {
    const raw = String(formData.get(field.key) ?? "").trim();
    profileData[field.key] = field.type === "list"
      ? raw.split(/[、,\n]/).map((value) => value.trim()).filter(Boolean)
      : field.type === "boolean" ? raw === "true" : raw;
  }

  const { error } = await supabase.from("stores").update({
    industry_type_key: industryTypeKey,
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    website_url: String(formData.get("website") ?? "").trim() || null,
    google_business_url: String(formData.get("gbp") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim(),
    profile_data: profileData,
    updated_at: new Date().toISOString()
  }).eq("id", store.id).eq("organization_id", store.organization_id);
  if (error) throw new Error(`店舗情報を保存できませんでした: ${error.message}`);
}

export async function archiveStore(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");

  const { data: store, error: readError } = await supabase
    .from("stores")
    .select("id, organization_id, name, archived_at")
    .eq("id", storeId)
    .maybeSingle();
  if (readError || !store) throw new Error("店舗が見つかりません。");
  if (!(await canManageOrganization(String(store.organization_id)))) {
    throw new Error("店舗をアーカイブできるのは組織オーナーまたは運営管理者だけです。");
  }
  if (store.archived_at) return;

  const { error } = await supabase.from("stores").update({
    archived_at: new Date().toISOString(),
    archived_by: access.userId,
    updated_at: new Date().toISOString()
  }).eq("id", storeId).is("archived_at", null);
  if (error) throw new Error(`店舗をアーカイブできませんでした: ${error.message}`);
}

export async function restoreStore(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");

  const { data: store, error: readError } = await supabase
    .from("stores")
    .select("id, organization_id")
    .eq("id", storeId)
    .maybeSingle();
  if (readError || !store) throw new Error("店舗が見つかりません。");
  if (!(await canManageOrganization(String(store.organization_id)))) {
    throw new Error("店舗を復元できるのは組織オーナーまたは運営管理者だけです。");
  }

  const { error } = await supabase.from("stores").update({
    archived_at: null,
    archived_by: null,
    updated_at: new Date().toISOString()
  }).eq("id", storeId);
  if (error) throw new Error(`店舗を復元できませんでした: ${error.message}`);
}

export async function getStoreOnboardingSnapshot(storeId: string): Promise<OnboardingSnapshot | null> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("onboarding_snapshots")
    .select("*")
    .eq("store_id", store.id)
    .eq("snapshot_type", "application_intake")
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;
  return data as OnboardingSnapshot;
}

export async function getMvpWorkspaceSummary() {
  const supabase = createSupabaseAdminClient();
  const stores = await listStores();
  const productionStores = stores.filter((store) => !isDemoStore(store));

  if (!supabase) {
    return {
      stores,
      productionStores,
      organizationName: "デモ環境",
      planKey: "starter",
      counts: {
        aiLogs: 0,
        imports: 0,
        invoices: 0,
        growthActions: 0
      }
    };
  }

  const organizationId = productionStores[0]?.organization_id ?? stores.find((store) => !isDemoStore(store))?.organization_id ?? null;
  const [organization, aiLogs, imports, invoices, growthActions] = await Promise.all([
    organizationId
      ? supabase.from("organizations").select("name, plan_key").eq("id", organizationId).maybeSingle()
      : Promise.resolve({ data: null }),
    organizationId
      ? supabase.from("ai_generation_logs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId)
      : Promise.resolve({ count: 0 }),
    organizationId
      ? supabase.from("data_import_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("archived_at", null)
      : Promise.resolve({ count: 0 }),
    organizationId
      ? supabase.from("invoices").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("archived_at", null)
      : Promise.resolve({ count: 0 }),
    organizationId
      ? supabase.from("growth_actions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).is("archived_at", null)
      : Promise.resolve({ count: 0 })
  ]);

  return {
    stores,
    productionStores,
    organizationName: organization.data?.name ?? "AIO利用組織",
    planKey: organization.data?.plan_key ?? "starter",
    counts: {
      aiLogs: aiLogs.count ?? 0,
      imports: imports.count ?? 0,
      invoices: invoices.count ?? 0,
      growthActions: growthActions.count ?? 0
    }
  };
}

export async function createStoreFromForm(formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。もう一度ログインしてください。");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("店舗名を入力してください。");

  const rawIndustry = String(formData.get("industry_type_key") ?? "general_store");
  const industryTypeKey: IndustryTypeKey = normalizeIndustryTypeKey(rawIndustry);
  const industry = getIndustryConfig(industryTypeKey);
  const useSampleData = String(formData.get("use_sample_data") ?? "") === "yes";

  let organizationId = access.organizationIds[0];
  let createdOwnOrganization = false;
  if (!organizationId) {
    const { data: approvedApplication } = await supabase
      .from("applications")
      .select("id, status, approval_status, payment_status")
      .eq("email", access.email ?? "")
      .in("status", ["approved", "account_issued"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!approvedApplication || approvedApplication.approval_status !== "approved" || approvedApplication.payment_status !== "paid") {
      throw new Error("店舗の作成には利用開始手続きが必要です。公開申し込み後、担当者からの案内をお待ちください。");
    }

    organizationId = randomUUID();
    createdOwnOrganization = true;
    const { error: orgError } = await supabase.from("organizations").insert({
      id: organizationId,
      name: `${name} 運用組織`,
      owner_user_id: access.userId,
      plan_key: "starter"
    });
    if (orgError) throw new Error(`組織を作成できませんでした: ${orgError.message}`);
    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: organizationId,
      user_id: access.userId,
      role_key: "org_owner"
    });
    if (memberError) throw new Error(`組織メンバーを作成できませんでした: ${memberError.message}`);
  }

  if (!createdOwnOrganization && !(await canAccessOrganization(organizationId))) {
    throw new Error("この組織に店舗を作成する権限がありません。");
  }

  const storeId = randomUUID();
  const profileData = {
    data_mode: "production",
    onboarding_status: "started",
    use_sample_data: useSampleData,
    target_customer: String(formData.get("target_customer") ?? "").trim(),
    brand_tone: String(formData.get("brand_tone") ?? "").trim(),
    services: String(formData.get("services") ?? "").split(/[、,\n]/).map((item) => item.trim()).filter(Boolean),
    reservation_method: String(formData.get("reservation_method") ?? "").trim()
  };

  const { error } = await supabase.from("stores").insert({
    id: storeId,
    organization_id: organizationId,
    industry_type_key: industryTypeKey,
    name,
    address: String(formData.get("address") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    website_url: String(formData.get("website_url") ?? "").trim() || null,
    google_business_url: String(formData.get("google_business_url") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim(),
    profile_data: profileData,
    feature_flags: industry.defaultFeatureFlags,
    status: "active"
  });
  if (error) throw new Error(`店舗を保存できませんでした: ${error.message}`);

  await supabase.from("invoice_number_sequences").upsert({
    organization_id: organizationId,
    store_id: storeId,
    prefix: industryTypeKey === "auto_repair" ? "INV-AUTO" : "INV",
    next_number: 1,
    qualified_invoice_issuer_name: name,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });

  await supabase.from("google_business_profiles").upsert({
    organization_id: organizationId,
    store_id: storeId,
    location_name: name,
    address: String(formData.get("address") ?? "").trim(),
    status: "manual_mode",
    metadata: {
      api_status: "manual_mode",
      api_application_result: "not_requested",
      manual_posting_mode: true,
      review_note: "Google投稿は、投稿文を確認してGoogle管理画面へ反映する運用です。"
    },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });

  return storeId;
}
