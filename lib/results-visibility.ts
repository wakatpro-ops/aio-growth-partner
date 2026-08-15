import "server-only";

import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStoredGoogleAccessToken, GOOGLE_SEARCH_CONSOLE_SCOPE } from "@/lib/phase5/google-integrations";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ResultsVisibilityWorkspace,
  SearchVisibilityKeyword,
  SearchVisibilityPeriodKind,
  SearchVisibilitySetting,
  SearchVisibilitySnapshot
} from "@/types/results-visibility";
import type { Store } from "@/types/domain";

const editableRoles = new Set(["org_owner", "store_manager", "staff"]);
const validDevices = new Set(["all", "desktop", "mobile", "tablet"]);
const demoPersistence: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000101" },
  "store-auto-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000102" }
};

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type ResultsContext = {
  store: Store;
  organizationId: string;
  storeId: string;
  supabase: SupabaseClient | null;
  userId: string | null;
};

function persistenceFor(store: Store) {
  return demoPersistence[store.id] ?? { organizationId: store.organization_id, storeId: store.id };
}

async function context(storeId: string, write = false): Promise<ResultsContext> {
  const store = await getStore(storeId);
  const resolved = persistenceFor(store);
  const supabase = createSupabaseAdminClient();
  const access = await getCurrentUserAccess();
  if (write) {
    if (!access) throw new Error("ログインが必要です。");
    const role = access.organizationRoles[store.organization_id];
    if (!access.isPlatformAdmin && !editableRoles.has(role)) {
      throw new Error("成果の計測設定を変更する権限がありません。");
    }
    if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  }
  return { store, ...resolved, supabase, userId: access?.userId ?? null };
}

function stringValue(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function dateValue(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new Error("日付を選び直してください。");
  }
  return result;
}

function numberValue(value: FormDataEntryValue | null, label: string, minimum = 0) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum) throw new Error(`${label}を正しい数値で入力してください。`);
  return result;
}

function validPropertyUri(value: string) {
  if (!value) return true;
  if (value.startsWith("sc-domain:") && value.length > "sc-domain:".length) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function pickSnapshot(snapshots: SearchVisibilitySnapshot[], periodKind: SearchVisibilityPeriodKind) {
  return snapshots
    .filter((snapshot) => snapshot.period_kind === periodKind)
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "search_console" ? -1 : 1;
      return Date.parse(b.fetched_at) - Date.parse(a.fetched_at);
    })[0] ?? null;
}

export function calculateMetricChange(current: number | null, baseline: number | null, lowerIsBetter = false) {
  if (current === null || baseline === null) return null;
  const absolute = current - baseline;
  const percent = baseline === 0 ? null : (absolute / baseline) * 100;
  const improved = lowerIsBetter ? absolute < 0 : absolute > 0;
  const unchanged = absolute === 0;
  return { absolute, percent, improved, unchanged };
}

