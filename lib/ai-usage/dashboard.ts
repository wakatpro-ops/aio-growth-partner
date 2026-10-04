/** Non-sensitive provider-request evidence. Prompt/response bodies never belong here. */
export type AiUsageEvent = {
  id?: string;
  operation_id: string;
  attempt: number;
  feature: string;
  organization_id: string | null;
  store_id: string | null;
  user_id: string | null;
  provider: string;
  endpoint: string;
  model: string;
  service_tier: string | null;
  status: "success" | "error";
  http_status: number | null;
  request_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  web_search_calls: number | null;
  token_cost_usd: number | null;
  tool_cost_usd: number | null;
  pricing_snapshot: Record<string, unknown>;
  estimated_cost_usd: number | null;
  cost_status: "estimated" | "unpriced" | "usage_missing";
  price_version: string | null;
  duration_ms: number;
  created_at: string;
};

export type AiUsageMetrics = {
  requests: number;
  operations: number;
  retries: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  cacheDetailsMissingCount: number;
  webSearchCalls: number;
  tokenCostUsd: number;
  toolCostUsd: number;
  usageMissingCount: number;
  unpricedCount: number;
  knownCostRequests: number;
  estimatedCostUsd: number;
};
export type AiUsageGroup = AiUsageMetrics & { key: string; label: string };
export type AiUsageWindowGroup = { key: string; label: string; scope: "store" | "feature"; current: AiUsageMetrics; previous: AiUsageMetrics };
export type AiUsageSpike = AiUsageWindowGroup & { kind: "spike" | "new_activity"; requestRatio: number | null };
export type AiUsageAggregate = {
  totals: AiUsageMetrics;
  stores: AiUsageGroup[];
  features: AiUsageGroup[];
  days: AiUsageGroup[];
  recent: { current: AiUsageMetrics; previous: AiUsageMetrics; groups: AiUsageWindowGroup[] };
};
export type AiUsageMonthlySettings = { usdJpy: number | null; serviceRevenueJpy: number | null; updatedAt: string | null };
export type AiUsageDashboard = {
  state: "ready" | "unavailable";
  month: string;
  timeZone: "Asia/Tokyo";
  asOf: string;
  meteringStartedAt: string | null;
  isCurrentMonth: boolean;
  monthCoverageComplete: boolean;
  warnings: string[];
  settings: AiUsageMonthlySettings;
  totals: AiUsageMetrics;
  stores: AiUsageGroup[];
  features: AiUsageGroup[];
  days: AiUsageGroup[];
  costJpy: number | null;
  revenueRatioPercent: number | null;
  projection: { available: boolean; reason: string; observedFullDays: number; estimatedCostUsd: number | null; estimatedCostJpy: number | null; revenueRatioPercent: number | null };
  spikes: AiUsageSpike[];
  recent: { coverageComplete: boolean; current: AiUsageMetrics; previous: AiUsageMetrics };
};

const DAY = 86_400_000;
const JST = 9 * 3_600_000;
export const emptyAiUsageMetrics = (): AiUsageMetrics => ({ requests: 0, operations: 0, retries: 0, errors: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, cacheDetailsMissingCount: 0, webSearchCalls: 0, tokenCostUsd: 0, toolCostUsd: 0, usageMissingCount: 0, unpricedCount: 0, knownCostRequests: 0, estimatedCostUsd: 0 });
export const emptyAiUsageAggregate = (): AiUsageAggregate => ({ totals: emptyAiUsageMetrics(), stores: [], features: [], days: [], recent: { current: emptyAiUsageMetrics(), previous: emptyAiUsageMetrics(), groups: [] } });
export function jstDate(value: Date | string) { return new Date(new Date(value).getTime() + JST).toISOString().slice(0, 10); }
export function normalizeUsageMonth(value: unknown, now = new Date()) {
  return typeof value === "string" && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(value) ? value : jstDate(now).slice(0, 7);
}
export function usageMonthBounds(month: string) {
  if (normalizeUsageMonth(month) !== month) throw new Error("Invalid usage month");
  const [year, monthNumber] = month.split("-").map(Number);
  return { start: Date.UTC(year, monthNumber - 1, 1) - JST, end: Date.UTC(year, monthNumber, 1) - JST };
}
function metrics(events: AiUsageEvent[]): AiUsageMetrics {
  const result = emptyAiUsageMetrics();
  result.requests = events.length;
  result.operations = new Set(events.map(event => event.operation_id)).size;
  result.retries = events.filter(event => event.attempt > 1).length;
  for (const event of events) {
    result.errors += Number(event.status === "error");
    result.inputTokens += event.input_tokens ?? 0;
    result.outputTokens += event.output_tokens ?? 0;
    result.cachedInputTokens += event.cached_input_tokens ?? 0;
    result.cacheWriteTokens += event.cache_write_tokens ?? 0;
    result.cacheDetailsMissingCount += Number(event.input_tokens !== null && (event.cached_input_tokens === null || event.cache_write_tokens === null));
    result.webSearchCalls += event.web_search_calls ?? 0;
    result.tokenCostUsd += event.token_cost_usd ?? 0;
    result.toolCostUsd += event.tool_cost_usd ?? 0;
    result.usageMissingCount += Number(event.cost_status === "usage_missing");
    result.unpricedCount += Number(event.cost_status === "unpriced");
    if (event.cost_status === "estimated" && event.estimated_cost_usd !== null) {
      result.knownCostRequests++;
      result.estimatedCostUsd += event.estimated_cost_usd;
    }
  }
  return result;
}

