import "server-only";

import { getIndustryConfig } from "@/config/industries";
import { normalizeIndustryTypeKey, publicIndustryOptions } from "@/lib/applications/options";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { IndustryTypeKey, Store } from "@/types/domain";
import { mayConfirmInitialSetup, parseInitialSetupForm } from "./initial-setup-rules";

type JsonRecord = Record<string, unknown>;

export type InitialSetupMenuCandidate = {
  index: number;
  name: string;
  itemType: "service";
  unitPrice: number;
  taxRate: 10;
  taxInclusion: "inclusive";
};

export type InitialSetupReview = {
  store: Store;
  snapshotId: string;
  confirmationStatus: "pending" | "applying" | "completed";
  menus: InitialSetupMenuCandidate[];
  invoice: {
    issuerName: string;
    registrationNumber: string;
    prefix: string;
  };
  industryOptions: Array<{ key: string; label: string }>;
  industryPresets: Record<string, { dashboardCards: Array<{ key: string; label: string }>; recommendedFeatures: string[] }>;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean))).slice(0, 30)
    : [];
}

const dashboardCardLabels: Record<string, string> = {
  store_profile_completion: "店舗プロフィールの充実度",
  ai_post_generation: "AI投稿文の作成",
  review_reply: "口コミ返信の下書き",
  aio_score: "AIおすすめ準備度",
  instagram_post: "Instagram投稿支援",
  repair_service_visibility: "対応サービスの見える化"
};

const featureLabels: Record<string, string> = {
  aio_diagnosis: "AIO改善",
  ai_post_generation: "AI投稿文作成",
  ai_review_reply: "口コミ返信支援",
  product_management: "商品・サービス管理",
  inventory_management: "在庫管理",
  customer_management: "顧客管理",
  estimate_management: "見積書",
  invoice_management: "請求書・領収書",
  data_imports: "AIデータ取込",
  sales_reports: "売上分析",
  growth_action_center: "集客アクション",
  google_integrations: "Google連携"
};

async function requireOwner(store: Store) {
  const access = await getCurrentUserAccess();
  if (!mayConfirmInitialSetup(access, store.organization_id)) {
    throw new Error("初期設定を確定できるのは店舗オーナーだけです。");
  }
  return access!;
}

export async function canCurrentUserConfirmInitialSetup(store: Store) {
  return mayConfirmInitialSetup(await getCurrentUserAccess(), store.organization_id);
}

export async function getInitialSetupReview(storeId: string): Promise<InitialSetupReview | null> {
  const store = await getStore(storeId);
  await requireOwner(store);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const [{ data: snapshot }, { data: invoice }] = await Promise.all([
    supabase.from("onboarding_snapshots").select("*")
      .eq("store_id", store.id).eq("snapshot_type", "application_intake").maybeSingle(),
    supabase.from("invoice_number_sequences")
      .select("prefix, registration_number, qualified_invoice_issuer_name").eq("store_id", store.id).maybeSingle()
  ]);
  if (!snapshot) return null;

  const content = record(snapshot.content);
  const extracted = record(content.extracted_profile);
  const services = strings(extracted.services);
  const industryOptions = [{ key: "general_store", label: "汎用店舗" }, ...publicIndustryOptions.map((option) => ({ key: option.key, label: option.label }))];
  const industryPresets = Object.fromEntries(industryOptions.map((option) => {
    const config = getIndustryConfig(normalizeIndustryTypeKey(option.key));
    return [option.key, {
      dashboardCards: config.dashboardCards.map((key) => ({ key, label: dashboardCardLabels[key] ?? key })),
      recommendedFeatures: Object.entries(config.defaultFeatureFlags)
        .filter(([key, enabled]) => enabled && featureLabels[key])
        .map(([key]) => featureLabels[key])
    }];
  }));
  return {
    store,
    snapshotId: String(snapshot.id),
    confirmationStatus: ["pending", "applying", "completed"].includes(String(snapshot.confirmation_status))
      ? snapshot.confirmation_status as InitialSetupReview["confirmationStatus"]
      : "pending",
    menus: services.map((name, index) => ({ index, name, itemType: "service", unitPrice: 0, taxRate: 10, taxInclusion: "inclusive" })),
    invoice: {
      issuerName: String(invoice?.qualified_invoice_issuer_name ?? store.name),
      registrationNumber: String(invoice?.registration_number ?? ""),
      prefix: String(invoice?.prefix ?? (store.industry_type_key === "auto_repair" ? "INV-AUTO" : "INV"))
    },
    industryOptions,
    industryPresets
  };
}