export async function getResultsVisibilityWorkspace(storeId: string): Promise<ResultsVisibilityWorkspace> {
  const { supabase, storeId: persistedStoreId } = await context(storeId);
  if (!supabase) {
    return {
      storageReady: false,
      setting: null,
      keywords: [],
      archivedKeywords: [],
      comparisons: [],
      googleConnected: false,
      searchConsoleScopeGranted: false,
      completedImprovements: []
    };
  }
  const [settingResult, keywordsResult, archivedResult, snapshotsResult, connectionResult, improvementsResult] = await Promise.all([
    supabase.from("search_visibility_settings").select("*").eq("store_id", persistedStoreId).maybeSingle(),
    supabase.from("search_visibility_keywords").select("*").eq("store_id", persistedStoreId).is("archived_at", null).order("sort_order").order("created_at"),
    supabase.from("search_visibility_keywords").select("*").eq("store_id", persistedStoreId).not("archived_at", "is", null).order("archived_at", { ascending: false }),
    supabase.from("search_visibility_snapshots").select("*").eq("store_id", persistedStoreId).order("fetched_at", { ascending: false }).limit(1000),
    supabase.from("google_oauth_connections").select("status,scopes").eq("store_id", persistedStoreId).eq("status", "connected").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("aio_improvement_tasks").select("id,title,change_summary,completed_at").eq("store_id", persistedStoreId).eq("status", "completed").is("archived_at", null).order("completed_at", { ascending: false }).limit(20)
  ]);
  const firstError = [settingResult.error, keywordsResult.error, archivedResult.error, snapshotsResult.error, connectionResult.error, improvementsResult.error].find(Boolean);
  if (firstError) throw new Error(`成果データを取得できませんでした: ${firstError.message}`);
  const keywords = (keywordsResult.data ?? []) as SearchVisibilityKeyword[];
  const snapshots = (snapshotsResult.data ?? []) as SearchVisibilitySnapshot[];
  const connection = connectionResult.data as { status?: string; scopes?: string[] } | null;
  return {
    storageReady: true,
    setting: settingResult.data as SearchVisibilitySetting | null,
    keywords,
    archivedKeywords: (archivedResult.data ?? []) as SearchVisibilityKeyword[],
    comparisons: keywords.map((keyword) => {
      const keywordSnapshots = snapshots.filter((snapshot) => snapshot.keyword_id === keyword.id);
      return { keyword, baseline: pickSnapshot(keywordSnapshots, "baseline"), current: pickSnapshot(keywordSnapshots, "current") };
    }),
    googleConnected: connection?.status === "connected",
    searchConsoleScopeGranted: Boolean(connection?.scopes?.includes(GOOGLE_SEARCH_CONSOLE_SCOPE)),
    completedImprovements: (improvementsResult.data ?? []) as ResultsVisibilityWorkspace["completedImprovements"]
  };
}

