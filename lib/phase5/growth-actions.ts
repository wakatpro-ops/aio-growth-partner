import "server-only";
import { generateWithAi } from "@/lib/openai/generate";
import { getSalesReport } from "@/lib/phase4/sales-import-data";
import { listDemandForecasts, listInventoryAlerts, listRecommendedActions } from "@/lib/phase4/demand-actions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";
import type { Store } from "@/types/domain";
import type {
  ExternalChannelAccount,
  GrowthAction,
  GrowthActionChannel,
  GrowthActionScheduleItem,
  GrowthActionStatus
} from "@/types/phase5";

const demoPersistence = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
} as const;

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type AiGrowthAction = {
  target_channel?: string;
  title?: string;
  summary?: string;
  priority?: string;
  reason?: string;
  recommended_date?: string | null;
  draft?: {
    title?: string;
    body?: string;
    short_body?: string | null;
    hashtags?: string[] | string;
    call_to_action?: string | null;
  };
};

const channelLabels: Record<GrowthActionChannel, string> = {
  google_business_profile: "Google投稿",
  instagram: "Instagram投稿",
  review_reply: "クチコミ返信",
  customer_message: "既存顧客案内",
  store_pop: "店頭POP",
  line: "LINE配信",
  other: "その他"
};

function persistenceFor(store: Store) {
  const demo = demoPersistence[store.id as keyof typeof demoPersistence];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id
  };
}

async function ensureDemoPersistence(supabase: SupabaseClient, store: Store) {
  const resolved = persistenceFor(store);
  if (!demoPersistence[store.id as keyof typeof demoPersistence]) return resolved;

  await supabase.from("organizations").upsert({
    id: resolved.organizationId,
    name: "AIOデモ組織",
    plan_key: "starter",
    updated_at: new Date().toISOString()
  });

  await supabase.from("stores").upsert({
    id: resolved.storeId,
    organization_id: resolved.organizationId,
    industry_type_key: store.industry_type_key,
    name: store.name,
    address: store.address,
    phone: store.phone,
    status: "active",
    feature_flags: {
      ...(store.feature_flags ?? {}),
      growth_action_center: true,
      google_business_profile_drafts: true,
      instagram_drafts: true,
      review_reply_drafts: true,
      customer_message_drafts: true,
      pop_copy_drafts: true,
      line_message_drafts: true,
      growth_calendar: true,
      draft_approval_flow: true,
      draft_editing: true,
      channel_previews: true,
      external_channel_accounts: true,
      google_integrations: true,
      google_oauth_connection: true,
      google_business_profile_integration: true,
      gmail_draft_integration: true,
      google_calendar_integration: true,
      external_publish_jobs: true
    },
    profile_data: store.profile_data ?? {},
    updated_at: new Date().toISOString()
  });

  return resolved;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeChannel(value: unknown): GrowthActionChannel {
  const channel = String(value ?? "other");
  if (["google_business_profile", "instagram", "review_reply", "customer_message", "store_pop", "line"].includes(channel)) {
    return channel as GrowthActionChannel;
  }
  return "other";
}

function providerFor(channel: GrowthActionChannel) {
  const providers: Record<GrowthActionChannel, string | null> = {
    google_business_profile: "google_business_profile",
    instagram: "instagram",
    review_reply: "manual",
    customer_message: "manual",
    store_pop: "print",
    line: "line",
    other: null
  };
  return providers[channel];
}

function scheduledAt(date: string | null | undefined) {
  const value = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : nextActionDate(0);
  return `${value}T09:00:00.000Z`;
}

function nextActionDate(index: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + index + 1);
  return date.toISOString().slice(0, 10);
}

