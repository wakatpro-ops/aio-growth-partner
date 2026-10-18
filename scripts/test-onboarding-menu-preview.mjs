// Explicit opt-in, staging DB only; existing protected AI key stays in Vercel.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { setupMenuCandidates, setupMenuReady } from "../lib/onboarding/menu-candidates.ts";
const base = process.env.AIO_TEST_URL ?? "";
const source = process.env.AIO_MENU_TEST_SOURCE ?? "";
const minimumPriced = Number(process.env.AIO_MENU_TEST_MIN_PRICED ?? "0");
assert(Number.isSafeInteger(minimumPriced) && minimumPriced >= 0 && minimumPriced <= 8);
assert(process.argv.includes("--staging-live"));
assert(/^https:\/\/aio-growth-partner-[a-z0-9]+-wakatpro-3797s-projects\.vercel\.app$/u.test(base));
assert(/^https:\/\//u.test(source));
const ref = "zlqqjifitnvorudxbepy";
const cli = (bin, args, env = process.env, timeout = 60000) => {
  try { return execFileSync(bin, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }); }
  catch { throw new Error("CLI failed; response and authentication output withheld"); }
};
const keys = JSON.parse(cli("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"]));
const secret = keys.find(key => key.name === "aio_staging_vercel" && key.type === "secret")?.api_key;
assert(secret);
const db = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } });
let analysisId;
try {
  const body = JSON.parse(cli("vercel", ["curl", "/api/public/store-analysis", "--deployment", base, "--", "--silent", "--show-error", "--max-time", "185", "--request", "POST", "--header", "Content-Type: application/json", "--data", JSON.stringify({ source_url: source, store_hint: process.env.AIO_MENU_TEST_NAME ?? "", area_hint: process.env.AIO_MENU_TEST_AREA ?? "" })], { ...process.env, VERCEL_PROJECT_ID: "prj_b7InveOcjuUuMhxEWllhRtU7eT3M", VERCEL_ORG_ID: "team_wlpBR7pDkaVGzgmdp9CUO9BI" }, 195000));
  assert(body.ok && body.analysis_token, `Public analysis did not complete: ${body.code ?? "unknown"}`);
  const hash = createHash("sha256").update(body.analysis_token).digest("hex");
  const { data, error } = await db.from("public_store_analyses").select("id,ai_status,ai_model,ai_error_code,extracted_profile,fetch_summary,converted_application_id,analysis_result").eq("public_token_hash", hash).single();
  assert.equal(error, null, "Response must be stored in staging, not production");
  analysisId = data.id;
  assert.equal(data.ai_status, "success", `AI analysis: ${data.ai_error_code ?? "unknown"}`);
  assert.equal(data.converted_application_id, null);
  const candidates = setupMenuCandidates(data.extracted_profile);
  assert(candidates.every(menu => !setupMenuReady(menu)));
  assert(candidates.filter(menu => menu.kind === "overview").every(menu => menu.unitPrice === null));
  const direct = candidates.filter(menu => menu.kind === "menu" && menu.sourceAccess === "page").length;
  const search = candidates.filter(menu => menu.kind === "menu" && menu.sourceAccess === "search").length;
  const priced = candidates.filter(menu => menu.kind === "menu" && menu.unitPrice !== null);
  assert(priced.length >= minimumPriced, `Expected at least ${minimumPriced} priced menu candidates, got ${priced.length}`);
  if (minimumPriced) assert.equal(body.diagnosis.menu_candidates.length, direct + search, "Public preview must show actual menu candidates, not just services");
  console.log(JSON.stringify({ passed: true, stagingStored: true, model: data.ai_model, directMenuCandidates: direct, searchMenuCandidates: search, pricedCandidates: priced.length,
    discovery: data.analysis_result?.menu_discovery, unpricedCandidates: candidates.filter(menu => menu.unitPrice === null).length,
    automaticRegistrations: 0, sourceCount: data.fetch_summary?.checked_sources?.length ?? 0,
    menuEvidence: priced.map(menu => ({ name: menu.name, price: menu.unitPrice, tax: menu.taxInclusion, source: menu.sourceUrl })) }));
} finally {
  if (analysisId) {
    const { error } = await db.from("public_store_analyses").delete().eq("id", analysisId).is("converted_application_id", null);
    assert.equal(error, null, "Temporary staging analysis cleanup");
    console.log("PASS own temporary analysis removed; metered API evidence retained");
  }
}