export async function saveSearchVisibilitySettingFromForm(storeId: string, formData: FormData) {
  const { store, supabase, organizationId, storeId: persistedStoreId, userId } = await context(storeId, true);
  const baselineDate = dateValue(formData.get("baseline_date"));
  if (baselineDate > new Date().toISOString().slice(0, 10)) throw new Error("導入日は今日以前の日付を選んでください。");
  const comparisonDays = Math.round(numberValue(formData.get("comparison_days"), "比較日数", 7));
  if (comparisonDays > 90) throw new Error("比較日数は7〜90日で入力してください。");
  const propertyUri = stringValue(formData.get("search_console_property_uri"), 500);
  if (!validPropertyUri(propertyUri)) throw new Error("Search Consoleプロパティは sc-domain:example.com または https://example.com/ の形式で入力してください。");
  const countryFilter = stringValue(formData.get("country_filter"), 3).toLowerCase() || "jpn";
  if (!/^[a-z]{3}$/.test(countryFilter)) throw new Error("国フィルターは3文字の国コードで入力してください。");
  const deviceFilter = stringValue(formData.get("device_filter"), 20) || "all";
  if (!validDevices.has(deviceFilter)) throw new Error("端末条件を選び直してください。");
  const { error } = await supabase!.from("search_visibility_settings").upsert({
    organization_id: organizationId,
    store_id: persistedStoreId,
    baseline_date: baselineDate,
    comparison_days: comparisonDays,
    search_console_property_uri: propertyUri || null,
    country_filter: countryFilter,
    device_filter: deviceFilter,
    updated_by: userId,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id" });
  if (error) throw new Error(`成果の計測条件を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "results_visibility_setting_updated", targetType: "search_visibility_setting", message: "成果の基準日と比較条件を更新しました。", metadata: { comparison_days: comparisonDays, country_filter: countryFilter, device_filter: deviceFilter, property_configured: Boolean(propertyUri) } });
}

export async function addSearchVisibilityKeywordFromForm(storeId: string, formData: FormData) {
  const { store, supabase, organizationId, storeId: persistedStoreId, userId } = await context(storeId, true);
  const keyword = stringValue(formData.get("keyword"), 120);
  if (keyword.length < 2) throw new Error("地域とサービスを含む検索キーワードを2文字以上で入力してください。");
  const { count } = await supabase!.from("search_visibility_keywords").select("id", { count: "exact", head: true }).eq("store_id", persistedStoreId).is("archived_at", null);
  if ((count ?? 0) >= 10) throw new Error("監視キーワードは最大10件です。不要なキーワードを削除してから追加してください。");
  const { data: activeKeywords } = await supabase!.from("search_visibility_keywords").select("id,keyword").eq("store_id", persistedStoreId).is("archived_at", null);
  if ((activeKeywords ?? []).some((item) => String(item.keyword).toLocaleLowerCase("ja-JP") === keyword.toLocaleLowerCase("ja-JP"))) throw new Error("同じ検索キーワードはすでに登録されています。");
  const { data, error } = await supabase!.from("search_visibility_keywords").insert({ organization_id: organizationId, store_id: persistedStoreId, keyword, sort_order: count ?? 0, created_by: userId, updated_by: userId }).select("id").single();
  if (error) throw new Error(`検索キーワードを追加できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "search_visibility_keyword_created", targetType: "search_visibility_keyword", targetId: data.id, message: `成果計測用の検索キーワード「${keyword}」を追加しました。` });
}

export async function archiveSearchVisibilityKeyword(storeId: string, keywordId: string) {
  const { store, supabase, storeId: persistedStoreId, userId } = await context(storeId, true);
  const { data: keyword } = await supabase!.from("search_visibility_keywords").select("id,keyword").eq("id", keywordId).eq("store_id", persistedStoreId).is("archived_at", null).maybeSingle();
  if (!keyword) throw new Error("検索キーワードが見つかりません。");
  const { error } = await supabase!.from("search_visibility_keywords").update({ archived_at: new Date().toISOString(), archived_by: userId, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", keywordId).eq("store_id", persistedStoreId).is("archived_at", null);
  if (error) throw new Error(`検索キーワードを削除できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "search_visibility_keyword_archived", targetType: "search_visibility_keyword", targetId: keywordId, message: `検索キーワード「${keyword.keyword}」を削除済みに移しました。計測履歴は保持されます。` });
}

export async function restoreSearchVisibilityKeyword(storeId: string, keywordId: string) {
  const { store, supabase, storeId: persistedStoreId, userId } = await context(storeId, true);
  const [{ data: keyword }, { count }] = await Promise.all([
    supabase!.from("search_visibility_keywords").select("id,keyword").eq("id", keywordId).eq("store_id", persistedStoreId).not("archived_at", "is", null).maybeSingle(),
    supabase!.from("search_visibility_keywords").select("id", { count: "exact", head: true }).eq("store_id", persistedStoreId).is("archived_at", null)
  ]);
  if (!keyword) throw new Error("削除済みの検索キーワードが見つかりません。");
  if ((count ?? 0) >= 10) throw new Error("監視キーワードは最大10件です。別のキーワードを削除してから元に戻してください。");
  const { data: activeKeywords } = await supabase!.from("search_visibility_keywords").select("id,keyword").eq("store_id", persistedStoreId).is("archived_at", null);
  if ((activeKeywords ?? []).some((item) => String(item.keyword).toLocaleLowerCase("ja-JP") === String(keyword.keyword).toLocaleLowerCase("ja-JP"))) throw new Error("同じ検索キーワードが登録されているため元に戻せません。");
  const { error } = await supabase!.from("search_visibility_keywords").update({ archived_at: null, archived_by: null, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", keywordId).eq("store_id", persistedStoreId);
  if (error) throw new Error(`検索キーワードを元に戻せませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "search_visibility_keyword_restored", targetType: "search_visibility_keyword", targetId: keywordId, message: `検索キーワード「${keyword.keyword}」を元に戻しました。` });
}

export async function recordManualSearchSnapshotFromForm(storeId: string, keywordId: string, formData: FormData) {
  const { store, supabase, organizationId, storeId: persistedStoreId, userId } = await context(storeId, true);
  const { data: keyword } = await supabase!.from("search_visibility_keywords").select("id,keyword").eq("id", keywordId).eq("store_id", persistedStoreId).is("archived_at", null).maybeSingle();
  if (!keyword) throw new Error("検索キーワードが見つかりません。");
  const periodKind = String(formData.get("period_kind")) as SearchVisibilityPeriodKind;
  if (!new Set(["baseline", "current"]).has(periodKind)) throw new Error("比較区分を選び直してください。");
  const periodStart = dateValue(formData.get("period_start"));
  const periodEnd = dateValue(formData.get("period_end"));
  if (periodEnd < periodStart) throw new Error("終了日は開始日以降にしてください。");
  const impressions = numberValue(formData.get("impressions"), "表示回数");
  const clicks = numberValue(formData.get("clicks"), "クリック数");
  if (clicks > impressions) throw new Error("クリック数は表示回数以下で入力してください。");
  const averagePositionRaw = String(formData.get("average_position") ?? "").trim();
  const averagePosition = averagePositionRaw ? numberValue(averagePositionRaw, "平均掲載順位") : null;
  const ctr = impressions > 0 ? Math.min(1, clicks / impressions) : 0;
  const { data, error } = await supabase!.from("search_visibility_snapshots").upsert({
    organization_id: organizationId,
    store_id: persistedStoreId,
    keyword_id: keywordId,
    source: "manual",
    period_kind: periodKind,
    period_start: periodStart,
    period_end: periodEnd,
    country_filter: "jpn",
    device_filter: "all",
    clicks,
    impressions,
    ctr,
    average_position: averagePosition,
    raw_summary: { entered_from: "results_visibility_form" },
    fetched_at: new Date().toISOString(),
    created_by: userId
  }, { onConflict: "keyword_id,source,period_kind,period_start,period_end,country_filter,device_filter" }).select("id").single();
  if (error) throw new Error(`実測値を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "search_visibility_snapshot_recorded", targetType: "search_visibility_snapshot", targetId: data.id, message: `「${keyword.keyword}」の${periodKind === "baseline" ? "導入前" : "現在"}の実測値を保存しました。`, metadata: { source: "manual", period_start: periodStart, period_end: periodEnd } });
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function comparisonPeriods(setting: SearchVisibilitySetting) {
  const baselineDate = new Date(`${setting.baseline_date}T00:00:00Z`);
  const baselineEnd = addDays(baselineDate, -1);
  const baselineStart = addDays(baselineEnd, -(setting.comparison_days - 1));
  const currentEnd = addDays(new Date(), -3);
  const currentStart = addDays(currentEnd, -(setting.comparison_days - 1));
  return {
    baseline: { start: isoDate(baselineStart), end: isoDate(baselineEnd) },
    current: { start: isoDate(currentStart), end: isoDate(currentEnd) }
  };
}

async function fetchSearchConsoleMetric(accessToken: string, propertyUri: string, keyword: string, period: { start: string; end: string }, setting: SearchVisibilitySetting) {
  const filters: Array<{ dimension: string; operator: string; expression: string }> = [{ dimension: "query", operator: "equals", expression: keyword }];
  if (setting.country_filter) filters.push({ dimension: "country", operator: "equals", expression: setting.country_filter });
  if (setting.device_filter !== "all") filters.push({ dimension: "device", operator: "equals", expression: setting.device_filter.toUpperCase() });
  const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUri)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ startDate: period.start, endDate: period.end, type: "web", dimensions: ["query"], dimensionFilterGroups: [{ groupType: "and", filters }], rowLimit: 10, dataState: "final" })
  });
  const payload = await response.json() as { rows?: Array<{ clicks?: number; impressions?: number; ctr?: number; position?: number }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Search Console APIがHTTP ${response.status}を返しました。`);
  const row = payload.rows?.[0];
  return { clicks: row?.clicks ?? 0, impressions: row?.impressions ?? 0, ctr: row?.ctr ?? 0, averagePosition: row?.position ?? null };
}

async function syncSearchConsoleContext({ supabase, organizationId, storeId, setting, keywords, userId }: { supabase: SupabaseClient; organizationId: string; storeId: string; setting: SearchVisibilitySetting; keywords: SearchVisibilityKeyword[]; userId: string | null }) {
  if (!setting.search_console_property_uri) throw new Error("Search Consoleのプロパティを設定してください。");
  if (keywords.length < 1) throw new Error("計測する検索キーワードを追加してください。");
  const { accessToken } = await getStoredGoogleAccessToken({ organizationId, storeId, requiredScope: GOOGLE_SEARCH_CONSOLE_SCOPE });
  const periods = comparisonPeriods(setting);
  let saved = 0;
  try {
    for (const keyword of keywords) {
      for (const periodKind of ["baseline", "current"] as const) {
        const period = periods[periodKind];
        const metric = await fetchSearchConsoleMetric(accessToken, setting.search_console_property_uri, keyword.keyword, period, setting);
        const { error } = await supabase.from("search_visibility_snapshots").upsert({
          organization_id: organizationId,
          store_id: storeId,
          keyword_id: keyword.id,
          source: "search_console",
          period_kind: periodKind,
          period_start: period.start,
          period_end: period.end,
          country_filter: setting.country_filter,
          device_filter: setting.device_filter,
          clicks: metric.clicks,
          impressions: metric.impressions,
          ctr: metric.ctr,
          average_position: metric.averagePosition,
          raw_summary: { api: "searchanalytics.query", data_state: "final" },
          fetched_at: new Date().toISOString(),
          created_by: userId
        }, { onConflict: "keyword_id,source,period_kind,period_start,period_end,country_filter,device_filter" });
        if (error) throw new Error(error.message);
        saved += 1;
      }
    }
    await supabase.from("search_visibility_settings").update({ status: "connected", last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("id", setting.id);
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search Console同期に失敗しました。";
    await supabase.from("search_visibility_settings").update({ status: message.includes("権限") ? "needs_reconnect" : "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", setting.id);
    throw new Error(message);
  }
}

export async function syncSearchConsole(storeId: string) {
  const current = await context(storeId, true);
  const { supabase, organizationId, storeId: persistedStoreId } = current;
  const [settingResult, keywordsResult] = await Promise.all([
    supabase!.from("search_visibility_settings").select("*").eq("store_id", persistedStoreId).maybeSingle(),
    supabase!.from("search_visibility_keywords").select("*").eq("store_id", persistedStoreId).is("archived_at", null).order("sort_order")
  ]);
  if (!settingResult.data) throw new Error("先に導入基準日とSearch Consoleプロパティを保存してください。");
  if (settingResult.error || keywordsResult.error) throw new Error("成果の同期設定を取得できませんでした。");
  const saved = await syncSearchConsoleContext({ supabase: supabase!, organizationId, storeId: persistedStoreId, setting: settingResult.data as SearchVisibilitySetting, keywords: (keywordsResult.data ?? []) as SearchVisibilityKeyword[], userId: current.userId });
  await logAuditEvent({ storeId: current.store.id, actionType: "search_console_synced", targetType: "search_visibility_setting", targetId: settingResult.data.id, message: `Search Consoleから${saved}件の比較データを同期しました。`, metadata: { snapshot_count: saved } });
  return saved;
}

export async function syncDueSearchConsoleStores() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { processed: 0, succeeded: 0, failed: 0 };
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: settings } = await supabase.from("search_visibility_settings").select("*").not("search_console_property_uri", "is", null).or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`).limit(100);
  let succeeded = 0;
  let failed = 0;
  for (const rawSetting of settings ?? []) {
    const setting = rawSetting as SearchVisibilitySetting;
    const { data: keywords } = await supabase.from("search_visibility_keywords").select("*").eq("store_id", setting.store_id).is("archived_at", null).order("sort_order");
    try {
      await syncSearchConsoleContext({ supabase, organizationId: setting.organization_id, storeId: setting.store_id, setting, keywords: (keywords ?? []) as SearchVisibilityKeyword[], userId: null });
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: (settings ?? []).length, succeeded, failed };
}
