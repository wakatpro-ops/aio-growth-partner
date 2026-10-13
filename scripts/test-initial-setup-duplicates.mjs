// Run the real server workflow with an in-memory DB; --staging uses ONLY
// isolated synthetic fixtures in the existing staging project (no AI/email).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import * as rules from "../lib/onboarding/initial-setup-rules.ts";
import * as identity from "../lib/onboarding/location-identity.ts";
import * as models from "../lib/applications/operating-model.ts";

const live = process.argv.includes("--staging");
let db, state, store, snapshotId, org, ownerId, role = "org_owner";
const fixtureOrgs = [];
if (live) {
  const ref = "zlqqjifitnvorudxbepy";
  let keys;
  try { keys = JSON.parse(execFileSync("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
  catch { throw new Error("Staging authentication failed; credentials not logged"); }
  const key = keys.find(k => k.name === "aio_staging_vercel" && k.type === "secret")?.api_key;
  assert(key);
  db = createClient(`https://${ref}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await db.auth.admin.createUser({ email: `setup-duplicate-${randomUUID()}@example.invalid`, password: `${randomUUID()}Aa1!`, email_confirm: true });
  assert.equal(result.error, null); ownerId = result.data.user.id;
} else {
  ownerId = randomUUID();
  db = { from(table) {
    let op = "select", payload, options = {}, single = false;
    const filters = [];
    const q = {
      select() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; },
      is(k, v) { filters.push(r => (r[k] ?? null) === v); return q; },
      insert(p) { op = "insert"; payload = p; return q; }, upsert(p, o = {}) { op = "upsert"; payload = p; options = o; return q; },
      update(p) { op = "update"; payload = p; return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      then(resolve) {
        const rows = state[table] ??= [];
        let selected = rows.filter(r => filters.every(f => f(r)));
        if (op === "update") selected.forEach(r => Object.assign(r, structuredClone(payload)));
        if (op === "insert" || op === "upsert") {
          selected = [];
          for (const p of Array.isArray(payload) ? payload : [payload]) {
            const old = op === "upsert" ? rows.find(r => options.onConflict?.split(",").every(k => r[k] === p[k])) : null;
            if (old && options.ignoreDuplicates) continue;
            if (old) { Object.assign(old, structuredClone(p)); selected.push(old); }
            else { const row = { id: randomUUID(), archived_at: null, ...structuredClone(p) }; rows.push(row); selected.push(row); }
          }
        }
        resolve({ data: structuredClone(single ? selected[0] ?? null : selected), error: null });
      }
    }; return q;
  } };
}
const check = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const compiled = ts.transpileModule(readFileSync("lib/onboarding/initial-setup.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serverModule = { exports: {} };
new Function("require", "module", "exports", compiled)(name => {
  if (name === "server-only") return {};
  if (name.endsWith("location-identity")) return identity;
  if (name.endsWith("initial-setup-rules")) return rules;
  if (name.endsWith("operating-model")) return models;
  if (name === "@/config/industries") return { getIndustryConfig: () => ({ defaultFeatureFlags: {}, dashboardCards: [] }) };
  if (name === "@/lib/applications/options") return { normalizeIndustryTypeKey: v => v };
  if (name === "@/lib/auth/server") return { getCurrentUserAccess: async () => ({ accountActive: true, isPlatformAdmin: role === "platform_admin", userId: ownerId, organizationRoles: { [org]: role } }) };
  if (name === "@/lib/phase6/compliance-data") return { logAuditEvent: async () => {} };
  if (name === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => db };
  if (name === "@/lib/stores") return { getStore: async () => structuredClone(store) };
  if (name === "@/lib/unified-import/data") return {};
  throw new Error(`Unexpected import: ${name}`);
}, serverModule, serverModule.exports);
async function seed() {
  org = randomUUID(); snapshotId = randomUUID(); role = "org_owner";
  if (!live) state = {};
  fixtureOrgs.push(org);
  check(await db.from("organizations").insert({ id: org, name: "SYNTHETIC duplicate setup", status: "active" }));
  const model = models.normalizeOperatingModel({ structure: { mode: "multi_store", locations: [
    { name: "Primary", address: "巣鴨", websiteUrl: "https://example.invalid/primary" },
    { name: "Branch", address: "新宿", websiteUrl: "https://example.invalid/branch" }
  ] }, systems: { reservations: { authority: "manual" } } });
  store = { id: randomUUID(), organization_id: org, name: "Primary", address: "巣鴨", website_url: "https://example.invalid/primary", industry_type_key: "beauty_salon", status: "active", profile_data: {}, operating_model: model };
  check(await db.from("stores").insert(store));
  check(await db.from("onboarding_snapshots").insert({ id: snapshotId, organization_id: org, store_id: store.id, title: "SYNTHETIC", snapshot_type: "application_intake", confirmation_status: "pending", status: "active", content: { operating_model: model, extracted_profile: { services: [] } } }));
  const form = new FormData();
  for (const [k, v] of Object.entries({ final_confirmation: "on", store_name: "Primary", address: "巣鴨", website_url: store.website_url, industry_type_key: "beauty_salon", invoice_issuer_name: "SYNTHETIC", invoice_prefix: "TEST", structure_mode: "multi_store", location_enabled_0: "on", location_name_0: "Branch", location_address_0: "新宿", location_website_0: "https://example.invalid/branch" })) form.set(k, v);
  return form;
}
async function stores() { return check(await db.from("stores").select("*").eq("organization_id", org)); }
async function other(source = "other", archived = false, foreign = false) {
  const foreignOrg = randomUUID();
  if (foreign) { fixtureOrgs.push(foreignOrg); check(await db.from("organizations").insert({ id: foreignOrg, name: "SYNTHETIC foreign" })); }
  check(await db.from("stores").insert({ id: randomUUID(), organization_id: foreign ? foreignOrg : org, industry_type_key: "beauty_salon", name: "Branch", address: "新宿", website_url: "https://example.invalid/branch", onboarding_source_key: source, archived_at: archived ? new Date().toISOString() : null, status: "active", profile_data: { keep: "unchanged" } }));
}
try {
  let form = await seed();
  form.set("store_name", "Branch"); form.set("address", "新宿"); form.set("website_url", "https://example.invalid/branch");
  await serverModule.exports.confirmInitialSetup(store.id, form);
  assert.equal((await stores()).length, 1); console.log("PASS edited primary identity does not create duplicate");

  form = await seed(); await other();
  const before = await stores();
  await assert.rejects(serverModule.exports.confirmInitialSetup(store.id, form), /登録済み/);
  assert.deepEqual(await stores(), before); console.log("PASS existing store rejected before any store write");

  form = await seed(); await other(`initial-store:${snapshotId}:0`, true);
  const archivedBefore = await stores();
  await assert.rejects(serverModule.exports.confirmInitialSetup(store.id, form), /削除済み/);
  assert.deepEqual(await stores(), archivedBefore); console.log("PASS archived source remains archived and unchanged");

  form = await seed(); await other(`initial-store:${snapshotId}:0`);
  const retryStore = (await stores()).find(s => s.id !== store.id);
  await serverModule.exports.confirmInitialSetup(store.id, form);
  assert.deepEqual((await stores()).find(s => s.id === retryStore.id), retryStore);
  assert.equal((await stores()).length, 2); console.log("PASS partial retry reuses store without overwriting it");
  assert.equal((await serverModule.exports.confirmInitialSetup(store.id, form)).alreadyCompleted, true);
  assert.equal((await stores()).length, 2); console.log("PASS completed replay is idempotent");

  form = await seed(); await other("foreign", false, true);
  const concurrent = await Promise.allSettled([serverModule.exports.confirmInitialSetup(store.id, form), serverModule.exports.confirmInitialSetup(store.id, form)]);
  assert(concurrent.some(r => r.status === "fulfilled"));
  assert.equal((await stores()).length, 2); console.log("PASS same-snapshot double submission and foreign-organization isolation");

  for (const denied of ["staff", "viewer", "platform_admin"]) {
    form = await seed(); role = denied;
    await assert.rejects(serverModule.exports.confirmInitialSetup(store.id, form), /オーナー/);
    assert.equal((await stores()).length, 1);
  }
  console.log(`PASS permissions (${live ? "synthetic staging DB" : "in memory"})`);
} finally {
  if (live) {
    // These random IDs were created by this run; never touch real stores.
    for (const id of fixtureOrgs) check(await db.from("organizations").delete().eq("id", id));
    const remaining = check(await db.from("organizations").select("id").in("id", fixtureOrgs));
    assert.equal(remaining.length, 0);
    const result = await db.auth.admin.deleteUser(ownerId); check(result);
    console.log("PASS synthetic fixtures removed");
  }
}
