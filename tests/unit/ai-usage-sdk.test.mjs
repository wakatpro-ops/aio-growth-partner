import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import OpenAI from "openai";
import ts from "typescript";
import { createUsageFetch } from "../../lib/ai-usage/transport.ts";

// Exercise the production factory and installed SDK. Only server-only and the
// database writer are stubbed; every HTTP response comes from an offline fetch.
function createOfflineFactory(events, saveError = null) {
  const loaded = { exports: {} };
  const source = readFileSync(new URL("../../lib/ai-usage/meter.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true
  } }).outputText;
  const dependencies = {
    "server-only": {},
    openai: { __esModule: true, default: OpenAI },
    "./transport": { createUsageFetch },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({
      from(table) {
        assert.equal(table, "ai_usage_events");
        return { insert(event) { return { async abortSignal(signal) {
          assert(signal instanceof AbortSignal);
          assert.equal(signal.aborted, false);
          if (saveError) throw saveError;
          events.push(event);
          return { error: null };
        } }; } };
      }
    }) }
  };
  new Function("require", "module", "exports", javascript)(specifier => {
    assert(Object.hasOwn(dependencies, specifier), `Unexpected dependency: ${specifier}`);
    return dependencies[specifier];
  }, loaded, loaded.exports);
  return loaded.exports.createMeteredOpenAI;
}

const attribution = {
  feature: "assistant", storeId: "store-fixture", organizationId: "org-fixture", userId: "user-fixture"
};
const chatRequest = { model: "gpt-6-luna", messages: [{ role: "user", content: "PRIVATE_PROMPT_CANARY" }] };
const chatPayload = {
  id: "chatcmpl-fixture", object: "chat.completion", created: 1, model: "gpt-6-luna",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "PRIVATE_REPLY_CANARY" } }],
  usage: { prompt_tokens: 1200, completion_tokens: 20, total_tokens: 1220,
    prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 500 } }
};

function response(payload, status, attempt) {
  return Response.json(payload, { status, headers: {
    "x-request-id": `req-fixture-${attempt}`, "retry-after-ms": "1"
  } });
}

test("real SDK preserves its two default retries and records 429 -> 503 -> success", async () => {
  const events = [], requests = [];
  const createClient = createOfflineFactory(events);
  const client = createClient(attribution, { apiKey: "offline-test-key", fetch: async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/chat/completions");
    requests.push(JSON.parse(init.body));
    const attempt = requests.length;
    if (attempt < 3) return response({ error: {
      message: "PRIVATE_PROVIDER_ERROR_CANARY", type: attempt === 1 ? "rate_limit_error" : "server_error"
    } }, attempt === 1 ? 429 : 503, attempt);
    assert.equal(attempt, 3, "No unexpected additional attempt");
    return response(chatPayload, 200, attempt);
  } });
  assert.equal(client.maxRetries, 2);
  const { data, response: raw } = await client.chat.completions.create(chatRequest).withResponse();
  assert.equal(data.choices[0].message.content, "PRIVATE_REPLY_CANARY");
  assert.deepEqual(data.usage, chatPayload.usage);
  assert.equal(raw.headers.get("x-request-id"), "req-fixture-3");
  assert.deepEqual(requests, [chatRequest, chatRequest, chatRequest]);
  assert.deepEqual(events.map(event => event.attempt), [1, 2, 3]);
  assert.equal(new Set(events.map(event => event.operation_id)).size, 1);
  assert.equal(new Set(events.map(event => event.id)).size, 3);
  assert.deepEqual(events.map(event => event.http_status), [429, 503, 200]);
  assert.deepEqual(events.map(event => event.status), ["error", "error", "success"]);
  assert.deepEqual(events.map(event => event.request_id), ["req-fixture-1", "req-fixture-2", "req-fixture-3"]);
  assert.deepEqual(events.map(event => event.cost_status), ["usage_missing", "usage_missing", "estimated"]);
  assert.equal(events[2].input_tokens, 1200);
  assert.equal(events[2].cached_input_tokens, 200);
  assert.equal(events[2].cache_write_tokens, 500);
  for (const event of events) {
    assert.equal(event.feature, attribution.feature);
    assert.equal(event.store_id, attribution.storeId);
    assert.equal(event.organization_id, attribution.organizationId);
    assert.equal(event.user_id, attribution.userId);
    assert(event.duration_ms >= 0);
  }
  assert(!JSON.stringify(events).includes("PRIVATE"));
  assert(!JSON.stringify(events).includes("offline-test-key"));
});