function fallbackAiActions(store: Store): AiGrowthAction[] {
  const isAuto = store.industry_type_key === "auto_repair";
  const common = isAuto
    ? {
        subject: "季節点検",
        body: "点検、オイル交換、タイヤ交換、車検前点検など、安全運転につながる整備相談を受け付けています。気になる症状は早めにご相談ください。",
        cta: "点検予約・整備相談はこちら"
      }
    : {
        subject: "今月のおすすめ",
        body: "今月おすすめの商品・サービスをご紹介します。気になる方はお気軽にお問い合わせください。",
        cta: "ご来店・お問い合わせをお待ちしています"
      };
  return [
    { target_channel: "google_business_profile", title: `Google投稿: ${common.subject}`, summary: "検索経由の問い合わせを増やす投稿です。", priority: "high", reason: "検索されやすいテーマを使えるためです。", draft: { title: `${common.subject}のご案内`, body: common.body, call_to_action: common.cta } },
    { target_channel: "instagram", title: `Instagram投稿: ${common.subject}`, summary: "写真付きで認知を作る投稿です。", priority: "high", reason: "視覚的に安心感を伝えられるためです。", draft: { title: `${common.subject}のお知らせ`, body: common.body, hashtags: isAuto ? ["#自動車整備", "#点検", "#車検"] : ["#おすすめ", "#地域店舗"], call_to_action: common.cta } },
    { target_channel: "review_reply", title: "クチコミ返信案", summary: "信頼感を高める返信文です。", priority: "medium", reason: "返信が次の来店前の安心材料になるためです。", draft: { title: "クチコミ返信テンプレート", body: `このたびは${store.name}をご利用いただきありがとうございます。今後も丁寧で分かりやすい対応を心がけてまいります。` } },
    { target_channel: "customer_message", title: "既存顧客への案内", summary: "再来店を促す案内文です。", priority: "medium", reason: "過去利用者に相談のきっかけを作れるためです。", draft: { title: `${common.subject}のご案内`, body: `いつも${store.name}をご利用いただきありがとうございます。${common.body}`, call_to_action: common.cta } },
    { target_channel: "store_pop", title: "店頭POP文", summary: "店頭で相談を生む短文です。", priority: "medium", reason: "来店中のお客様に気づきを作れるためです。", draft: { title: common.subject, body: isAuto ? "気になる音・違和感、そのままにしていませんか？早めの点検で安心運転。" : "気になる方はスタッフまでお気軽にどうぞ。", call_to_action: "スタッフまでお声がけください" } },
    { target_channel: "line", title: "LINE配信用文章", summary: "短く届きやすい配信用文章です。", priority: "medium", reason: "既存顧客へ直接届けられるためです。", draft: { title: `${common.subject}のお知らせ`, body: `【${store.name}】${common.body}`, call_to_action: common.cta } }
  ];
}

function normalizeAiActions(output: unknown, store: Store) {
  const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
  const raw = Array.isArray(record.actions) ? record.actions : fallbackAiActions(store);
  return raw.slice(0, 12).map((value, index) => {
    const item = value && typeof value === "object" ? value as AiGrowthAction : {};
    const channel = normalizeChannel(item.target_channel);
    const draft = item.draft ?? {};
    return {
      target_channel: channel,
      title: String(item.title ?? `${channelLabels[channel]}下書き`),
      summary: String(item.summary ?? `${channelLabels[channel]}に使う文章下書きです。`),
      priority: ["low", "medium", "high"].includes(String(item.priority)) ? String(item.priority) : "medium",
      reason: String(item.reason ?? "AI提案を実行用の文章に変換しました。"),
      recommended_date: item.recommended_date ? String(item.recommended_date) : nextActionDate(index),
      draft: {
        channel,
        title: String(draft.title ?? item.title ?? `${channelLabels[channel]}下書き`),
        body: String(draft.body ?? item.summary ?? ""),
        short_body: draft.short_body ? String(draft.short_body) : null,
        hashtags: asStringArray(draft.hashtags),
        call_to_action: draft.call_to_action ? String(draft.call_to_action) : null
      }
    };
  });
}

async function latestSalesAiReport(supabase: SupabaseClient, storeId: string) {
  const { data } = await supabase
    .from("sales_ai_reports")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function listGrowthActions(storeId: string): Promise<GrowthAction[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*), schedule_items:growth_action_schedule_items(*), approvals:growth_action_approvals(*)")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as GrowthAction[];
}

export async function getGrowthAction(storeId: string, actionId: string): Promise<GrowthAction | null> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*), schedule_items:growth_action_schedule_items(*), approvals:growth_action_approvals(*)")
    .eq("store_id", resolved.storeId)
    .eq("id", actionId)
    .maybeSingle();
  return data as GrowthAction | null;
}

