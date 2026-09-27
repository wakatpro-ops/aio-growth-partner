// Real auth and routing regression tests. Only synthetic fixtures in AIOb staging.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ref = "zlqqjifitnvorudxbepy";
const local = process.argv.includes("--local");
const base = local ? "http://127.0.0.1:3192" : "https://staging.aioboost.jp";
const keys = JSON.parse(execFileSync("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const secret = keys.find(k => k.name === "aio_staging_vercel" && k.type === "secret")?.api_key;
const anon = keys.find(k => k.type === "publishable")?.api_key;
assert(secret && anon);
const db = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const check = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const org = randomUUID(), store = randomUUID(), second = randomUUID(), foreignOrg = randomUUID(), foreign = randomUUID();
const applications = [], users = {}, results = [];
const passed = test => { results.push({ test, passed: true }); console.log(`PASS ${test}`); };
let server, browser;

async function session(role, extra = {}, lastStoreId = foreign) {
  const response = await fetch(`${base}/api/auth/session`, {
    method: "POST", headers: { "content-type": "application/json", cookie: `aio_last_store_id=${lastStoreId}` },
    body: JSON.stringify({ access_token: users[role].token, expires_in: 3600, ...extra })
  });
  return { response, body: await response.json() };
}
async function expectSession(role, expected, extra = {}, lastStoreId) {
  const { response, body } = await session(role, extra, lastStoreId);
  assert.equal(response.status, 200, `${role}: ${body.error}`);
  assert.equal(body.next_path, expected, role);
  return response.headers.get("set-cookie").split(";")[0];
}
async function expectDashboard(response, expected) {
  // Next streams redirects as a refresh tag once the response has started.
  assert([200, 307].includes(response.status));
  const location = response.headers.get("location")
    ?? (await response.text()).match(/http-equiv="refresh" content="[^\"]*url=([^\"]+)"/)?.[1];
  assert(location, "dashboard supplied a redirect");
  assert.equal(new URL(location, base).pathname, expected);
}
async function application(role, state = "started") {
  const id = randomUUID(); applications.push(id);
  check(await db.from("applications").insert({
    id, store_name: "LOGIN ROUTING SYNTHETIC", contact_name: "SYNTHETIC", email: users[role].email,
    store_count: 1, pain_points: "routing test", status: "account_issued", approval_status: "approved",
    payment_status: "paid", account_status: "issued", invitation_status: "password_set",
    onboarding_status: state, invited_user_id: users[role].id, store_id: store, organization_id: org
  }));
  return id;
}
try {
  if (local) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3192"], {
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: secret },
      stdio: ["ignore", "pipe", "pipe"]
    });
    server.stdout.on("data", () => {}); server.stderr.on("data", () => {});
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert(ready, "local server ready");
  }
  for (const role of ["owner", "manager", "staff", "viewer", "none", "admin", "disabled"]) {
    const email = `role-login-${role}-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa9!`;
    const user = check(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
    users[role] = { id: user.id, email, password };
    check(await db.from("user_profiles").upsert({ user_id: user.id, display_name: "ログイン検証", role: role === "admin" ? "platform_admin" : "user", status: "active" }));
    const auth = createClient(`https://${ref}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    users[role].token = check(await auth.auth.signInWithPassword({ email, password })).session.access_token;
  }
  check(await db.from("user_profiles").update({ status: "suspended" }).eq("user_id", users.disabled.id));
  check(await db.from("organizations").insert([org, foreignOrg].map(id => ({ id, name: "LOGIN ROUTING SYNTHETIC", status: "active" }))));
  check(await db.from("stores").insert([
    { id: store, organization_id: org }, { id: foreign, organization_id: foreignOrg }
  ].map(row => ({ ...row, name: "ログイン検証店舗", industry_type_key: "beauty_salon", status: "active", profile_data: { onboarding_status: "not_started" } }))));
  check(await db.from("organization_members").insert({ organization_id: org, user_id: users.owner.id, role_key: "org_owner", status: "active" }));
  check(await db.from("store_memberships").insert(["manager", "staff", "viewer", "disabled", "admin"].map(role => ({
    organization_id: org, store_id: store, user_id: users[role].id, email: users[role].email,
    role_key: role === "manager" ? "store_manager" : role === "viewer" ? "viewer" : "staff", status: "active", invitation_status: "accepted"
  }))));
  const ownerApp = await application("owner");
  await application("manager"); await application("staff"); await application("admin");
  check(await db.from("onboarding_snapshots").insert({
    organization_id: org, store_id: store, snapshot_type: "application_intake", title: "初期設定検証",
    content: { extracted_profile: { services: ["合成メニュー"] } }, confirmation_status: "pending", status: "active"
  }));
  for (const role of ["owner", "manager", "staff", "viewer", "none", "admin"]) {
    const expected = role === "admin" ? "/admin" : role === "none" ? "/no-store" : `/stores/${store}`;
    const cookie = await expectSession(role, expected);
    const dashboard = await fetch(`${base}/dashboard`, { redirect: "manual", headers: { cookie: `${cookie}; aio_last_store_id=${foreign}` } });
    await expectDashboard(dashboard, expected);
    passed(`${role}: normal session + dashboard, pending setup ignored`);
  }
  assert.equal((await session("disabled")).response.status, 403); passed("disabled account rejected");
  await expectSession("owner", `/onboarding/setup-review?storeId=${store}`, { initial_setup_store_id: store }); passed("owner invitation explicitly opens setup");
  for (const role of ["manager", "staff", "viewer", "admin"]) {
    await expectSession(role, role === "admin" ? "/admin" : `/stores/${store}`, { initial_setup_store_id: store });
  }
  await expectSession("owner", `/stores/${store}`, { initial_setup_store_id: foreign }); passed("setup request cannot cross role/tenant boundaries");
  check(await db.from("onboarding_snapshots").update({ confirmation_status: "completed" }).eq("store_id", store));
  await expectSession("owner", `/stores/${store}`, { initial_setup_store_id: store }); passed("completed snapshot overrides stale application on invitation");
  check(await db.from("onboarding_snapshots").update({ confirmation_status: "pending" }).eq("store_id", store));

  browser = await chromium.launch({ headless: true });
  for (const [role, width] of [["owner", 1440], ["manager", 390], ["staff", 390], ["viewer", 1440], ["admin", 1440]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(`${base}/login`);
      await page.locator("#email").fill(users[role].email); await page.locator("#password").fill(users[role].password);
      await page.getByRole("button", { name: "ログイン", exact: true }).click();
      await page.waitForURL(url => url.pathname === (role === "admin" ? "/admin" : `/stores/${store}`), { timeout: 60000 });
      await page.locator("h1").first().waitFor();
      assert.equal(await page.getByText("管理画面は、すでに準備できています", { exact: true }).count(), 0);
      if (role !== "admin") {
        assert.equal(await page.getByRole("link", { name: "管理者トップ", exact: true }).count(), 0);
        assert.match(await page.locator("h1").first().innerText(), /店舗トップ/);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${role}: no horizontal overflow`);
        const denied = await page.request.get(`${base}/api/stores/${foreign}/summary`);
        assert([403, 404].includes(denied.status()));
        await page.goto(`${base}/admin`);
        await page.waitForURL(url => url.pathname === "/forbidden");
      }
      passed(`${role}: real browser login (${width}px), correct page and authorization`);
    } finally { await context.close(); }
  }

  // Exercise the real password form, including its invitation vs recovery payload.
  for (const recovery of [false, true]) {
    const context = await browser.newContext();
    try {
      await context.addCookies([{ name: "aio_auth_access_token", value: users.owner.token, url: base, httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      const next = `/onboarding/setup-review?storeId=${store}`;
      await page.goto(`${base}/auth/set-password?next=${encodeURIComponent(next)}${recovery ? "&mode=recovery" : ""}`);
      const password = `${randomUUID()}Aa9!`;
      await page.locator("#password").fill(password); await page.locator("#confirm_password").fill(password);
      await page.getByRole("button", { name: "パスワードを設定して進む" }).click();
      await page.waitForURL(url => url.pathname === (recovery ? `/stores/${store}` : "/onboarding/setup-review"), { timeout: 60000 });
      const auth = createClient(`https://${ref}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      users.owner.token = check(await auth.auth.signInWithPassword({ email: users.owner.email, password })).session.access_token;
      passed(`password form: ${recovery ? "recovery goes home" : "invitation continues setup"}`);
    } finally { await context.close(); }
  }

  // Actual password update for the synthetic owner: existing progress must survive.
  for (const state of ["started", "completed"]) {
    check(await db.from("applications").update({ onboarding_status: state }).eq("id", ownerApp));
    const password = `${randomUUID()}Aa9!`;
    const reset = await fetch(`${base}/api/auth/set-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ access_token: users.owner.token, password }) });
    assert.equal(reset.status, 200);
    assert.equal(check(await db.from("applications").select("onboarding_status").eq("id", ownerApp).single()).onboarding_status, state);
    const auth = createClient(`https://${ref}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    users.owner.token = check(await auth.auth.signInWithPassword({ email: users.owner.email, password })).session.access_token;
    await expectSession("owner", `/stores/${store}`); passed(`password reset preserves ${state} and returns home`);
  }
  check(await db.from("stores").insert({ id: second, organization_id: org, name: "ログイン検証２号店", industry_type_key: "beauty_salon", status: "active" }));
  await expectSession("owner", "/stores");
  await expectSession("owner", `/stores/${second}`, {}, second);
  const cookie = await expectSession("owner", `/stores/${second}`, {}, second);
  const dashboard = await fetch(`${base}/dashboard`, { redirect: "manual", headers: { cookie: `${cookie}; aio_last_store_id=${second}` } });
  await expectDashboard(dashboard, `/stores/${second}`);
  await expectSession("staff", `/stores/${store}`, {}, second); passed("multiple stores respect last authorized store, never expand staff access");
  check(await db.from("stores").update({ status: "inactive" }).eq("id", second));
  await expectSession("owner", `/stores/${store}`, {}, second); passed("inactive recent store excluded");
} finally {
  await browser?.close(); server?.kill("SIGTERM");
  // Delete only this run's explicitly generated synthetic fixtures.
  const failures = [];
  for (const id of applications) { const r = await db.from("applications").delete().eq("id", id); if (r.error) failures.push(r.error.message); }
  for (const id of [org, foreignOrg]) { const r = await db.from("organizations").delete().eq("id", id); if (r.error) failures.push(r.error.message); }
  for (const u of Object.values(users)) { const r = await db.auth.admin.deleteUser(u.id); if (r.error) failures.push(r.error.message); }
  const remaining = check(await db.from("organizations").select("id").in("id", [org, foreignOrg]));
  const cleanup = failures.length === 0 && remaining.length === 0;
  console.log(`Fixture cleanup: ${cleanup ? "PASS" : "FAIL"}`);
  await mkdir("test-results", { recursive: true });
  await writeFile(`test-results/role-login-${local ? "local" : "staging"}.json`, JSON.stringify({ base, results, cleanup }, null, 2));
  assert(cleanup, "synthetic fixture cleanup");
}
