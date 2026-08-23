import "server-only";

import { getIndustryConfig } from "@/config/industries";
import { normalizeIndustryTypeKey, publicIndustryOptions } from "@/lib/applications/options";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { IndustryTypeKey, Store } from "@/types/domain";
import { mayConfirmInitialSetup, parseInitialSetupForm, type InitialSetupInput } from "./initial-setup-rules";
import { normalizeOperatingModel, operatingModelFeatureFlags, type OperatingLocation, type OperatingModel } from "@/lib/applications/operating-model";

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
  aiRecommendedFeatures: string[];
  operatingModel: OperatingModel;
  additionalLocations: OperatingLocation[];
  evidenceSources: Array<{ url: string; label: string }>;
  preparedSummary: {
    storeFieldCount: number;
    menuCount: number;
    featureCount: number;
    externalSystemCount: number;
    additionalLocationCount: number;
  };
  savedDraft: InitialSetupInput | null;
  savedDraftStep: number;
  savedSkippedSteps: string[];
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean))).slice(0, 30)
    : [];
}

function safeSourceUrls(...values: unknown[]) {
  return Array.from(new Set(values.flatMap((value) => strings(value)).flatMap((candidate) => {
    try {
      const url = new URL(candidate);
      return ["http:", "https:"].includes(url.protocol) ? [url.toString()] : [];
    } catch {
      return [];
    }
  }))).slice(0, 8);
}

function sourceLabel(urlValue: string) {
  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace(/^www\./u, "");
    if (hostname.includes("google.")) return "Googleの公開情報";
    if (hostname.includes("tabelog.com")) return "食べログ";
    if (hostname.includes("hotpepper.jp")) return "ホットペッパー";
    return hostname;
  } catch {
    return "公開ページ";
  }
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
  const savedDraftRecord = record(record(snapshot.confirmation_payload).draft);
  const extracted = record(content.extracted_profile);
  const aiDashboardPlan = record(content.ai_dashboard_plan);
  const aiRecommendedFeatures = Array.isArray(aiDashboardPlan.recommended_modules)
    ? aiDashboardPlan.recommended_modules.map((item) => String(record(item).label ?? "").trim()).filter(Boolean).slice(0, 20)
    : [];
  const services = strings(extracted.services);
  const evidenceSourceUrls = safeSourceUrls(
    content.reference_urls,
    extracted.source_urls,
    [content.website_url, content.google_maps_url, store.website_url, store.google_business_url]
  );
  const operatingModel = normalizeOperatingModel(content.operating_model ?? store.operating_model);
  const additionalLocations = operatingModel.structure.locations.filter((location) => {
    const sameName = location.name && location.name === store.name;
    const sameAddress = location.address && location.address === store.address;
    return !(sameName || sameAddress);
  }).slice(0, 9);
  operatingModel.structure.locations = [{
    name: store.name,
    address: store.address ?? "",
    websiteUrl: store.website_url ?? "",
    companyName: operatingModel.structure.companyNames[0] ?? "",
    brandName: store.brand_name ?? operatingModel.structure.brandNames[0] ?? "",
    source: "published"
  }, ...additionalLocations];
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
    industryPresets,
    aiRecommendedFeatures,
    operatingModel,
    additionalLocations,
    evidenceSources: evidenceSourceUrls.map((url) => ({ url, label: sourceLabel(url) })),
    preparedSummary: {
      storeFieldCount: [store.name, store.address, store.phone, store.website_url, store.description].filter(Boolean).length,
      menuCount: services.length,
      featureCount: new Set([...aiRecommendedFeatures, ...(industryPresets[store.industry_type_key]?.recommendedFeatures ?? [])]).size,
      externalSystemCount: Object.values(operatingModel.systems).filter((system) => system.serviceNames.length > 0).length,
      additionalLocationCount: additionalLocations.length
    },
    savedDraft: Object.keys(savedDraftRecord).length ? savedDraftRecord as InitialSetupInput : null,
    savedDraftStep: Math.min(7, Math.max(0, Number(record(snapshot.confirmation_payload).draft_step) || 0)),
    savedSkippedSteps: strings(record(snapshot.confirmation_payload).draft_skipped_steps).slice(0, 6)
  };
}