export type ConfirmInitialSetupResult = { completed: true; alreadyCompleted: boolean; selectedMenuCount: number };

export async function confirmInitialSetup(storeId: string, formData: FormData): Promise<ConfirmInitialSetupResult> {
  const store = await getStore(storeId);
  const access = await requireOwner(store);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("初期設定を保存する準備が完了していません。");

  const { data: snapshot, error: snapshotError } = await supabase.from("onboarding_snapshots")
    .select("*").eq("store_id", store.id).eq("snapshot_type", "application_intake").maybeSingle();
  if (snapshotError || !snapshot) throw new Error("AIが準備した初期設定を確認できません。");
  if (snapshot.confirmation_status === "completed") {
    return { completed: true, alreadyCompleted: true, selectedMenuCount: 0 };
  }
  if (snapshot.confirmation_status === "applying") {
    throw new Error("初期設定を反映しています。少し待ってから画面を更新してください。");
  }

  const extracted = record(record(snapshot.content).extracted_profile);
  const candidateCount = strings(extracted.services).length;
  const input = parseInitialSetupForm(formData, String(snapshot.id), candidateCount);
  const normalizedIndustry = normalizeIndustryTypeKey(input.industryTypeKey) as IndustryTypeKey;
  if (normalizedIndustry !== input.industryTypeKey) throw new Error("選択した業種を確認してください。");
  const industry = getIndustryConfig(normalizedIndustry);
  if (input.menus.some((menu) => menu.enabled && menu.taxRate === 8) && !["restaurant", "retail"].includes(normalizedIndustry)) {
    throw new Error("8%の軽減税率は対象となる業種・商品だけに設定できます。");
  }

  const selectedMenus = input.menus.filter((menu) => menu.enabled);
  const now = new Date().toISOString();
  const confirmationPayload = {
    store: {
      name: input.storeName,
      industry_type_key: normalizedIndustry,
      address: input.address,
      phone: input.phone,
      website_url: input.websiteUrl,
      description: input.description
    },
    invoice: {
      qualified_invoice_issuer_name: input.invoiceIssuerName,
      registration_number: input.invoiceRegistrationNumber,
      prefix: input.invoicePrefix
    },
    menus: input.menus,
    dashboard: { industry_type_key: normalizedIndustry, cards: industry.dashboardCards },
    confirmed_by: access.userId,
    confirmed_at: now
  };

  const { data: claimed, error: claimError } = await supabase.from("onboarding_snapshots").update({
    confirmation_status: "applying",
    confirmation_payload: confirmationPayload,
    updated_at: now
  }).eq("id", snapshot.id).eq("confirmation_status", "pending").select("id").maybeSingle();
  if (claimError || !claimed) {
    const { data: current } = await supabase.from("onboarding_snapshots").select("confirmation_status").eq("id", snapshot.id).maybeSingle();
    if (current?.confirmation_status === "completed") return { completed: true, alreadyCompleted: true, selectedMenuCount: 0 };
    throw new Error("初期設定は別の画面で処理中です。少し待ってから更新してください。");
  }

  try {
    const currentProfile = record(store.profile_data);
    const { error: storeError } = await supabase.from("stores").update({
      industry_type_key: normalizedIndustry,
      name: input.storeName,
      address: input.address || null,
      phone: input.phone || null,
      website_url: input.websiteUrl || null,
      description: input.description || null,
      feature_flags: industry.defaultFeatureFlags,
      profile_data: {
        ...currentProfile,
        services: selectedMenus.map((menu) => menu.name),
        onboarding_status: "completed",
        initial_setup_confirmed_at: now,
        initial_setup_confirmed_by: access.userId,
        dashboard_plan: { industry_type_key: normalizedIndustry, cards: industry.dashboardCards }
      },
      updated_at: now
    }).eq("id", store.id).eq("organization_id", store.organization_id);
    if (storeError) throw new Error(`店舗情報を反映できませんでした: ${storeError.message}`);

    const { error: invoiceError } = await supabase.from("invoice_number_sequences").upsert({
      organization_id: store.organization_id,
      store_id: store.id,
      prefix: input.invoicePrefix,
      registration_number: input.invoiceRegistrationNumber || null,
      qualified_invoice_issuer_name: input.invoiceIssuerName,
      updated_at: now
    }, { onConflict: "store_id" });
    if (invoiceError) throw new Error(`請求書設定を反映できませんでした: ${invoiceError.message}`);

    if (selectedMenus.length > 0) {
      const { data: items, error: itemError } = await supabase.from("items").upsert(selectedMenus.map((menu) => ({
        organization_id: store.organization_id,
        store_id: store.id,
        industry_type_key: normalizedIndustry,
        onboarding_source_key: menu.sourceKey,
        item_type: menu.itemType,
        name: menu.name,
        unit: menu.itemType === "service" ? "回" : "個",
        unit_price: menu.unitPrice,
        cost_price: 0,
        tax_rate: menu.taxRate,
        is_stock_managed: menu.itemType !== "service",
        status: "active",
        archived_at: null,
        archived_by: null,
        metadata: {
          tax_inclusion: menu.taxInclusion,
          initial_setup_candidate: true,
          source_snapshot_id: snapshot.id,
          confirmed_by: access.userId
        },
        updated_at: now
      })), { onConflict: "store_id,onboarding_source_key" }).select("id, is_stock_managed");
      if (itemError) throw new Error(`メニュー候補を反映できませんでした: ${itemError.message}`);
      const stockItems = (items ?? []).filter((item) => item.is_stock_managed);
      if (stockItems.length > 0) {
        const { error: stockError } = await supabase.from("inventory_stocks").upsert(stockItems.map((item) => ({
          organization_id: store.organization_id,
          store_id: store.id,
          item_id: item.id,
          quantity: 0,
          reorder_point: 0,
          updated_at: now
        })), { onConflict: "item_id" });
        if (stockError) throw new Error(`在庫の初期状態を反映できませんでした: ${stockError.message}`);
      }
    }

    for (const menu of input.menus.filter((candidate) => !candidate.enabled)) {
      await supabase.from("items").update({ archived_at: now, archived_by: access.userId, updated_at: now })
        .eq("store_id", store.id).eq("onboarding_source_key", menu.sourceKey).is("archived_at", null);
    }

    const { error: completeError } = await supabase.from("onboarding_snapshots").update({
      confirmation_status: "completed",
      confirmation_payload: confirmationPayload,
      confirmed_at: now,
      confirmed_by: access.userId,
      updated_at: now
    }).eq("id", snapshot.id).eq("confirmation_status", "applying");
    if (completeError) throw new Error(`初期設定の完了状態を保存できませんでした: ${completeError.message}`);

    await supabase.from("applications").update({ onboarding_status: "completed", updated_at: now })
      .eq("store_id", store.id);
    await logAuditEvent({
      storeId: store.id,
      actionType: "initial_setup_confirmed",
      targetType: "onboarding_snapshot",
      targetId: String(snapshot.id),
      message: "店舗オーナーがAI初期設定を確認し、正式データへ反映しました。",
      metadata: { confirmed_by: access.userId, selected_menu_count: selectedMenus.length, industry_type_key: normalizedIndustry }
    });
    return { completed: true, alreadyCompleted: false, selectedMenuCount: selectedMenus.length };
  } catch (error) {
    await supabase.from("onboarding_snapshots").update({ confirmation_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", snapshot.id).eq("confirmation_status", "applying");
    throw error;
  }
}