/** Reference implementation for SQL aggregate parity tests, not a paginated DB loader. */
export function aggregateAiUsageEvents(events: AiUsageEvent[], month: string, now = new Date(), storeNames: Record<string, string> = {}): AiUsageAggregate {
  const { start, end } = usageMonthBounds(month);
  const at = now.getTime();
  const monthly = events.filter(event => { const time = Date.parse(event.created_at); return time >= start && time < Math.min(end, at); });
  const keyFor = (event: AiUsageEvent, scope: "store" | "feature" | "day") => scope === "store" ? event.store_id ?? "unassigned" : scope === "feature" ? event.feature : jstDate(event.created_at);
  const labelFor = (key: string, scope: "store" | "feature" | "day") => scope === "store" ? key === "unassigned" ? "店舗未割当・申込前" : storeNames[key] ?? "店舗名未取得" : key;
  const group = (rows: AiUsageEvent[], scope: "store" | "feature" | "day"): AiUsageGroup[] => {
    const buckets = new Map<string, AiUsageEvent[]>();
    for (const event of rows) { const key = keyFor(event, scope); buckets.set(key, [...(buckets.get(key) ?? []), event]); }
    return [...buckets].map(([key, bucket]) => ({ key, label: labelFor(key, scope), ...metrics(bucket) })).sort((a, b) => scope === "day" ? a.key.localeCompare(b.key) : b.estimatedCostUsd - a.estimatedCostUsd || b.requests - a.requests || a.key.localeCompare(b.key));
  };
  const currentRows = events.filter(event => Date.parse(event.created_at) >= at - DAY && Date.parse(event.created_at) < at);
  const previousRows = events.filter(event => Date.parse(event.created_at) >= at - 2 * DAY && Date.parse(event.created_at) < at - DAY);
  const groups: AiUsageWindowGroup[] = [];
  for (const scope of ["store", "feature"] as const) {
    const current = new Map(group(currentRows, scope).map(row => [row.key, row]));
    const previous = new Map(group(previousRows, scope).map(row => [row.key, row]));
    for (const key of new Set([...current.keys(), ...previous.keys()])) groups.push({ key, label: labelFor(key, scope), scope, current: current.get(key) ?? emptyAiUsageMetrics(), previous: previous.get(key) ?? emptyAiUsageMetrics() });
  }
  return { totals: metrics(monthly), stores: group(monthly, "store"), features: group(monthly, "feature"), days: group(monthly, "day"), recent: { current: metrics(currentRows), previous: metrics(previousRows), groups } };
}