export async function saveInitialSetupDraft(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const access = await requireOwner(store);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("初期設定を保存する準備が完了していません。");
  const { data: snapshot, error } = await supabase.from("onboarding_snapshots")
    .select("id, content, confirmation_status, confirmation_payload")
    .eq("store_id", store.id).eq("snapshot_type", "application_intake").maybeSingle();
  if (error || !snapshot) throw new Error("AIが準備した初期設定を確認できません。");
  if (snapshot.confirmation_status !== "pending") throw new Error("初期設定はすでに反映中または完了しています。");

  const snapshotContent = record(snapshot.content);
  const extracted = record(snapshotContent.extracted_profile);
  const candidateCount = strings(extracted.services).length;
  const fallback = normalizeOperatingModel(snapshotContent.operating_model ?? store.operating_model);
  const additionalLocations = fallback.structure.locations.filter((location) => {
    const sameName = location.name && location.name === store.name;
    const sameAddress = location.address && location.address === store.address;
    return !(sameName || sameAddress);
  }).slice(0, 9);
  fallback.structure.locations = [{
    name: store.name,
    address: store.address ?? "",
    websiteUrl: store.website_url ?? "",
    companyName: fallback.structure.companyNames[0] ?? "",
    brandName: store.brand_name ?? fallback.structure.brandNames[0] ?? "",
    source: "published"
  }, ...additionalLocations];
  const safeForm = new FormData();
  for (const [key, value] of formData.entries()) safeForm.append(key, value);
  safeForm.set("final_confirmation", "on");
  const draft = parseInitialSetupForm(safeForm, String(snapshot.id), candidateCount, fallback);
  const now = new Date().toISOString();
  const { error: saveError } = await supabase.from("onboarding_snapshots").update({
    confirmation_payload: {
      ...record(snapshot.confirmation_payload),
      draft,
      draft_step: Math.min(7, Math.max(0, Number(formData.get("conversation_step")) || 0)),
      draft_skipped_steps: String(formData.get("skipped_steps") ?? "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 6),
      draft_saved_at: now,
      draft_saved_by: access.userId
    },
    updated_at: now
  }).eq("id", snapshot.id).eq("confirmation_status", "pending");
  if (saveError) throw new Error(`途中までの回答を保存できませんでした: ${saveError.message}`);
  await logAuditEvent({
    storeId: store.id,
    actionType: "initial_setup_draft_saved",
    targetType: "onboarding_snapshot",
    targetId: String(snapshot.id),
    message: "店舗オーナーが会話型初期設定を途中保存しました。",
    metadata: { saved_by: access.userId }
  });
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
  const snapshotContent = record(snapshot.content);
  const setupModel = normalizeOperatingModel(snapshotContent.operating_model ?? store.operating_model);
  const setupAdditionalLocations = setupModel.structure.locations.filter((location) => {
    const sameName = location.name && location.name === store.name;
    const sameAddress = location.address && location.address === store.address;
    return !(sameName || sameAddress);
  }).slice(0, 9);
  setupModel.structure.locations = [{
    name: store.name,
    address: store.address ?? "",
    websiteUrl: store.website_url ?? "",
    companyName: setupModel.structure.companyNames[0] ?? "",
    brandName: store.brand_name ?? setupModel.structure.brandNames[0] ?? "",
    source: "published"
  }, ...setupAdditionalLocations];
  const input = parseInitialSetupForm(formData, String(snapshot.id), candidateCount, setupModel);
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
    dashboard: {
      ...record(record(store.profile_data).dashboard_plan),
      industry_type_key: normalizedIndustry,
      cards: industry.dashboardCards
    },
    operating_model: input.operatingModel,
    additional_locations: input.additionalLocations,
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
      feature_flags: { ...(store.feature_flags ?? {}), ...industry.defaultFeatureFlags, ...operatingModelFeatureFlags(input.operatingModel) },
      brand_name: input.operatingModel.structure.locations[0]?.brandName || input.operatingModel.structure.brandNames[0] || null,
      operating_model: input.operatingModel,
      profile_data: {
        ...currentProfile,
        services: selectedMenus.map((menu) => menu.name),
        onboarding_status: "completed",
        initial_setup_confirmed_at: now,
        initial_setup_confirmed_by: access.userId,
        dashboard_plan: {
          ...record(currentProfile.dashboard_plan),
          industry_type_key: normalizedIndustry,
          cards: industry.dashboardCards
        }
      },
      updated_at: now
    }).eq("id", store.id).eq("organization_id", store.organization_id);
    if (storeError) throw new Error(`店舗情報を反映できませんでした: ${storeError.message}`);

    const { error: organizationError } = await supabase.from("organizations").update({ operating_model: input.operatingModel, updated_at: now }).eq("id", store.organization_id);
    if (organizationError) throw new Error(`組織の運営設定を反映できませんでした: ${organizationError.message}`);

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

    for (const location of input.additionalLocations) {
      const { data: addedStore, error: addedStoreError } = await supabase.from("stores").upsert({
        organization_id: store.organization_id,
        source_application_id: snapshot.application_id,
        onboarding_source_key: location.sourceKey,
        industry_type_key: normalizedIndustry,
        name: location.name,
        brand_name: location.brandName || null,
        address: location.address || null,
        website_url: location.websiteUrl || null,
        phone: null,
        description: null,
        profile_data: {
          data_mode: "production",
          onboarding_status: "not_started",
          created_from_initial_setup_store_id: store.id,
          dashboard_plan: { industry_type_key: normalizedIndustry, cards: industry.dashboardCards }
        },
        feature_flags: { ...industry.defaultFeatureFlags, ...operatingModelFeatureFlags(input.operatingModel) },
        operating_model: input.operatingModel,
        status: "active",
        archived_at: null,
        archived_by: null,
        updated_at: now
      }, { onConflict: "organization_id,onboarding_source_key" }).select("id").single();
      if (addedStoreError || !addedStore) throw new Error(`追加店舗「${location.name}」を作成できませんでした: ${addedStoreError?.message ?? "unknown"}`);
      const { error: addedInvoiceError } = await supabase.from("invoice_number_sequences").upsert({
        organization_id: store.organization_id,
        store_id: addedStore.id,
        prefix: normalizedIndustry === "auto_repair" ? "INV-AUTO" : "INV",
        next_number: 1,
        qualified_invoice_issuer_name: location.companyName || input.invoiceIssuerName,
        updated_at: now
      }, { onConflict: "store_id" });
      if (addedInvoiceError) throw new Error(`追加店舗「${location.name}」の請求書設定を作成できませんでした: ${addedInvoiceError.message}`);
      const { error: addedSnapshotError } = await supabase.from("onboarding_snapshots").upsert({
        organization_id: store.organization_id,
        store_id: addedStore.id,
        application_id: snapshot.application_id,
        snapshot_type: "application_intake",
        title: "複数店舗候補から作成した初期設定下書き",
        content: {
          ...snapshotContent,
          extracted_profile: { ...extracted, store_name: location.name, address: location.address, website_url: location.websiteUrl },
          operating_model: input.operatingModel,
          parent_setup_snapshot_id: snapshot.id
        },
        status: "active",
        confirmation_status: "pending",
        updated_at: now
      }, { onConflict: "store_id,snapshot_type" });
      if (addedSnapshotError) throw new Error(`追加店舗「${location.name}」の初期設定下書きを作成できませんでした: ${addedSnapshotError.message}`);
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
      metadata: { confirmed_by: access.userId, selected_menu_count: selectedMenus.length, industry_type_key: normalizedIndustry, additional_store_count: input.additionalLocations.length }
    });
    return { completed: true, alreadyCompleted: false, selectedMenuCount: selectedMenus.length };
  } catch (error) {
    await supabase.from("onboarding_snapshots").update({ confirmation_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", snapshot.id).eq("confirmation_status", "applying");
    throw error;
  }
}