export async function generateGrowthActions(storeId: string) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const [salesReport, aiReport, forecasts, alerts, recommendedActions] = await Promise.all([
    getSalesReport(store.id),
    latestSalesAiReport(supabase, resolved.storeId),
    listDemandForecasts(store.id),
    listInventoryAlerts(store.id),
    listRecommendedActions(store.id)
  ]);

  const ai = await generateWithAi({
    store: { ...store, id: resolved.storeId, organization_id: resolved.organizationId },
    templateKey: "growth_action_draft_generation",
    input: {
      sales_report: salesReport,
      sales_ai_report: aiReport,
      demand_forecasts: forecasts.slice(0, 8),
      inventory_alerts: alerts.slice(0, 8),
      recommended_actions: recommendedActions.slice(0, 8),
      required_channels: ["google_business_profile", "instagram", "review_reply", "customer_message", "store_pop", "line"]
    }
  });
  if (ai.log.status !== "success") {
    throw new Error(ai.log.error_message ?? "集客アクション生成に失敗しました。");
  }

  const normalized = normalizeAiActions(ai.output, store);
  await supabase.from("growth_action_drafts").delete().eq("store_id", resolved.storeId);
  await supabase.from("growth_actions").delete().eq("store_id", resolved.storeId);

  for (const item of normalized) {
    const provider = providerFor(item.target_channel);
    const { data: action, error } = await supabase
      .from("growth_actions")
      .insert({
        organization_id: resolved.organizationId,
        store_id: resolved.storeId,
        industry_type_key: store.industry_type_key,
        title: item.title,
        summary: item.summary,
        priority: item.priority,
        reason: item.reason,
        recommended_date: item.recommended_date,
        target_channel: item.target_channel,
        status: "drafted",
        source_type: "ai_growth_action",
        source_id: ai.log.template_id,
        external_provider: provider,
        external_status: "not_connected",
        scheduled_at: scheduledAt(item.recommended_date),
        metadata: { ai_output: item }
      })
      .select("id")
      .single();
    if (error) throw new Error(`集客アクションを保存できませんでした: ${error.message}`);

    const { data: draft, error: draftError } = await supabase.from("growth_action_drafts").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      growth_action_id: action.id,
      channel: item.draft.channel,
      title: item.draft.title,
      body: item.draft.body,
      short_body: item.draft.short_body,
      hashtags: item.draft.hashtags,
      call_to_action: item.draft.call_to_action,
      copy_variant: "primary",
      external_provider: provider,
      external_status: "not_connected",
      scheduled_at: scheduledAt(item.recommended_date),
      metadata: {}
    }).select("id").single();
    if (draftError) throw new Error(`集客下書きを保存できませんでした: ${draftError.message}`);

    await supabase.from("growth_action_schedule_items").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      growth_action_id: action.id,
      growth_action_draft_id: draft?.id ?? null,
      channel: item.target_channel,
      title: item.title,
      scheduled_date: item.recommended_date,
      scheduled_at: scheduledAt(item.recommended_date),
      status: "drafted",
      external_provider: provider,
      external_status: "not_connected",
      metadata: {}
    });
  }
}

export async function updateGrowthActionStatus(storeId: string, actionId: string, status: GrowthActionStatus) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const { error } = await supabase
    .from("growth_actions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("store_id", resolved.storeId)
    .eq("id", actionId);
  if (error) throw new Error(`ステータスを更新できませんでした: ${error.message}`);
  await supabase
    .from("growth_action_schedule_items")
    .update({ status, updated_at: new Date().toISOString(), published_at: status === "done" ? new Date().toISOString() : null })
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId);
  await supabase.from("growth_action_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    event_type: "status_changed",
    message: `ステータスを${status}に変更しました。`,
    metadata: { status }
  });
}

export async function listGrowthCalendarItems(storeId: string): Promise<GrowthActionScheduleItem[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data: existingItems } = await supabase
    .from("growth_action_schedule_items")
    .select("growth_action_id")
    .eq("store_id", resolved.storeId);
  const existingActionIds = new Set((existingItems ?? []).map((item) => item.growth_action_id as string));
  const { data: actions } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(id)")
    .eq("store_id", resolved.storeId);
  const missing = (actions ?? []).filter((action) => !existingActionIds.has(action.id));
  if (missing.length > 0) {
    await supabase.from("growth_action_schedule_items").insert(missing.map((action) => {
      const draft = Array.isArray(action.drafts) ? action.drafts[0] as { id: string } | undefined : undefined;
      return {
        organization_id: resolved.organizationId,
        store_id: resolved.storeId,
        growth_action_id: action.id,
        growth_action_draft_id: draft?.id ?? null,
        channel: action.target_channel,
        title: action.title,
        scheduled_date: action.recommended_date ?? new Date().toISOString().slice(0, 10),
        scheduled_at: action.scheduled_at ?? scheduledAt(action.recommended_date),
        status: action.status,
        external_provider: action.external_provider,
        external_account_id: action.external_account_id,
        external_post_id: action.external_post_id,
        external_status: action.external_status ?? "not_connected",
        published_at: action.published_at,
        failed_reason: action.failed_reason,
        metadata: { backfilled: true }
      };
    }));
  }
  const { data } = await supabase
    .from("growth_action_schedule_items")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("scheduled_date", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as GrowthActionScheduleItem[];
}

