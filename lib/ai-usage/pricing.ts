// Public list prices verified 2026-10-04. Keep each saved event's price snapshot;
// future price updates must not reprice historical usage.
export const PRICE_VERSION = "openai-standard-2026-10-04-v1";
export const PRICE_SOURCE = "https://developers.openai.com/api/docs/pricing";
type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
type Rates = { input: number; cached: number; write: number | null; output: number; long?: [number, number, number, number]; reasoning: boolean };
const prices: Record<string, Rates> = {
  "gpt-6-luna": { input: .1, cached: .01, write: .125, output: .5, long: [.2, .02, .25, .75], reasoning: true },
  "gpt-6-sol": { input: 2, cached: .2, write: 2.5, output: 10, long: [4, .4, 5, 15], reasoning: true },
  "gpt-6-astra": { input: 10, cached: 1, write: 12.5, output: 50, long: [20, 2, 25, 75], reasoning: true },
  "gpt-4o-mini": { input: .15, cached: .075, write: null, output: .6, reasoning: false },
  "gpt-4.1-mini": { input: .4, cached: .1, write: null, output: 1.6, reasoning: false }
};
export type RequestPricingContext = { model: string; endpoint: string; serviceTier?: string | null; tools?: string[] };

/** Extract numeric usage only. Never retain model text, input, URLs or customers. */
export function priceUsage(payloadValue: unknown, request: RequestPricingContext) {
  const payload = object(payloadValue), usage = object(payload.usage);
  const model = typeof payload.model === "string" ? payload.model.slice(0, 100) : request.model;
  const canonical = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const rate = prices[canonical];
  const tier = typeof payload.service_tier === "string" ? payload.service_tier : request.serviceTier ?? "default";
  const input = count(usage.input_tokens ?? usage.prompt_tokens);
  const output = count(usage.output_tokens ?? usage.completion_tokens);
  const details = object(usage.input_tokens_details ?? usage.prompt_tokens_details);
  const cached = count(details.cached_tokens);
  // Pre-5.6 models have no cache-write charge. Missing modern fields stay unknown.
  const write = rate?.write === null ? 0 : count(details.cache_write_tokens);
  const toolTypes = request.tools ?? [];
  const wantsSearch = toolTypes.some(type => type.startsWith("web_search"));
  const items = Array.isArray(payload.output) ? payload.output : null;
  // Measured tool usage remains useful even when token details or prices are unknown.
  const calls = wantsSearch ? (items ? items.filter(item => object(item).type === "web_search_call").length : null) : 0;
  const base = {
    model, service_tier: tier, input_tokens: input, output_tokens: output,
    cached_input_tokens: cached, cache_write_tokens: write,
    web_search_calls: calls, token_cost_usd: null as number | null,
    tool_cost_usd: null as number | null, estimated_cost_usd: null as number | null,
    cost_status: "usage_missing" as "estimated" | "unpriced" | "usage_missing",
    price_version: PRICE_VERSION, pricing_snapshot: {} as Json
  };
  if (input === null || output === null) return base;
  base.cost_status = "unpriced";
  if (!rate || !["default", "standard"].includes(tier) || cached === null || write === null || cached + write > input) return base;
  const selected = input > 272_000 && rate.long ? rate.long : [rate.input, rate.cached, rate.write ?? 0, rate.output];
  const [inputRate, cachedRate, writeRate, outputRate] = selected;
  const supportedTool = (type: string) => type === "function" || type === "web_search" || type === "web_search_preview";
  if (toolTypes.some(type => !supportedTool(type))) return base;
  if (calls === null) return base;
  const searchRate = toolTypes.includes("web_search_preview") && !rate.reasoning ? .025 : .01;
  // Official pricing defines an 8K search-content block, but does not establish
  // whether response usage already includes it. Do not double-count or guess.
  if (calls > 0 && toolTypes.includes("web_search") && ["gpt-4o-mini", "gpt-4.1-mini"].includes(canonical)) {
    return { ...base, pricing_snapshot: { version: PRICE_VERSION, source: PRICE_SOURCE,
      reason: "search_content_usage_inclusion_unverified", search_content_tokens_per_call: 8000 } };
  }
  const tokenCost = ((input - cached - write) * inputRate + cached * cachedRate + write * writeRate + output * outputRate) / 1_000_000;
  const toolCost = calls * searchRate;
  return { ...base, web_search_calls: calls, token_cost_usd: tokenCost, tool_cost_usd: toolCost,
    estimated_cost_usd: tokenCost + toolCost, cost_status: "estimated" as const,
    pricing_snapshot: { version: PRICE_VERSION, source: PRICE_SOURCE, currency: "USD", unit: "per_million_tokens", input: inputRate,
      cached: cachedRate, cache_write: writeRate, output: outputRate, search_per_call: searchRate,
      search_content_tokens: 0, context: input > 272_000 && rate.long ? "long" : "standard", tax: "excluded" }
  };
}
