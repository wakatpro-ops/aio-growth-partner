// Synthetic only. No live credentials, database writes, or external AI calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { extractStoreProfile } from "../lib/applications/page-extraction.ts";
import { researchedIdentityMatches, isCurrentStoreDiagnosis, verifiedWebResearchSources, listingKey, sourceIsExcluded, hasUrlIdentityEvidence } from "../lib/applications/public-diagnosis.ts";
import { fetchPublicStoreSite, normalizePublicUrl, PublicUrlError, isRecoverableStoreFetchError } from "../lib/applications/url-safety.ts";

const lookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const empty = extractStoreProfile([{ url: "https://www.instagram.com/amourbymee", title: "Instagram", description: "", html: "" }]);
const candidate = { ...empty, store_name: "Amour by mee", address: "東京都豊島区巣鴨1-2-3", description: "巣鴨のプライベートサロンでフェイシャルケアを提供しています。", services: ["フェイシャル"], industry_key: "beauty_salon", industry_label: "美容室・サロン" };
const wrong = { ...candidate, store_name: "アムール", address: "長野県松本市深志1-2-30" };
assert.equal(listingKey("https://s.tabelog.com/tokyo/13206799/?utm_source=ad"), listingKey("https://tabelog.com/tokyo/13206799/"));
assert.notEqual(listingKey("https://example.com/shop?id=1"), listingKey("https://example.com/shop?id=2"));
assert.equal(sourceIsExcluded("https://example.com/shop?id=2", ["https://example.com/shop?id=1"]), true, "source exclusion covers the site, identity comparison keeps listing IDs distinct");
assert.equal(sourceIsExcluded("https://example.com/shop/photos", ["https://example.com/shop"]), true);
assert.equal(sourceIsExcluded("https://example.com/shop-other", ["https://example.com/shop"]), true);
assert.equal(sourceIsExcluded("https://other.example/shop", ["https://example.com/shop"]), false);
assert.equal(hasUrlIdentityEvidence("https://instagram.com/amourbymee", candidate, [{url:"https://instagram.com/another"}], [{url:"https://instagram.com/amourbymee",store_name:candidate.store_name,area:"巣鴨"}]), false);
const searchResponse = { output: [{ type: "web_search_call", status: "completed", action: { sources: [{ type: "url", url: "https://salon.example/amour" }] } }] };
assert.equal(verifiedWebResearchSources(searchResponse, [{ url: "https://salon.example/amour" }]).length, 1);
assert.equal(verifiedWebResearchSources(searchResponse, [{ url: "https://fake.example/" }]).length, 0);
assert.equal(verifiedWebResearchSources({ output: [{ ...searchResponse.output[0], status: "failed" }] }, [{ url: "https://salon.example/amour" }]).length, 0);
assert.equal(researchedIdentityMatches(empty, wrong), false);
assert.equal(researchedIdentityMatches(empty, wrong, "Amour by mee", "巣鴨"), false);
assert.equal(researchedIdentityMatches(empty, { ...wrong, store_name: candidate.store_name }, "Amour by mee", "巣鴨"), false);
assert.equal(researchedIdentityMatches(empty, candidate, "Amour by mee", "巣鴨"), true);
assert.equal(researchedIdentityMatches(empty, candidate, "Amour by mee"), false);
assert.equal(researchedIdentityMatches(candidate, { ...candidate, address: "福岡県福岡市博多区冷泉町" }), false);
assert.equal(isCurrentStoreDiagnosis({ identification: { identified: true } }), false);
assert.equal(isCurrentStoreDiagnosis({ identity_policy_version: 2, identification: { identified: false } }), false);
assert.equal(isCurrentStoreDiagnosis({ identity_policy_version: 2, identification: { identified: true } }), true);
assert.equal(normalizePublicUrl("ttps://s.tabelog.com/tokyo/A1307/A130701/13206799/").protocol, "https:");
assert.equal(normalizePublicUrl("https://restaurant.ikyu.com/108403/?ikCo=1&yclid=ad&sa_p=YSA").toString(), "https://restaurant.ikyu.com/108403/");
assert.throws(() => normalizePublicUrl("javascript:alert(1)"), /http/);
for (const code of ["blocked_host", "blocked_address", "url_credentials", "unsupported_protocol", "unsupported_port"]) {
  assert.equal(isRecoverableStoreFetchError(new PublicUrlError(code, "x")), false);
}
for (const code of ["http_403", "login_required", "fetch_timeout", "http_429", "http_503"]) {
  assert.equal(isRecoverableStoreFetchError(new PublicUrlError(code, "x")), true);
}
await assert.rejects(() => fetchPublicStoreSite("https://www.instagram.com/amourbymee", { lookupFn,
  fetchFn: async (url) => String(url).includes("/login") ? new Response("<title>Instagram</title>", { headers: { "content-type": "text/html" } }) : new Response(null, { status: 302, headers: { location: "/accounts/login/" } })
}), error => error.code === "login_required");
await assert.rejects(() => fetchPublicStoreSite("https://example.com", { lookupFn, fetchFn: async () => new Response("", { status: 403 }) }), error => error.code === "http_403");

