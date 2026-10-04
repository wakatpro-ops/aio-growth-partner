import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateAiUsageEvents, buildAiUsageDashboard, emptyAiUsageAggregate, normalizeUsageMonth, usageMonthBounds } from "../../lib/ai-usage/dashboard.ts";
import { aiUsageMonthlySettingsSchema, persistAiUsageMonthlySettings } from "../../lib/ai-usage/settings.ts";

const now = new Date("2026-10-05T03:00:00Z");
const start = "2026-09-30T15:00:00Z";
function event(changes = {}) {
  return { operation_id: "op-1", attempt: 1, feature: "conversation", organization_id: null, store_id: null, user_id: null, provider: "openai", endpoint: "/chat/completions", model: "example", service_tier: null, status: "success", http_status: 200, request_id: null, input_tokens: 100, output_tokens: 10, cached_input_tokens: 20, cache_write_tokens: 0, web_search_calls: 0, token_cost_usd: 0.01, tool_cost_usd: 0, pricing_snapshot: {}, estimated_cost_usd: 0.01, cost_status: "estimated", price_version: "test", duration_ms: 20, created_at: "2026-10-01T03:00:00Z", ...changes };
}
function dashboard(events = [], changes = {}) {
  return buildAiUsageDashboard({ month: "2026-10", now, aggregate: aggregateAiUsageEvents(events, "2026-10", now), settings: { usdJpy: 150, serviceRevenueJpy: 10000, updatedAt: null }, meteringStartedAt: start, ...changes });
}

test("JST month boundaries reject malformed months and exclude future records", () => {
  assert.equal(normalizeUsageMonth("2026-13", now), "2026-10");
  assert.equal(usageMonthBounds("2026-10").start, Date.parse(start));
  const result = dashboard([event({ created_at: "2026-09-30T14:59:59Z" }), event({ created_at: start }), event({ created_at: now.toISOString() }), event({ created_at: "2026-10-31T15:00:00Z" })]);
  assert.equal(result.totals.requests, 1);
  assert.equal(result.days[0].key, "2026-10-01");
});

test("request attempts are distinct from operations, and missing data is not zero cost", () => {
  const result = dashboard([event(), event({ attempt: 2, created_at: "2026-10-02T03:00:00Z" }), event({ operation_id: "op-2", status: "error", cost_status: "usage_missing", estimated_cost_usd: null, input_tokens: null, output_tokens: null, cached_input_tokens: null, cache_write_tokens: null, token_cost_usd: null })]);
  assert.equal(result.totals.requests, 3);
  assert.equal(result.totals.operations, 2);
  assert.equal(result.totals.retries, 1);
  assert.equal(result.totals.usageMissingCount, 1);
  assert.equal(result.totals.errors, 1);
  assert.equal(result.totals.estimatedCostUsd, 0.02);
  assert.equal(result.revenueRatioPercent, null);
  assert.equal(result.projection.available, false);
  assert.equal(result.stores[0].key, "unassigned");
});

test("token categories are non-overlapping display fields and missing cache details stay visible", () => {
  const result = dashboard([event({ cached_input_tokens: null, cache_write_tokens: null, cost_status: "unpriced", estimated_cost_usd: null })]);
  assert.equal(result.totals.inputTokens, 100);
  assert.equal(result.totals.cachedInputTokens, 0);
  assert.equal(result.totals.cacheDetailsMissingCount, 1);
  assert.equal(result.totals.unpricedCount, 1);
  assert.equal(result.revenueRatioPercent, null);
});

test("retry crossing a period boundary is counted even when its first attempt is outside", () => {
  const result = dashboard([event({ attempt: 1, created_at: "2026-09-30T14:59:59Z" }), event({ attempt: 2, created_at: start })]);
  assert.equal(result.totals.requests, 1);
  assert.equal(result.totals.operations, 1);
  assert.equal(result.totals.retries, 1);
  assert.equal(result.days[0].retries, 1);
});

