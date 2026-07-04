import "server-only";
import { generateWithAi } from "@/lib/openai/generate";
import { listBusinessItems, listCustomers, listInventoryStocks } from "@/lib/phase2/business-data";
import { getMonthlyReport, normalizeMonth } from "@/lib/phase2/monthly-report";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { AiTemplateKey, Store } from "@/types/domain";
import type { AiRecommendation, MarketingChannel, MarketingDraft, MarketingDraftStatus } from "@/types/phase3";

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101",
    industryTypeKey: "general_store",
    organizationName: "AIOデモ組織",
    storeName: "AIOサンプル店舗",
    address: "東京都渋谷区",
    phone: "03-0000-0000"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102",
    industryTypeKey: "auto_repair",
    organizationName: "AIOデモ組織",
    storeName: "AIOオート整備",
    address: "神奈川県横浜市",
    phone: "045-000-0000"
  }
} as const;

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function demoConfigFor(storeId: string) {
  return demoPersistence[storeId as keyof typeof demoPersistence];
}

async function ensureDemoPersistence(supabase: SupabaseClient, storeId: string) {
  const config = demoConfigFor(storeId);
  if (!config) return { organizationId: null, storeId };

  await supabase.from("organizations").upsert({
    id: config.organizationId,
    name: config.organizationName,
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: config.storeId,
    organization_id: config.organizationId,
    industry_type_key: config.industryTypeKey,
    name: config.storeName,
    address: config.address,
    phone: config.phone,
    status: "active",
    feature_flags: {
      pdf_export: true,
      monthly_report: true,
      marketing_drafts: true,
      instagram_draft_generation: true,
      google_business_profile_draft: true,
      ai_monthly_recommendations: true,
      image_caption_generation: false,
      demand_alerts: true
    },
    profile_data: {},
    updated_at: new Date().toISOString()
  });

  return { organizationId: config.organizationId, storeId: config.storeId };
}

async function resolveStoreForWrite(supabase: SupabaseClient, store: Store) {
  const demo = await ensureDemoPersistence(supabase, store.id);
  return {
    organizationId: demo.organizationId ?? store.organization_id,
    storeId: demo.storeId,
    industryTypeKey: store.industry_type_key
  };
}

async function resolveStoreForRead(supabase: SupabaseClient, storeId: string) {
  return ensureDemoPersistence(supabase, storeId);
}

function asText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function outputRecord(output: unknown) {
  return output && typeof output === "object" && !Array.isArray(output) ? output as Record<string, unknown> : {};
}

function normalizeDraftOutput(output: unknown) {
  const record = outputRecord(output);
  const body = String(record.caption ?? record.body ?? "");
  return {
    title: String(record.title ?? (body.slice(0, 32) || "AI投稿下書き")),
    body,
    short_body: asText(String(record.short_caption ?? record.short_body ?? "")),
    hashtags: asStringArray(record.hashtags),
    call_to_action: asText(String(record.call_to_action ?? "")),
    recommended_image_idea: asText(String(record.recommended_image_idea ?? "")),
    ai_reasoning: asText(String(record.ai_reasoning ?? ""))
  };
}

function normalizeRecommendationOutput(output: unknown) {
  const record = outputRecord(output);
  return {
    title: String(record.title ?? "AI月次改善提案"),
    good_points: asStringArray(record.good_points),
    cautions: asStringArray(record.cautions),
    next_actions: asStringArray(record.next_actions),
    posting_themes: asStringArray(record.posting_themes),
    inventory_suggestions: asStringArray(record.inventory_suggestions),
    customer_priorities: asStringArray(record.customer_priorities),
    ai_reasoning: asText(String(record.ai_reasoning ?? ""))
  };
}

export async function listMarketingDrafts(storeId: string): Promise<MarketingDraft[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase.from("marketing_drafts").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false });
  return (data ?? []) as MarketingDraft[];
}

export async function getMarketingDraft(storeId: string, draftId: string): Promise<MarketingDraft | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase.from("marketing_drafts").select("*").eq("store_id", resolved.storeId).eq("id", draftId).single();
  return data as MarketingDraft | null;
}

export async function createMarketingDraftFromForm(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForWrite(supabase, store);
  const { error } = await supabase.from("marketing_drafts").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    industry_type_key: resolved.industryTypeKey,
    channel: String(formData.get("channel") ?? "instagram") as MarketingChannel,
    status: String(formData.get("status") ?? "draft") as MarketingDraftStatus,
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    short_body: asText(formData.get("short_body")),
    hashtags: asStringArray(formData.get("hashtags")),
    call_to_action: asText(formData.get("call_to_action")),
    recommended_image_idea: asText(formData.get("recommended_image_idea")),
    source_type: asText(formData.get("source_type")),
    source_id: asText(formData.get("source_id")),
    ai_reasoning: asText(formData.get("ai_reasoning")),
    metadata: {}
  });
  if (error) throw new Error(`投稿下書きの保存に失敗しました: ${error.message}`);
}