export async function updateGrowthActionDraft(storeId: string, actionId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const draftId = String(formData.get("draft_id") ?? "");
  const hashtags = String(formData.get("hashtags") ?? "")
    .split(/[,\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const payload = {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    short_body: String(formData.get("short_body") ?? "") || null,
    call_to_action: String(formData.get("call_to_action") ?? "") || null,
    hashtags,
    metadata: { memo: String(formData.get("memo") ?? "") },
    updated_at: new Date().toISOString()
  };

  const { data: currentDraft, error: currentError } = await supabase
    .from("growth_action_drafts")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId)
    .eq("id", draftId)
    .maybeSingle();
  if (currentError) throw new Error(`下書きを確認できませんでした: ${currentError.message}`);
  if (!currentDraft) throw new Error("下書きが見つかりませんでした。");

  const { count } = await supabase
    .from("growth_action_draft_versions")
    .select("id", { count: "exact", head: true })
    .eq("growth_action_draft_id", draftId);

  await supabase.from("growth_action_draft_versions").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    growth_action_draft_id: draftId,
    version_number: (count ?? 0) + 1,
    title: currentDraft.title,
    body: currentDraft.body,
    short_body: currentDraft.short_body,
    hashtags: currentDraft.hashtags ?? [],
    call_to_action: currentDraft.call_to_action,
    memo: currentDraft.metadata?.memo ?? null,
    metadata: { saved_before_edit: true }
  });

  const { error } = await supabase
    .from("growth_action_drafts")
    .update(payload)
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId)
    .eq("id", draftId);
  if (error) throw new Error(`下書きを保存できませんでした: ${error.message}`);

  await supabase
    .from("growth_actions")
    .update({ title: payload.title, summary: payload.short_body ?? payload.body.slice(0, 120), status: "drafted", updated_at: new Date().toISOString() })
    .eq("store_id", resolved.storeId)
    .eq("id", actionId);

  await supabase
    .from("growth_action_schedule_items")
    .update({ title: payload.title, status: "drafted", updated_at: new Date().toISOString() })
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId);

  await supabase.from("growth_action_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    event_type: "draft_edited",
    message: "下書きを編集しました。",
    metadata: { draft_id: draftId }
  });
}

export async function submitGrowthActionApproval(storeId: string, actionId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const status = String(formData.get("approval_status") ?? "pending") as "pending" | "approved" | "rejected";
  const comment = String(formData.get("comment") ?? "") || null;
  const actionStatus: GrowthActionStatus = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending_approval";

  const { data: action } = await supabase
    .from("growth_actions")
    .select("drafts:growth_action_drafts(id)")
    .eq("store_id", resolved.storeId)
    .eq("id", actionId)
    .maybeSingle();
  const firstDraft = Array.isArray(action?.drafts) ? action.drafts[0] as { id: string } | undefined : undefined;

  const { error } = await supabase.from("growth_action_approvals").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    growth_action_draft_id: firstDraft?.id ?? null,
    status,
    comment,
    decided_at: status === "pending" ? null : new Date().toISOString()
  });
  if (error) throw new Error(`承認状態を保存できませんでした: ${error.message}`);
  await updateGrowthActionStatus(storeId, actionId, actionStatus);
}