test("projection excludes partial today, includes covered zero-activity days and waits 3 full days", () => {
  const result = dashboard([event({ estimated_cost_usd: 4 }), event({ created_at: "2026-10-05T00:00:00Z", operation_id: "today", estimated_cost_usd: 100 })]);
  assert.equal(result.projection.observedFullDays, 4);
  assert.equal(result.projection.estimatedCostUsd, 130.5);
  assert.equal(result.costJpy, 15600);
  const short = dashboard([], { meteringStartedAt: "2026-10-02T16:00:00Z" });
  assert.equal(short.projection.observedFullDays, 1);
  assert.equal(short.projection.available, false);
  const unknown = dashboard([], { meteringStartedAt: null });
  assert.equal(unknown.monthCoverageComplete, false);
  assert.equal(unknown.revenueRatioPercent, null);
  const lateStart = dashboard([event({ created_at: "2026-10-03T10:00:00Z", estimated_cost_usd: 2 })], { meteringStartedAt: "2026-10-01T03:00:00Z" });
  assert.equal(lateStart.projection.available, true);
  assert.match(lateStart.projection.reason, /計測前の費用は含みません/);
  assert.ok(lateStart.projection.estimatedCostUsd >= lateStart.totals.estimatedCostUsd);
  assert.equal(lateStart.projection.revenueRatioPercent, null, "partial-month cost must not be presented as full-month revenue ratio");
  assert.ok(result.projection.revenueRatioPercent > 0);
});

test("no FX, zero revenue, incomplete coverage and unavailable DB never manufacture ratios", () => {
  for (const settings of [{ usdJpy: null, serviceRevenueJpy: 100 }, { usdJpy: 150, serviceRevenueJpy: 0 }, { usdJpy: 150, serviceRevenueJpy: null }]) assert.equal(dashboard([event()], { settings: { ...settings, updatedAt: null } }).revenueRatioPercent, null);
  assert.equal(dashboard([event()], { meteringStartedAt: "2026-10-01T00:00:00Z" }).revenueRatioPercent, null);
  const unavailable = dashboard([], { unavailableReason: "not ready" });
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.costJpy, null);
  assert.equal(unavailable.projection.available, false);
  assert.deepEqual(unavailable.spikes, []);
});

test("spike uses comparable rolling windows, minimum activity and no infinity", () => {
  const many = Array.from({ length: 10 }, (_, index) => event({ operation_id: `current-${index}`, created_at: "2026-10-04T10:00:00Z" }));
  const prior = Array.from({ length: 5 }, (_, index) => event({ operation_id: `prior-${index}`, created_at: "2026-10-03T10:00:00Z" }));
  const result = dashboard([...many, ...prior]);
  assert.equal(result.recent.coverageComplete, true);
  assert.equal(result.spikes.length, 2);
  assert.equal(result.spikes[0].requestRatio, 2);
  const noPrior = dashboard(many);
  assert.equal(noPrior.spikes[0].kind, "new_activity");
  assert.equal(noPrior.spikes[0].requestRatio, null);
  assert.equal(dashboard(many.slice(1)).spikes.length, 0);
  assert.equal(dashboard(many, { meteringStartedAt: "2026-10-04T00:00:00Z" }).spikes.length, 0);
});

test("settings validate strict decimal values and reversible blank configuration", () => {
  assert.deepEqual(aiUsageMonthlySettingsSchema.parse({ month: "2026-10", usdJpy: "", serviceRevenueJpy: "" }), { month: "2026-10", usdJpy: null, serviceRevenueJpy: null });
  for (const usdJpy of ["0", "-1", "Infinity", "NaN", "1e3", "1,000", "10001", "1.0000001"]) assert.equal(aiUsageMonthlySettingsSchema.safeParse({ month: "2026-10", usdJpy, serviceRevenueJpy: "100" }).success, false, usdJpy);
  assert.equal(aiUsageMonthlySettingsSchema.safeParse({ month: "2026-10", usdJpy: "150.123456", serviceRevenueJpy: "0" }).success, true);
});

test("direct action denies unauthenticated callers before validation or persistence", async () => {
  let saved = false;
  await assert.rejects(() => persistAiUsageMonthlySettings(new FormData(), { requirePlatformAdmin: async () => { throw new Error("FORBIDDEN"); }, save: async () => { saved = true; } }), /FORBIDDEN/);
  assert.equal(saved, false);
});

test("settings save result carries safe failure or audited success without raw DB details", async () => {
  const form = new FormData(); form.set("month", "2026-10"); form.set("usd_jpy", "150"); form.set("service_revenue_jpy", "50000");
  let received;
  const success = await persistAiUsageMonthlySettings(form, { requirePlatformAdmin: async () => ({ userId: "admin" }), save: async (settings, actor) => { received = { settings, actor }; } });
  assert.equal(success.ok, true);
  assert.equal(received.actor, "admin");
  assert.equal(received.settings.serviceRevenueJpy, 50000);
  const failure = await persistAiUsageMonthlySettings(form, { requirePlatformAdmin: async () => ({ userId: "admin" }), save: async () => { throw new Error("secret diagnostic"); } });
  assert.equal(failure.ok, false);
  assert.equal(failure.message.includes("secret"), false);
  assert.equal(emptyAiUsageAggregate().totals.requests, 0);
});