export async function updateMarketingDraftFromForm(storeId: string, draftId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { error } = await supabase
    .from("marketing_drafts")
    .update({
      channel: String(formData.get("channel") ?? "instagram") as MarketingChannel,
      status: String(formData.get("status") ?? "draft") as MarketingDraftStatus,
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      short_body: asText(formData.get("short_body")),
      hashtags: asStringArray(formData.get("hashtags")),
      call_to_action: asText(formData.get("call_to_action")),
      recommended_image_idea: asText(formData.get("recommended_image_idea")),
      ai_reasoning: asText(formData.get("ai_reasoning")),
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", draftId);
  if (error) throw new Error(`投稿下書きの更新に失敗しました: ${error.message}`);
}

export async function generateMarketingDraft(storeId: string, channel: MarketingChannel, postType = "latest_info") {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStoreForWrite(supabase, store);
  const [items, stocks, customers, report] = await Promise.all([
    listBusinessItems(store.id),
    listInventoryStocks(store.id),
    listCustomers(store.id),
    getMonthlyReport(store.id, new Date().toISOString().slice(0, 7))
  ]);
  const templateKey: AiTemplateKey = channel === "google_business_profile" ? "google_business_profile_draft" : "instagram_draft_generation";
  const result = await generateWithAi({
    store: { ...store, id: resolved.storeId, organization_id: resolved.organizationId ?? store.organization_id },
    templateKey,
    input: {
      channel,
      postType,
      store,
      items: items.slice(0, 8),
      stocks: stocks.slice(0, 8),
      customers_count: customers.length,
      monthly_report: report
    },
    userId: null
  });
  if (result.log.status !== "success") {
    throw new Error(result.log.error_message ?? "AI投稿下書き生成に失敗しました。");
  }
  const draft = normalizeDraftOutput(result.output);
  const { data, error } = await supabase
    .from("marketing_drafts")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      industry_type_key: resolved.industryTypeKey,
      channel,
      status: "draft",
      title: draft.title,
      body: draft.body,
      short_body: draft.short_body,
      hashtags: draft.hashtags,
      call_to_action: draft.call_to_action,
      recommended_image_idea: draft.recommended_image_idea,
      source_type: "ai_generation",
      source_id: result.log.template_id,
      ai_reasoning: draft.ai_reasoning,
      metadata: { postType, ai_output: result.output }
    })
    .select("id")
    .single();
  if (error) throw new Error(`AI投稿下書きの保存に失敗しました: ${error.message}`);
  return data?.id as string;
}

export async function listAiRecommendations(storeId: string): Promise<AiRecommendation[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase.from("ai_recommendations").select("*").eq("store_id", resolved.storeId).order("created_at", { ascending: false });
  return (data ?? []) as AiRecommendation[];
}

export async function getAiRecommendation(storeId: string, recommendationId: string): Promise<AiRecommendation | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStoreForRead(supabase, storeId);
  const { data } = await supabase.from("ai_recommendations").select("*").eq("store_id", resolved.storeId).eq("id", recommendationId).single();
  return data as AiRecommendation | null;
}

export async function generateMonthlyRecommendation(storeId: string, month: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const targetMonth = normalizeMonth(month);
  const resolved = await resolveStoreForWrite(supabase, store);
  const [items, stocks, customers, report] = await Promise.all([
    listBusinessItems(store.id),
    listInventoryStocks(store.id),
    listCustomers(store.id),
    getMonthlyReport(store.id, targetMonth)
  ]);
  const result = await generateWithAi({
    store: { ...store, id: resolved.storeId, organization_id: resolved.organizationId ?? store.organization_id },
    templateKey: "ai_monthly_recommendations",
    input: { month: targetMonth, report, items: items.slice(0, 10), stocks: stocks.slice(0, 10), customers_count: customers.length },
    userId: null
  });
  if (result.log.status !== "success") {
    throw new Error(result.log.error_message ?? "AI改善提案生成に失敗しました。");
  }
  const recommendation = normalizeRecommendationOutput(result.output);
  const { data, error } = await supabase
    .from("ai_recommendations")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      industry_type_key: resolved.industryTypeKey,
      month: targetMonth,
      title: recommendation.title,
      good_points: recommendation.good_points,
      cautions: recommendation.cautions,
      next_actions: recommendation.next_actions,
      posting_themes: recommendation.posting_themes,
      inventory_suggestions: recommendation.inventory_suggestions,
      customer_priorities: recommendation.customer_priorities,
      source_report: report,
      ai_reasoning: recommendation.ai_reasoning
    })
    .select("id")
    .single();
  if (error) throw new Error(`AI改善提案の保存に失敗しました: ${error.message}`);
  return data?.id as string;
}

export async function createDraftFromRecommendation(storeId: string, recommendationId: string) {
  const recommendation = await getAiRecommendation(storeId, recommendationId);
  if (!recommendation) return null;
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await resolveStoreForWrite(supabase, store);
  const theme = recommendation.posting_themes[0] ?? recommendation.title;
  const { data, error } = await supabase
    .from("marketing_drafts")
    .insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      industry_type_key: resolved.industryTypeKey,
      channel: "instagram",
      status: "draft",
      title: `投稿テーマ: ${theme}`,
      body: `${theme}について投稿します。\n\n${recommendation.next_actions[0] ?? "来店・予約につながる内容を発信しましょう。"}`,
      short_body: theme,
      hashtags: ["#AIOGrowthPartner"],
      call_to_action: "詳しくは店舗までお問い合わせください",
      recommended_image_idea: "店舗、商品、作業風景などテーマが伝わる写真",
      source_type: "ai_recommendation",
      source_id: recommendation.id,
      ai_reasoning: recommendation.ai_reasoning,
      metadata: { recommendation_id: recommendation.id }
    })
    .select("id")
    .single();
  if (error) throw new Error(`提案から投稿下書きを作成できませんでした: ${error.message}`);
  return data?.id as string;
}