export async function markGoogleBusinessProfileManualPost(storeId: string, actionId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data: action, error: actionError } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*)")
    .eq("store_id", resolved.storeId)
    .eq("id", actionId)
    .maybeSingle();
  if (actionError) throw new Error(`集客アクションを確認できませんでした: ${actionError.message}`);
  if (!action) throw new Error("集客アクションが見つかりませんでした。");
  const draft = Array.isArray(action.drafts)
    ? action.drafts.find((item: { channel?: string }) => item.channel === "google_business_profile") ?? action.drafts[0]
    : null;
  if (!draft) throw new Error("Google投稿下書きが見つかりませんでした。");

  const postedAt = String(formData.get("posted_at") ?? "") || new Date().toISOString();
  const manualStatus = String(formData.get("manual_status") ?? "manual_published");
  const isPublished = manualStatus === "manual_published";
  const actionStatus = manualStatus === "awaiting_approval" ? "pending_approval" : isPublished ? "done" : "drafted";
  const manualPost = {
    status: manualStatus,
    post_type: String(formData.get("post_type") ?? "standard"),
    cta_type: String(formData.get("cta_type") ?? "learn_more"),
    public_url: String(formData.get("public_url") ?? "") || null,
    image_note: String(formData.get("image_note") ?? "") || null,
    target_location_note: String(formData.get("target_location_note") ?? "") || null,
    posted_at: isPublished ? postedAt : null,
    operator_name: String(formData.get("operator_name") ?? "") || null,
    memo: String(formData.get("memo") ?? "") || null,
    checklist: formData.getAll("checklist").map(String),
    source: "manual_google_business_profile"
  };
  const actionMetadata = action.metadata && typeof action.metadata === "object" ? action.metadata as Record<string, unknown> : {};
  const draftMetadata = draft.metadata && typeof draft.metadata === "object" ? draft.metadata as Record<string, unknown> : {};

  const { error } = await supabase
    .from("growth_actions")
    .update({
      status: actionStatus,
      external_provider: "google_business_profile",
      external_status: manualStatus,
      external_post_id: isPublished ? manualPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      failed_reason: null,
      metadata: { ...actionMetadata, manual_google_business_profile: manualPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", actionId);
  if (error) throw new Error(`手動投稿済みとして保存できませんでした: ${error.message}`);

  await supabase
    .from("growth_action_drafts")
    .update({
      external_provider: "google_business_profile",
      external_status: manualStatus,
      external_post_id: isPublished ? manualPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      failed_reason: null,
      metadata: { ...draftMetadata, manual_google_business_profile: manualPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", draft.id);

  await supabase
    .from("growth_action_schedule_items")
    .update({
      status: actionStatus,
      external_provider: "google_business_profile",
      external_status: manualStatus,
      external_post_id: isPublished ? manualPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      metadata: { manual_google_business_profile: manualPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId);

  await supabase.from("external_publish_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    channel: "google_business_profile",
    provider: "manual_google_business_profile",
    target_id: isPublished ? manualPost.public_url : null,
    status: manualStatus,
    scheduled_at: action.scheduled_at ?? null,
    sent_at: isPublished ? postedAt : null,
    payload_json: {
      title: draft.title,
      body: draft.body,
      hashtags: draft.hashtags ?? [],
      call_to_action: draft.call_to_action,
      manual_post: manualPost
    },
    response_json: { manual: true, public_url: manualPost.public_url, status: manualStatus }
  });

  await supabase.from("growth_action_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    event_type: `manual_google_business_profile_${manualStatus}`,
    message: isPublished ? "Googleビジネスプロフィールへ手動投稿済みとして記録しました。" : "Googleビジネスプロフィール手動投稿の進行状態を保存しました。",
    metadata: manualPost
  });
}

export async function markSnsManualPost(storeId: string, actionId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data: action, error: actionError } = await supabase
    .from("growth_actions")
    .select("*, drafts:growth_action_drafts(*)")
    .eq("store_id", resolved.storeId)
    .eq("id", actionId)
    .maybeSingle();
  if (actionError) throw new Error(`集客アクションを確認できませんでした: ${actionError.message}`);
  if (!action) throw new Error("集客アクションが見つかりませんでした。");
  const draft = Array.isArray(action.drafts)
    ? action.drafts.find((item: { channel?: string }) => item.channel === action.target_channel) ?? action.drafts[0]
    : null;
  if (!draft) throw new Error("SNS投稿下書きが見つかりませんでした。");

  const manualStatus = String(formData.get("manual_status") ?? "draft");
  const isPublished = manualStatus === "manual_published";
  const actionStatus: GrowthActionStatus =
    manualStatus === "approval_pending" ? "pending_approval" :
      manualStatus === "approved" ? "approved" :
        isPublished ? "done" : "drafted";
  const postedAt = String(formData.get("posted_at") ?? "") || new Date().toISOString();
  const selectedChannel = String(formData.get("sns_channel") ?? draft.channel ?? action.target_channel);
  const snsPost = {
    status: manualStatus,
    sns_channel: selectedChannel,
    post_goal: String(formData.get("post_goal") ?? "new_customer"),
    image_url: String(formData.get("image_url") ?? "") || null,
    image_note: String(formData.get("image_note") ?? "") || null,
    selected_text: String(formData.get("selected_text") ?? "") || null,
    public_url: String(formData.get("public_url") ?? "") || null,
    posted_at: isPublished ? postedAt : null,
    operator_name: String(formData.get("operator_name") ?? "") || null,
    memo: String(formData.get("memo") ?? "") || null,
    checklist: formData.getAll("checklist").map(String),
    source: "manual_sns_post"
  };
  const actionMetadata = action.metadata && typeof action.metadata === "object" ? action.metadata as Record<string, unknown> : {};
  const draftMetadata = draft.metadata && typeof draft.metadata === "object" ? draft.metadata as Record<string, unknown> : {};

  const { error } = await supabase
    .from("growth_actions")
    .update({
      status: actionStatus,
      external_provider: selectedChannel,
      external_status: manualStatus,
      external_post_id: isPublished ? snsPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      failed_reason: null,
      metadata: { ...actionMetadata, manual_sns_post: snsPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", actionId);
  if (error) throw new Error(`SNS投稿状態を保存できませんでした: ${error.message}`);

  await supabase
    .from("growth_action_drafts")
    .update({
      external_provider: selectedChannel,
      external_status: manualStatus,
      external_post_id: isPublished ? snsPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      failed_reason: null,
      metadata: { ...draftMetadata, manual_sns_post: snsPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("id", draft.id);

  await supabase
    .from("growth_action_schedule_items")
    .update({
      status: actionStatus,
      external_provider: selectedChannel,
      external_status: manualStatus,
      external_post_id: isPublished ? snsPost.public_url : null,
      published_at: isPublished ? postedAt : null,
      metadata: { manual_sns_post: snsPost },
      updated_at: new Date().toISOString()
    })
    .eq("store_id", resolved.storeId)
    .eq("growth_action_id", actionId);

  await supabase.from("external_publish_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    channel: selectedChannel,
    provider: `manual_${selectedChannel}`,
    target_id: isPublished ? snsPost.public_url : null,
    status: manualStatus,
    scheduled_at: action.scheduled_at ?? null,
    sent_at: isPublished ? postedAt : null,
    payload_json: {
      title: draft.title,
      body: draft.body,
      short_body: draft.short_body,
      hashtags: draft.hashtags ?? [],
      call_to_action: draft.call_to_action,
      manual_post: snsPost
    },
    response_json: { manual: true, public_url: snsPost.public_url, status: manualStatus }
  });

  await supabase.from("growth_action_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    growth_action_id: actionId,
    event_type: `manual_sns_${manualStatus}`,
    message: isPublished ? "SNSへ手動投稿済みとして記録しました。" : "SNS手動投稿の進行状態を保存しました。",
    metadata: snsPost
  });
}

export async function listExternalChannelAccounts(storeId: string): Promise<ExternalChannelAccount[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await ensureDemoPersistence(supabase, store);
  const { data } = await supabase
    .from("external_channel_accounts")
    .select("*")
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ExternalChannelAccount[];
}

export async function upsertExternalChannelAccount(storeId: string, formData: FormData) {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  const resolved = await ensureDemoPersistence(supabase, store);
  const channel = normalizeChannel(formData.get("channel"));
  const externalProvider = String(formData.get("external_provider") ?? providerFor(channel) ?? "manual");
  const { error } = await supabase.from("external_channel_accounts").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    channel,
    external_provider: externalProvider,
    external_account_id: String(formData.get("external_account_id") ?? "") || null,
    account_name: String(formData.get("account_name") ?? ""),
    connection_status: "planned",
    metadata: { memo: String(formData.get("memo") ?? "") },
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,channel,external_provider" });
  if (error) throw new Error(`外部連携メモを保存できませんでした: ${error.message}`);
}

export function growthActionChannelLabel(channel: GrowthActionChannel) {
  return channelLabels[channel] ?? channel;
}

export function growthActionStatusLabel(status: GrowthActionStatus) {
  const labels: Record<GrowthActionStatus, string> = {
    todo: "未対応",
    drafted: "下書き作成済み",
    pending_approval: "承認待ち",
    approved: "承認済み",
    rejected: "差し戻し",
    done: "実行済み",
    paused: "保留"
  };
  return labels[status];
}

export function growthActionApprovalLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "承認待ち",
    approved: "承認済み",
    rejected: "差し戻し"
  };
  return labels[status] ?? status;
}