test("assistant maxRetries=0 and timeout=45000 remain unchanged, original SDK error survives", async () => {
  const events = []; let calls = 0;
  const client = createOfflineFactory(events)(attribution, {
    apiKey: "offline-test-key", timeout: 45_000, maxRetries: 0,
    fetch: async () => { calls++; return response({ error: {
      message: "PRIVATE_RATE_LIMIT_CANARY", type: "rate_limit_error", code: "rate_limit_exceeded"
    } }, 429, calls); }
  });
  assert.equal(client.maxRetries, 0);
  assert.equal(client.timeout, 45_000);
  await assert.rejects(client.chat.completions.create(chatRequest), error => {
    assert(error instanceof OpenAI.RateLimitError);
    assert.equal(error.status, 429);
    assert.equal(error.code, "rate_limit_exceeded");
    assert.equal(error.error.message, "PRIVATE_RATE_LIMIT_CANARY");
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].attempt, 1);
  assert.equal(events[0].cost_status, "usage_missing");
  assert(!JSON.stringify(events).includes("PRIVATE"));
});

test("Responses application fallback reuses operation and preserves parsed body and resolved model", async () => {
  const events = []; let calls = 0;
  const client = createOfflineFactory(events)({ feature: "public_url_analysis" }, {
    apiKey: "offline-test-key", fetch: async (url, init) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      calls++;
      const request = JSON.parse(init.body);
      if (request.model === "gpt-6-luna") return response({ error: {
        message: "PRIVATE_UNSUPPORTED_MODEL_CANARY", type: "invalid_request_error", code: "model_not_found"
      } }, 400, calls);
      assert.equal(request.model, "gpt-4.1-mini");
      return response({ id: "resp-fixture", object: "response", created_at: 1, status: "completed",
        model: "gpt-4.1-mini-2025-04-14", output: [
          { type: "web_search_call", id: "search-fixture", status: "completed" },
          { type: "message", id: "msg-fixture", status: "completed", role: "assistant",
            content: [{ type: "output_text", text: "PRIVATE_URL_ANALYSIS_CANARY", annotations: [] }] }
        ], usage: { input_tokens: 1000, output_tokens: 50, total_tokens: 1050,
          input_tokens_details: { cached_tokens: 100 }, output_tokens_details: { reasoning_tokens: 0 } }
      }, 200, calls);
    }
  });
  const request = { input: "PRIVATE_URL_PROMPT_CANARY", tools: [{ type: "web_search_preview" }] };
  await assert.rejects(client.responses.create({ ...request, model: "gpt-6-luna" }), OpenAI.BadRequestError);
  const result = await client.responses.create({ ...request, model: "gpt-4.1-mini" });
  assert.equal(result.output_text, "PRIVATE_URL_ANALYSIS_CANARY");
  assert.equal(calls, 2);
  assert.deepEqual(events.map(event => event.attempt), [1, 2]);
  assert.equal(events[0].operation_id, events[1].operation_id);
  assert.equal(events[0].model, "gpt-6-luna");
  assert.equal(events[1].model, "gpt-4.1-mini-2025-04-14");
  assert.equal(events[1].web_search_calls, 1);
  assert.equal(events[1].tool_cost_usd, .025);
  assert.equal(events[1].cost_status, "estimated");
  assert.equal(events[1].store_id, null);
  assert.equal(events[1].organization_id, null);
  assert.equal(events[1].user_id, null);
  assert(!JSON.stringify(events).includes("PRIVATE"));
});

test("network failures keep SDK retries and record the physical attempt without inventing HTTP or tokens", async () => {
  const events = []; let calls = 0;
  const client = createOfflineFactory(events)(attribution, {
    apiKey: "offline-test-key", fetch: async () => {
      calls++;
      if (calls === 1) throw new TypeError("PRIVATE_NETWORK_ERROR_CANARY");
      return response(chatPayload, 200, calls);
    }
  });
  const result = await client.chat.completions.create(chatRequest);
  assert.equal(result.choices[0].message.content, "PRIVATE_REPLY_CANARY");
  assert.equal(calls, 2);
  assert.equal(events[0].http_status, null);
  assert.equal(events[0].request_id, null);
  assert.equal(events[0].input_tokens, null);
  assert.equal(events[0].estimated_cost_usd, null);
  assert.equal(events[0].status, "error");
  assert.equal(events[0].operation_id, events[1].operation_id);
  assert.deepEqual(events.map(event => event.attempt), [1, 2]);
  assert(!JSON.stringify(events).includes("PRIVATE"));
});

test("recording failure does not become a provider retry or expose raw database errors", async () => {
  const events = [], warnings = []; let calls = 0;
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const client = createOfflineFactory(events, new Error("PRIVATE_DATABASE_ERROR_CANARY"))(attribution, {
      apiKey: "offline-test-key", fetch: async () => { calls++; return response(chatPayload, 200, calls); }
    });
    const result = await client.chat.completions.create(chatRequest);
    assert.equal(result.choices[0].message.content, "PRIVATE_REPLY_CANARY");
    assert.equal(calls, 1);
    assert.equal(events.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "ai_usage_record_failed");
    assert(!JSON.stringify(warnings).includes("PRIVATE"));
  } finally { console.warn = warn; }
});
