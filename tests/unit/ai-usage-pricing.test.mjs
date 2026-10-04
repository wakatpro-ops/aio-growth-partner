import assert from "node:assert/strict";
import test from "node:test";
import { priceUsage } from "../../lib/ai-usage/pricing.ts";
import { createUsageFetch } from "../../lib/ai-usage/transport.ts";

const request = { model: "gpt-6-luna", endpoint: "/v1/responses" };
const usage = { input_tokens: 10000, input_tokens_details: { cached_tokens: 6000, cache_write_tokens: 2000 }, output_tokens: 1000, output_tokens_details: { reasoning_tokens: 700 } };
test("ordinary/cache read/cache write are exclusive; reasoning already in output", () => {
  const result = priceUsage({ model: "gpt-6-luna", usage }, request);
  assert.equal(result.cost_status, "estimated");
  assert.equal(result.estimated_cost_usd, (2000 * .1 + 6000 * .01 + 2000 * .125 + 1000 * .5) / 1e6);
  assert.equal(result.input_tokens, 10000);
  assert.equal(result.pricing_snapshot.currency, "USD");
});
test("Chat Completions shape and actual model overrides requested fallback", () => {
  const result = priceUsage({ model: "gpt-4o-mini-2024-07-18", usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 100 } } }, request);
  assert.equal(result.cache_write_tokens, 0);
  assert.equal(result.estimated_cost_usd, (900 * .15 + 100 * .075 + 50 * .6) / 1e6);
});
test("long context boundary is >272000, rate snapshot saved", () => {
  const sample = input_tokens => ({ usage: { ...usage, input_tokens } });
  assert.equal(priceUsage(sample(272000), request).pricing_snapshot.input, .1);
  assert.equal(priceUsage(sample(272001), request).pricing_snapshot.input, .2);
});
test("unknown rates, missing usage, incomplete cache and invalid counts cannot become zero cost", () => {
  for (const [payload, req, status] of [
    [{ usage }, { ...request, model: "unknown" }, "unpriced"],
    [{ usage, service_tier: "priority" }, request, "unpriced"],
    [{}, request, "usage_missing"],
    [{ usage: { ...usage, input_tokens_details: { cached_tokens: 0 } } }, request, "unpriced"],
    [{ usage: { ...usage, input_tokens_details: { cached_tokens: 99999, cache_write_tokens: 0 } } }, request, "unpriced"],
    [{ usage: { ...usage, output_tokens: -1 } }, request, "usage_missing"]
  ]) { const result = priceUsage(payload, req); assert.equal(result.cost_status, status); assert.equal(result.estimated_cost_usd, null); }
});
test("web search charges only actual calls and supported tool types", () => {
  const payload = { usage, output: [{ type: "message" }, { type: "web_search_call" }, { type: "web_search_call" }] };
  const result = priceUsage(payload, { ...request, tools: ["web_search_preview"] });
  assert.equal(result.web_search_calls, 2); assert.equal(result.tool_cost_usd, .02);
  assert.equal(priceUsage({ usage, output: [] }, { ...request, tools: ["web_search"] }).tool_cost_usd, 0);
  assert.equal(priceUsage({ usage }, { ...request, tools: ["web_search"] }).estimated_cost_usd, null);
  assert.equal(priceUsage(payload, { ...request, tools: ["code_interpreter"] }).estimated_cost_usd, null);
});
test("observed web-search usage survives unknown model, missing cache details and missing token usage", () => {
  for (const payload of [
    { model: "unknown-model", usage },
    { usage: { ...usage, input_tokens_details: { cached_tokens: 0 } } },
    {}
  ]) {
    const result = priceUsage({ ...payload, output: [{ type: "web_search_call" }] }, { ...request, tools: ["web_search"] });
    assert.equal(result.web_search_calls, 1);
    assert.equal(result.estimated_cost_usd, null);
  }
});
test("mini non-preview search stays unpriced instead of potentially double-counting its 8K input block", () => {
  for (const model of ["gpt-4o-mini", "gpt-4.1-mini"]) {
    const payload = { model, usage, output: [{ type: "web_search_call" }] };
    const result = priceUsage(payload, { ...request, model, tools: ["web_search"] });
    assert.equal(result.web_search_calls, 1);
    assert.equal(result.cost_status, "unpriced");
    assert.equal(result.estimated_cost_usd, null);
    assert.equal(result.token_cost_usd, null);
    assert.equal(result.tool_cost_usd, null);
    assert.equal(result.pricing_snapshot.reason, "search_content_usage_inclusion_unverified");
    assert.equal(result.pricing_snapshot.search_content_tokens_per_call, 8000);
    const noCall = priceUsage({ ...payload, output: [] }, { ...request, model, tools: ["web_search"] });
    assert.equal(noCall.cost_status, "estimated");
    assert.equal(noCall.tool_cost_usd, 0);
    const preview = priceUsage(payload, { ...request, model, tools: ["web_search_preview"] });
    assert.equal(preview.cost_status, "estimated");
    assert.equal(preview.tool_cost_usd, .025);
  }
});
const url = "https://api.openai.com/v1/chat/completions";
const init = { method: "POST", body: JSON.stringify({ model: request.model, messages: [{ content: "PRIVATE_PROMPT_CANARY" }] }) };
test("each physical attempt retains operation ID; return body unchanged, no sensitive recording", async () => {
  const events = []; let calls = 0;
  const metered = createUsageFetch({ feature: "assistant" }, async event => events.push(event), async () => {
    calls++;
    return Response.json(calls === 1 ? { error: { message: "PRIVATE_ERROR_CANARY" } } : { usage, choices: [{ message: { content: "PRIVATE_REPLY_CANARY" } }] }, { status: calls === 1 ? 429 : 200, headers: { "x-request-id": `req-${calls}` } });
  });
  assert.equal((await metered(url, init)).status, 429);
  const response = await metered(url, init);
  assert.equal((await response.json()).choices[0].message.content, "PRIVATE_REPLY_CANARY");
  assert.deepEqual(events.map(event => event.attempt), [1, 2]);
  assert.equal(events[0].operation_id, events[1].operation_id);
  assert.equal(events[0].cost_status, "usage_missing");
  assert.equal(events[1].status, "success");
  assert(!JSON.stringify(events).includes("PRIVATE"));
});
test("recording failure never changes valid response or provider error/retry behavior", async () => {
  const warn = console.warn; const warnings = []; console.warn = (...args) => warnings.push(args);
  try {
    const save = async () => { throw new Error("PRIVATE_DATABASE_ERROR"); };
    const success = createUsageFetch({ feature: "assistant" }, save, async () => Response.json({ usage }));
    assert.deepEqual((await (await success(url, init)).json()).usage, usage);
    const transportError = new Error("original network error");
    const failed = createUsageFetch({ feature: "assistant" }, save, async () => { throw transportError; });
    await assert.rejects(failed(url, init), error => error === transportError);
    assert.equal(warnings.length, 2); assert(!JSON.stringify(warnings).includes("PRIVATE"));
  } finally { console.warn = warn; }
});
test("non-OpenAI request not inspected; malformed/non-json usage not fabricated", async () => {
  const events = [];
  const metered = createUsageFetch({ feature: "test" }, async event => events.push(event), async () => new Response("not json"));
  await metered("https://example.com", init); assert.equal(events.length, 0);
  assert.equal(await (await metered(url, init)).text(), "not json");
  assert.equal(events[0].cost_status, "usage_missing");
});
