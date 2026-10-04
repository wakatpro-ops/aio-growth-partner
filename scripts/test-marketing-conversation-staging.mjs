// Staging-only API acceptance; no browser automation or persisted credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const ref = "zlqqjifitnvorudxbepy", base = process.env.MARKETING_TEST_URL;
assert(process.argv.includes("--staging-synthetic-live"));
assert(/^https:\/\/aio-growth-partner-[a-z0-9]+-wakatpro-3797s-projects\.vercel\.app$/.test(base));
const cli = (bin, args, env = process.env) => { try { return execFileSync(bin, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); } catch { throw new Error("CLI failed; sensitive output suppressed"); } };
const keys = JSON.parse(cli("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"]));
const secret = keys.find(k => k.name === "aio_staging_vercel" && k.type === "secret")?.api_key, anon = keys.find(k => k.type === "publishable")?.api_key;
assert(secret && anon);
const head = cli("vercel", ["curl", "/login", "--deployment", base, "--", "--head", "--silent", "--show-error", "--header", "x-vercel-set-bypass-cookie: true"], { ...process.env, VERCEL_PROJECT_ID: "prj_b7InveOcjuUuMhxEWllhRtU7eT3M", VERCEL_ORG_ID: "team_wlpBR7pDkaVGzgmdp9CUO9BI" });
const previewCookie = head.match(/^set-cookie: (_vercel_jwt=[^;]+)/imu)?.[1]; assert(previewCookie);
const db = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const org = randomUUID(), store = randomUUID(), otherStore = randomUUID(), item = randomUUID(), users = {};
const checked = (result, label = "DB") => { if (result.error) throw new Error(`${label}: ${result.error.code ?? "failed"}`); return result.data; };
const headers = (role = "owner") => ({ "Content-Type": "application/json", Origin: base, Cookie: [previewCookie, users[role]?.token && `aio_auth_access_token=${users[role].token}`].filter(Boolean).join("; ") });
const endpoint = `/api/stores/${store}/marketing-conversation`;
async function call(command, role = "owner", path = endpoint, origin = base) {
  const response = await fetch(`${base}${path}`, { method: command ? "POST" : "GET", headers: { ...headers(role), Origin: origin }, ...(command ? { body: JSON.stringify(command) } : {}), signal: AbortSignal.timeout(70000) });
  return { status: response.status, body: await response.json() };
}
const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; };
try {
  checked(await db.from("organizations").insert({ id: org, name: "MARKETING SYNTHETIC", status: "active" }));
  checked(await db.from("stores").insert([store, otherStore].map(id => ({ id, organization_id: org, name: "会話検証専用店舗", industry_type_key: "restaurant", status: "active", feature_flags: { marketing_drafts: true, growth_action_center: true, draft_editing: true, google_business_profile_drafts: true, instagram_drafts: true } }))));
  for (const role of ["owner", "staff", "viewer", "outsider"]) {
    const email = `marketing-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa9!`;
    const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
    users[role] = { id: user.id };
    checked(await db.from("user_profiles").upsert({ user_id: user.id, role: "user", display_name: `合成 ${role}`, status: "active" }));
    if (role === "owner") checked(await db.from("organization_members").insert({ organization_id: org, user_id: user.id, role_key: "org_owner", status: "active" }));
    if (["staff", "viewer"].includes(role)) checked(await db.from("store_memberships").insert({ store_id: store, organization_id: org, user_id: user.id, email, role_key: role, status: "active", invitation_status: "accepted" }));
    const auth = createClient(`https://${ref}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    users[role].token = checked(await auth.auth.signInWithPassword({ email, password })).session.access_token;
  }
  // Prove exact preview uses fresh staging-only store before any paid call.
  assert.equal(ok(await call(undefined, "owner", `/api/stores/${store}/summary`)).id, store);
  checked(await db.from("items").insert({ id: item, organization_id: org, store_id: store, industry_type_key: "restaurant", name: "検証用ハンバーグ", description: "手作りソースが特徴です。", unit: "個", unit_price: 1100, status: "active", availability: "available" }));
  let view = ok(await call()); assert.equal(view.offer.id, "connect-google");
  view = ok(await call({ revision: view.revision, action: "defer", value: view.offer.id }));
  assert.notEqual(ok(await call()).offer?.id, "connect-google");
  assert.equal((await call({ revision: 0, action: "cancel" })).status, 409);
  assert.equal(ok(await call(undefined, "staff")).revision, 0, "user state isolation");
  for (const role of ["viewer", "outsider", "anonymous"]) assert([401, 403, 404].includes((await call(undefined, role)).status));
  assert([403, 404].includes((await call(undefined, "staff", `/api/stores/${otherStore}/marketing-conversation`)).status));
  assert.equal((await call({ revision: view.revision, action: "cancel" }, "owner", endpoint, "https://untrusted.example")).status, 403);
  const direct = createClient(`https://${ref}.supabase.co`, anon, { global: { headers: { Authorization: `Bearer ${users.owner.token}` } } });
  assert.equal((await direct.from("marketing_conversations").select("*")).error?.code, "42501");
  assert.equal((await direct.rpc("save_marketing_conversation", { p_actor: users.owner.id, p_store: store, p_revision: 0, p_state: {} })).error?.code, "42501");
  assert((await db.rpc("save_marketing_conversation", { p_actor: users.viewer.id, p_store: store, p_revision: 0, p_state: {} })).error);
  console.log("PASS staging identity, missing connection, defer/resume, stale revision, role/store isolation, CSRF, service-only RPC");

  // Synthetic connection metadata only: no token, no real external account, no outbound send.
  checked(await db.from("external_channel_accounts").insert({ organization_id: org, store_id: store, channel: "instagram", external_provider: "meta", account_name: "SYNTHETIC NO TOKEN", connection_status: "connected" }));
  view = ok(await call());
  view = ok(await call({ revision: view.revision, action: "start", value: "post-instagram" })); assert.equal(view.state.step, "subject");
  view = ok(await call({ revision: view.revision, action: "answer", itemId: item })); assert.equal(view.state.step, "details");
  assert.equal(ok(await call()).state.brief.subject, "検証用ハンバーグ");
  view = ok(await call({ revision: view.revision, action: "answer", value: "手作りソースの魅力を伝えたいです。" })); assert.equal(view.state.step, "confirm");
  const generate = { revision: view.revision, action: "generate" };
  const parallel = await Promise.all([call(generate), call(generate)]);
  assert(parallel.some(result => result.status === 200), JSON.stringify(parallel));
  view = ok(await call()); assert.equal(view.state.step, "done");
  const id = view.state.actionId;
  assert.equal(ok(await call(generate)).state.actionId, id, "lost-response replay returns same draft");
  const actions = checked(await db.from("growth_actions").select("id,status,published_at").eq("store_id", store));
  assert.equal(actions.length, 1); assert.equal(actions[0].status, "drafted"); assert.equal(actions[0].published_at, null);
  const draft = checked(await db.from("growth_action_drafts").select("body").eq("growth_action_id", id).single()); assert(draft.body.includes("ハンバーグ"));
  const page = await fetch(`${base}/stores/${store}/growth-actions/${id}/edit`, { headers: headers() });
  const html = await page.text(); assert.equal(page.status, 200); assert(html.includes("下書き編集") && html.includes("手作り"));
  for (const table of ["external_publish_jobs"]) {
    const result = await db.from(table).select("id").eq("store_id", store); checked(result, table); assert.equal(result.data.length, 0);
  }
  const events = checked(await db.from("ai_usage_events").select("id,feature,status,input_tokens,output_tokens").eq("store_id", store));
  assert.equal(events.length, 1); assert.equal(events[0].feature, "marketing_conversation"); assert.equal(events[0].status, "success");
  console.log("PASS actual AI generation, parallel double-submit, exactly one draft + one metered call, populated edit page, no publish jobs");
  checked(await db.from("growth_actions").update({ archived_at: new Date().toISOString() }).eq("id", id));
  assert.equal(ok(await call()).actionAvailable, false);
  checked(await db.from("growth_actions").update({ archived_at: null }).eq("id", id));
  assert.equal(ok(await call()).actionAvailable, true);
  checked(await db.from("user_profiles").update({ status: "suspended" }).eq("user_id", users.owner.id));
  assert([401, 403, 404].includes((await call({ revision: view.revision, action: "cancel" })).status));
  console.log("PASS archived/restored draft visibility and revoked account denial");
} finally {
  checked(await db.from("organizations").delete().eq("id", org), "synthetic org cleanup");
  for (const user of Object.values(users)) checked(await db.auth.admin.deleteUser(user.id), "synthetic auth cleanup");
  assert.equal(checked(await db.from("stores").select("id").in("id", [store, otherStore])).length, 0);
  console.log("PASS synthetic fixtures removed; append-only AI usage evidence retained, no credentials persisted");
}