export function buildAiUsageDashboard(input: { month: string; now?: Date; aggregate: AiUsageAggregate; settings?: AiUsageMonthlySettings; meteringStartedAt: string | null; unavailableReason?: string }): AiUsageDashboard {
  const now = input.now ?? new Date();
  const at = now.getTime();
  const month = normalizeUsageMonth(input.month, now);
  const { start, end } = usageMonthBounds(month);
  const settings = input.settings ?? { usdJpy: null, serviceRevenueJpy: null, updatedAt: null };
  const { totals, stores, features, days, recent } = input.aggregate;
  const started = input.meteringStartedAt ? Date.parse(input.meteringStartedAt) : NaN;
  const currentMonth = jstDate(now).slice(0, 7);
  const isCurrentMonth = month === currentMonth;
  const available = !input.unavailableReason;
  const monthCoverageComplete = available && Number.isFinite(started) && started <= start && start <= at;
  const fullCost = totals.knownCostRequests === totals.requests;
  const warnings: string[] = [];
  if (input.unavailableReason) warnings.push(input.unavailableReason);
  if (!Number.isFinite(started)) warnings.push("計測開始時刻が未確定です。過去の利用料をゼロとは扱いません。");
  else if (!monthCoverageComplete) warnings.push("この月は計測開始前の期間を含みます。表示額は記録済みリクエスト分のみです。");
  if (!fullCost) warnings.push("使用量未取得・料金未登録のリクエストがあります。金額は計算可能な分だけの小計です。");
  if (settings.usdJpy === null) warnings.push("この月のUSD/JPY換算レートが未設定です。");
  if (settings.serviceRevenueJpy === null) warnings.push("この月のAIOb利用料売上（税抜）が未設定です。店舗自身の売上は使用しません。");
  const costJpy = available && settings.usdJpy !== null ? totals.estimatedCostUsd * settings.usdJpy : null;
  const revenueRatioPercent = available && fullCost && monthCoverageComplete && costJpy !== null && (settings.serviceRevenueJpy ?? 0) > 0 ? costJpy / settings.serviceRevenueJpy! * 100 : null;
  const todayStart = Math.floor((at + JST) / DAY) * DAY - JST;
  const completeStart = Number.isFinite(started) ? Math.max(start, Math.ceil((started + JST) / DAY) * DAY - JST) : todayStart;
  const completeEnd = Math.min(todayStart, end);
  const observedFullDays = Math.max(0, Math.floor((completeEnd - completeStart) / DAY));
  const completeDays = days.filter(day => { const time = Date.parse(`${day.key}T00:00:00+09:00`); return time >= completeStart && time < completeEnd; });
  const completeDaysCost = completeDays.reduce((sum, day) => sum + day.estimatedCostUsd, 0);
  const projectionAvailable = available && isCurrentMonth && observedFullDays >= 3 && fullCost && Number.isFinite(started);
  const projectedUsd = projectionAvailable ? totals.estimatedCostUsd + completeDaysCost / observedFullDays * Math.max(0, (end - at) / DAY) : null;
  const projectedJpy = projectedUsd !== null && settings.usdJpy !== null ? projectedUsd * settings.usdJpy : null;
  const projectionReason = projectionAvailable
    ? `記録済み月内小計＋計測済みの完全なJST日 ${observedFullDays} 日の平均×月末までの残り時間です。今日の途中分は平均に含みません。${monthCoverageComplete ? "" : "計測開始後の月末小計見込みで、計測前の費用は含みません。"}`
    : !isCurrentMonth ? "月末見込みは今月のみ表示します。" : !fullCost ? "未計算のリクエストがあるため月末見込みを表示しません。" : "計測開始後の完全なJST日が3日以上そろってから表示します。";
  const coverageComplete = available && Number.isFinite(started) && started <= at - 2 * DAY;
  const spikes: AiUsageSpike[] = coverageComplete ? recent.groups.filter(group => group.current.requests >= 10 && (group.previous.requests === 0 || group.current.requests >= group.previous.requests * 2)).map(group => ({ ...group, kind: group.previous.requests === 0 ? "new_activity" : "spike", requestRatio: group.previous.requests > 0 ? group.current.requests / group.previous.requests : null })) : [];
  return { state: available ? "ready" : "unavailable", month, timeZone: "Asia/Tokyo", asOf: now.toISOString(), meteringStartedAt: input.meteringStartedAt, isCurrentMonth, monthCoverageComplete, warnings, settings, totals, stores, features, days, costJpy, revenueRatioPercent, projection: { available: projectionAvailable, reason: projectionReason, observedFullDays, estimatedCostUsd: projectedUsd, estimatedCostJpy: projectedJpy, revenueRatioPercent: monthCoverageComplete && projectedJpy !== null && (settings.serviceRevenueJpy ?? 0) > 0 ? projectedJpy / settings.serviceRevenueJpy! * 100 : null }, spikes, recent: { coverageComplete, current: recent.current, previous: recent.previous } };
}