let aiCalls = 0;
let aiProfile = candidate;
let citations = true;
let urlEvidence = false;
let consultedExcluded = false;
let lastAiRequest;
const mocks = {
  "server-only": {},
  "@/lib/ai-usage/meter": { createMeteredOpenAI: () => ({ responses: { create: async (params) => {
    lastAiRequest = params;
    aiCalls++;
    return { output_text: JSON.stringify({ store_profile: aiProfile, business_summary: aiProfile.description,
      identity_evidence: urlEvidence ? [{url:"https://www.instagram.com/amourbymee",store_name:aiProfile.store_name,area:"巣鴨"}] : [],
      research_sources: [{ url: "https://invented.example/", label: "Model-only fake", kind: "official" }] }),
      output: citations ? [{ content: [{ annotations: [{ type: "url_citation", url: "https://salon.example/amour", title: "店舗ページ" }, ...(urlEvidence ? [{type:"url_citation",url:"https://www.instagram.com/amourbymee",title:"店舗SNS"}] : [])] }] }, ...(consultedExcluded ? [{type:"web_search_call",status:"completed",action:{sources:[{url:"https://wrong.example/store"}]}}] : [])] : [] };
  } } }) },
  "@/lib/openai/models": { getOpenAiModelCandidates: () => ["synthetic-model"], getResponsesModelOptions: () => ({}) }
};
const require = createRequire(import.meta.url), cache = new Map();
function source(path) {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} }; cache.set(path, loaded.exports);
  const js = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", js)(specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return require(specifier);
    return source(specifier.startsWith("@/") ? `${specifier.slice(2)}.ts` : resolve(dirname(path), `${specifier}.ts`));
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { analyzeFetchedStoreSite, buildSelfReportedStore } = source("lib/applications/store-analysis.ts");
const originalKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "synthetic-unused-key";
try {
  const blocked = { sourceUrl: "https://www.instagram.com/amourbymee", finalUrl: "https://www.instagram.com/amourbymee", pages: [], errors: [{ code: "login_required" }], status: "partial" };
  const insufficient = await analyzeFetchedStoreSite(blocked);
  assert.equal(insufficient.diagnosis.identification.identified, false);
  assert.equal(aiCalls, 2, "URL search runs before asking the user; ungrounded identity is still rejected");
  urlEvidence = true;
  const fromUrl = await analyzeFetchedStoreSite(blocked);
  assert.equal(fromUrl.diagnosis.identification.identified, true);
  assert.equal(fromUrl.diagnosis.identity_method, "url_search");
  assert.equal(fromUrl.diagnosis.checked_sources.find(s => s.url.includes("instagram")).access, "search");
  urlEvidence = false;
  const success = await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨");
  assert.equal(success.diagnosis.identification.identified, true);
  assert.equal(success.diagnosis.identification.confidence, "medium");
  assert.equal(success.diagnosis.source_access, "unavailable");
  assert.equal(success.diagnosis.checked_sources.length, 1);
  assert(!success.diagnosis.checked_sources.some(s => s.kind === "input" || s.url.includes("invented")));
  aiProfile = wrong;
  assert.equal((await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨")).diagnosis.identification.identified, false);
  aiProfile = candidate; citations = false;
  assert.equal((await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨")).diagnosis.identification.identified, false, "model-only sources are not verified evidence");
  citations = true;
  const excluded = await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨", ["https://salon.example/amour"]);
  assert.equal(excluded.diagnosis.identification.identified, false, "excluded facts cannot survive by hiding a citation");
  consultedExcluded = true;
  assert.equal((await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨", ["https://wrong.example/store"])).diagnosis.identification.identified, false, "consulted excluded sources fail closed even without a citation");
  consultedExcluded = false;
  assert.equal((await analyzeFetchedStoreSite(blocked, "Amour by mee", "巣鴨", ["https://wrong.example/store"])).diagnosis.identification.identified, true);
  assert.equal(lastAiRequest.tools[0].type, "web_search");
  assert.deepEqual(lastAiRequest.tools[0].filters.blocked_domains, ["wrong.example"]);
  const callsBeforeManual = aiCalls;
  const manual = buildSelfReportedStore(blocked.sourceUrl, "Amour by mee", "巣鴨");
  assert.equal(aiCalls, callsBeforeManual);
  assert.equal(manual.diagnosis.identity_method, "self_reported");
  assert.equal(manual.profile.field_origins.store_name, "user_provided");
  assert.deepEqual(manual.diagnosis.checked_sources, []);
  assert.deepEqual(manual.profile.services, []);
  let failure = "http_403", fetchCalls = 0, recentCount = 0;
  const saved = [];
  mocks["@/lib/applications/url-safety"] = {
    normalizePublicUrl, PublicUrlError, isRecoverableStoreFetchError,
    validatePublicUrl: async () => { if (failure === "blocked_address") throw new PublicUrlError(failure, "denied"); },
    fetchPublicStoreSite: async () => { fetchCalls++; throw new PublicUrlError(failure, "synthetic fetch failure"); }
  };
  mocks["@/lib/supabase/admin"] = { createSupabaseAdminClient: () => ({ from: () => {
    const q = { select: () => q, eq: () => q, gte: () => q, insert: () => q,
      update: value => { saved.push(value); return q; }, single: () => q,
      then: done => done({ data: { id: "synthetic-analysis" }, error: null, count: recentCount }) };
    return q;
  } }) };
  const { POST } = source("app/api/public/store-analysis/route.ts");
  const request = body => new Request("https://app.example/api/public/store-analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const input = { source_url: "https://www.instagram.com/amourbymee" };
  const first = await POST(request(input));
  assert.equal(first.status, 422);
  assert.equal((await first.json()).needs_area_hint, true);
  const recovered = await POST(request({ ...input, store_hint: "Amour by mee", area_hint: "巣鴨" }));
  assert.equal(recovered.status, 200);
  const recoveredBody = await recovered.json();
  assert.equal(recoveredBody.profile.store_name, candidate.store_name);
  assert.equal(recoveredBody.diagnosis.source_access, "unavailable");
  assert.equal(saved.at(-1).fetch_summary.errors[0].code, "http_403");
  aiProfile = wrong;
  const mismatch = await POST(request({...input,store_hint:"Amour by mee",area_hint:"巣鴨"}));
  assert.equal((await mismatch.json()).searched_with_hints, true);
  const manualResponse = await POST(request({...input,store_hint:"Amour by mee",area_hint:"巣鴨",manual_identity:true}));
  assert.equal(manualResponse.status, 200);
  assert.equal((await manualResponse.json()).diagnosis.identity_method, "self_reported");
  assert.equal((await POST(request({...input,manual_identity:true}))).status, 400);
  aiProfile = candidate;
  const countBefore = aiCalls;
  failure = "blocked_address";
  const denied = await POST(request({ ...input, store_hint: "Amour by mee", area_hint: "巣鴨" }));
  assert.equal(denied.status, 422);
  assert.equal((await denied.json()).needs_store_hint, false);
  assert.equal(aiCalls, countBefore, "SSRF denial cannot trigger search recovery");
  assert.equal((await POST(request({...input,store_hint:"Amour by mee",area_hint:"巣鴨",excluded_sources:[input.source_url]}))).status, 422);
  assert.equal(aiCalls, countBefore, "exclusions cannot bypass URL safety checks");
  recentCount = 8;
  const fetchBefore = fetchCalls;
  assert.equal((await POST(request(input))).status, 429);
  assert.equal(fetchCalls, fetchBefore, "recovery preserves rate limiting");
} finally {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
}

const analyzing = readFileSync("app/apply/analyzing/analyzing-client.tsx", "utf8");
const correction = readFileSync("app/apply/identity-correction.tsx", "utf8");
assert.match(analyzing, /area_hint: area/);
assert.match(analyzing, /inFlight\.current/);
assert.match(analyzing, /lastFailedHints === JSON.stringify/);
assert.match(analyzing, /入力した店舗情報で確認へ進む/);
const selection = readFileSync("app/apply/source-selection.tsx", "utf8");
assert.match(selection, /removeItem\(APPLY_PREVIEW_STORAGE_KEY\)/);
assert.match(selection, /APPLY_EXCLUDED_STORAGE_KEY/);
assert.match(correction, /違います・店舗を訂正する/);
assert.match(correction, /removeItem\(APPLY_PREVIEW_STORAGE_KEY\)/);
for (const file of ["app/api/applications/route.ts", "app/api/public/store-analysis/verification/request/route.ts", "app/api/public/store-analysis/verification/confirm/route.ts"]) {
  assert.match(readFileSync(file, "utf8"), /isCurrentStoreDiagnosis\(draft.analysis_result\)/);
}
console.log("Public identity recovery: source failure, login wall, mismatched name/area, missing citations, candidate labels, stale tokens and correction contracts passed.");
