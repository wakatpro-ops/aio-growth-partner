import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks) {
  const module = { exports: {} };
  new Function("require", "module", "exports", ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
test("generation failure preserves answers, stale finish cannot overwrite done, no fake disconnected context", async () => {
  const store = { id: "00000000-0000-4000-8000-000000000001", organization_id: "org", name: "SYNTHETIC", industry_type_key: "restaurant" };
  let session = { revision: 3, state: { step: "confirm", brief: { channel: "instagram", subject: "コーヒー", details: "香りを紹介" } } };
  let failRead = false, failProvider = true, commitThenLoseResponse = false, providerCalls = 0;
  const db = {
    from(table) {
      const query = { single: false, select() { return this; }, eq() { return this; }, is() { return this; }, in() { return this; }, limit() { return this; }, order() { return this; }, maybeSingle() { this.single = true; return this; },
        then(resolve) { return Promise.resolve(resolve({ error: failRead ? { code: "offline" } : null, data: table === "marketing_conversations" ? structuredClone(session) : table === "external_channel_accounts" ? [{ connection_status: "connected", token_expires_at: null }] : table === "growth_actions" && this.single && session.state.step === "done" ? { id: session.state.actionId } : [] })); }
      }; return query;
    },
    async rpc(name, args) {
      if (name === "save_marketing_conversation") {
        if (session.revision !== args.p_revision) return { error: { code: "stale" } };
        session = { revision: session.revision + 1, state: structuredClone(args.p_state) }; return { data: session.revision };
      }
      assert.equal(name, "finish_marketing_conversation");
      session.state = { ...session.state, step: "done", actionId: session.state.generationId }; session.revision++;
      return commitThenLoseResponse ? { error: { code: "connection_lost" } } : { data: session.state.actionId };
    }
  };
  const rules = load("lib/marketing/conversation-rules.ts", {});
  const { advanceConversation, readConversation } = load("lib/marketing/conversation.ts", {
    "server-only": {}, "@/lib/supabase/admin": { createSupabaseAdminClient: () => db },
    "@/lib/feature-flags/resolve-feature-flags": { resolveFeatureFlags: () => ({}), isFeatureEnabled: () => true },
    "./conversation-rules": rules,
    "./reviews": { getReviewSummary: async () => ({ connected: false, unanswered: 0, locationIds: [] }) },
    "@/lib/openai/models": { getOpenAiModel: () => "test", getChatModelOptions: () => ({}) },
    "@/lib/ai-usage/meter": { createMeteredOpenAI: () => ({ chat: { completions: { create: async () => { providerCalls++; if (failProvider) throw new Error("provider_down"); return { choices: [{ finish_reason: "stop", message: { content: "コーヒーの香りを楽しみませんか。" } }] }; } } } }) }
  });
  const prior = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "synthetic-no-network";
  try {
    await assert.rejects(() => advanceConversation(store, "actor", { revision: 3, action: "generate" }), /入力は保存/);
    assert.equal(session.state.step, "confirm"); assert.equal(session.state.brief.details, "香りを紹介");
    failProvider = false; commitThenLoseResponse = true;
    await assert.rejects(() => advanceConversation(store, "actor", { revision: session.revision, action: "generate" }), /入力は保存/);
    assert.equal(session.state.step, "done"); const calls = providerCalls;
    await advanceConversation(store, "actor", { revision: 3, action: "generate" }); assert.equal(providerCalls, calls);
    failRead = true; await assert.rejects(() => readConversation(store, "actor"), /context_unavailable/);
  } finally { if (prior === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior; }
});
