// Explicitly opt-in: synthetic staging records, ONE paid assistant call, protected-preview browser QA.
// No credentials, cookies, storage state, prompts or replies are written to files or printed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const stagingRef = "zlqqjifitnvorudxbepy";
const stagingOrganization = "gprkjuklwwjleoktmpvp";
const previewPattern = /^https:\/\/aio-growth-partner-[a-z0-9]+-wakatpro-3797s-projects\.vercel\.app$/u;
const screenshotDirectory = "/private/tmp/aiob-usage-qa";
let validationPhase = "initialization";
const pass = (checks, name) => { checks.push(name); console.log(`PASS ${name}`); };
const checked = (result, label) => { if (result.error) throw new Error(`Staging operation failed: ${label}`); return result.data; };
function cli(binary, args, env = process.env) {
  try { return execFileSync(binary, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 }); }
  catch { throw new Error("Official CLI operation failed; credential-bearing output was suppressed"); }
}

async function main() {
  assert(process.argv.includes("--staging-synthetic-live"), "Pass --staging-synthetic-live for synthetic staging and ONE paid AI call");
  const base = process.env.AI_USAGE_TEST_URL;
  assert(typeof base === "string" && previewPattern.test(base), "Set AI_USAGE_TEST_URL to the exact isolated protected preview; no default, production alias or staging alias is accepted");
  const projects = JSON.parse(cli("/opt/homebrew/bin/supabase", ["projects", "list", "--output", "json"]));
  const project = projects.find(entry => entry.id === stagingRef);
  assert(project?.name === "aio-growth-partner-staging" && project.organization_id === stagingOrganization, "Existing staging project/organization identity mismatch");
  const keys = JSON.parse(cli("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", stagingRef, "--reveal", "--output", "json"]));
  const secret = keys.find(entry => entry.name === "aio_staging_vercel" && entry.type === "secret")?.api_key;
  const publicKey = keys.find(entry => entry.type === "publishable")?.api_key;
  assert(secret && publicKey, "Expected pre-existing staging credentials are unavailable");
  const head = cli("vercel", ["curl", "/login", "--deployment", base, "--", "--head", "--silent", "--show-error", "--header", "x-vercel-set-bypass-cookie: true"], {
    ...process.env, VERCEL_PROJECT_ID: "prj_b7InveOcjuUuMhxEWllhRtU7eT3M", VERCEL_ORG_ID: "team_wlpBR7pDkaVGzgmdp9CUO9BI"
  });
  const previewCookie = head.match(/^set-cookie: (_vercel_jwt=[^;]+)/imu)?.[1];
  assert(previewCookie, "Protected preview needs the official CLI authentication cookie");
  const db = createClient(`https://${stagingRef}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const organizationId = randomUUID(), storeId = randomUUID();
  const marker = `AI_USAGE_SYNTHETIC_${randomUUID()}`;
  const storeName = `AI利用検証用・合成店舗 ${randomUUID().slice(0, 8)}`;
  const users = {}, checks = [], eventIds = [], screenshots = [];
  let browser, paidCalls = 0, cleaned = false;
  let meteredResult;
  const headers = role => ({ "Content-Type": "application/json", Cookie: [previewCookie, role && `aio_auth_access_token=${users[role].token}`].filter(Boolean).join("; ") });
  const getJson = async (path, role = "owner") => {
    const response = await fetch(`${base}${path}`, { headers: headers(role), redirect: "error", signal: AbortSignal.timeout(45_000) });
    let body; try { body = await response.json(); } catch { throw new Error("Preview JSON response unavailable"); }
    return { response, body };
  };
  const eventColumns = "id,operation_id,attempt,feature,organization_id,store_id,user_id,provider,endpoint,model,service_tier,status,http_status,request_id,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,web_search_calls,token_cost_usd,tool_cost_usd,estimated_cost_usd,cost_status,price_version,pricing_snapshot,duration_ms,created_at";
  const readFixtureEvents = async () => checked(await db.from("ai_usage_events").select(eventColumns).eq("store_id", storeId).eq("user_id", users.owner.id).order("created_at"), "read exact fixture usage events");
  try {
    // Check migration availability before creating fixtures or making any provider request.
    checked(await db.from("ai_usage_settings").select("id,metering_started_at").eq("id", "default").single(), "metering schema readiness");
    checked(await db.from("organizations").insert({ id: organizationId, name: "AI USAGE SYNTHETIC ONLY", status: "active" }), "create synthetic organization");
    checked(await db.from("stores").insert({ id: storeId, organization_id: organizationId, name: storeName, industry_type_key: "general_store", status: "active" }), "create synthetic store");
    for (const role of ["operator", "owner", "manager", "staff"]) {
      const email = `ai-usage-${role}-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa9!`;
      const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), "create synthetic identity").user;
      assert(user?.id, "Synthetic identity missing");
      users[role] = { id: user.id };
      checked(await db.from("user_profiles").upsert({ user_id: user.id, display_name: `合成AI利用検証 ${role}`, role: role === "operator" ? "platform_admin" : "user", status: "active" }), "create synthetic profile");
      if (role === "owner") checked(await db.from("organization_members").insert({ organization_id: organizationId, user_id: user.id, role_key: "org_owner", status: "active" }), "owner membership");
      if (["manager", "staff"].includes(role)) checked(await db.from("store_memberships").insert({ organization_id: organizationId, store_id: storeId, user_id: user.id, email, role_key: role === "manager" ? "store_manager" : "staff", status: "active", invitation_status: "accepted" }), "scoped synthetic membership");
      const client = createClient(`https://${stagingRef}.supabase.co`, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const session = checked(await client.auth.signInWithPassword({ email, password }), "synthetic sign-in").session;
      assert(session?.access_token, "Synthetic session unavailable");
      users[role].token = session.access_token;
    }

    // Critical gate: a random store created only in this staging DB must be read by THIS exact preview.
    for (const role of ["operator", "owner", "manager", "staff"]) {
      const summary = await getJson(`/api/stores/${storeId}/summary`, role);
      assert(summary.response.status === 200 && summary.body.id === storeId && summary.body.name === storeName, "Exact preview did not prove access to the freshly generated staging fixture; refusing paid call");
      const identity = await getJson(`/api/auth/me?store_id=${storeId}`, role);
      const expectedRole = { operator: "platform_admin", owner: "org_owner", manager: "store_manager", staff: "staff" }[role];
      assert(identity.response.status === 200 && identity.body.role === expectedRole && identity.body.displayName === `合成AI利用検証 ${role}`, "Exact preview/staging identity or effective-role mismatch; refusing paid call");
    }
    const pagePath = `/stores/${storeId}`;
    const context = await getJson(`/api/stores/${storeId}/assistant?${new URLSearchParams({ pathname: pagePath, search: "" })}`);
    assert(context.response.status === 200 && context.body.key?.startsWith(pagePath), "Read-only assistant context must identify this exact fixture before the paid call");
    assert(/no-store/u.test(context.response.headers.get("cache-control") ?? ""), "Assistant context must not be shared cached");
    assert((await readFixtureEvents()).length === 0, "Context/page reads must not generate AI usage");
    pass(checks, "Exact protected preview proves staging DB + all four fresh identities before any paid AI");

    for (const role of [null, "operator", "owner", "manager", "staff"]) {
      const client = createClient(`https://${stagingRef}.supabase.co`, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(role ? { global: { headers: { Authorization: `Bearer ${users[role].token}` } } } : {})
      });
      for (const table of ["ai_usage_events", "ai_usage_settings", "ai_usage_monthly_settings"]) {
        const denied = await client.from(table).select("*").limit(1);
        assert(denied.error?.code === "42501", "Every JWT including operator must be denied direct usage/settings table reads");
      }
      const deniedRpc = await client.rpc("ai_usage_dashboard_summary", { p_month: "2099-12-01", p_now: "2099-12-05T03:00:00Z" });
      assert(deniedRpc.error?.code === "42501", "Direct summary RPC must be service-only");
    }
    pass(checks, "Anonymous and operator/owner/manager/staff JWTs denied all direct usage/settings reads and summary RPC");

    browser = await chromium.launch({ headless: true });
    await mkdir(screenshotDirectory, { recursive: true, mode: 0o700 });
    await chmod(screenshotDirectory, 0o700);
    const previewCookieValue = previewCookie.slice("_vercel_jwt=".length);
    const contexts = [];
    const browserFor = async role => {
      const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      contexts.push(browserContext);
      await browserContext.addCookies([
        { name: "_vercel_jwt", value: previewCookieValue, url: base, httpOnly: true, secure: true, sameSite: "Lax" },
        ...(role ? [{ name: "aio_auth_access_token", value: users[role].token, url: base, httpOnly: true, secure: true, sameSite: "Lax" }] : [])
      ]);
      // Browser navigation is read-only and can NEVER add another paid AI call.
      await browserContext.route("**/api/stores/*/assistant", route => route.request().method() === "POST" ? route.abort() : route.continue());
      return browserContext.newPage();
    };
    for (const role of [null, "owner", "manager", "staff"]) {
      const page = await browserFor(role);
      await page.goto(`${base}/admin/ai-logs`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForURL(url => url.pathname === (role ? "/forbidden" : "/login"), { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "AI利用料と稼働状況", exact: true })).toHaveCount(0);
      await page.close();
    }
    const operatorPage = await browserFor("operator");
    await operatorPage.goto(`${base}/admin/ai-logs`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(operatorPage.getByRole("heading", { name: "AI利用料と稼働状況", exact: true })).toBeVisible();
    assert(new URL(operatorPage.url()).pathname === "/admin/ai-logs", "Operator usage page must remain accessible");
    assert((await readFixtureEvents()).length === 0, "Admin/browser reads must not trigger provider calls");
    pass(checks, "Browser: only operator reaches usage dashboard; anonymous/owner/manager/staff rejected");

    // Exercise the real server action using an unused far-future staging month.
    // Never change the current month's fee or any existing configured month.
    const settingsMonth = "2099-11";
    validationPhase = "read-unused-month";
    const priorSettings = checked(await db.from("ai_usage_monthly_settings").select("usd_jpy,service_revenue_jpy").eq("month", `${settingsMonth}-01`).maybeSingle(), "read synthetic settings month");
    assert(!priorSettings || (priorSettings.usd_jpy === null && priorSettings.service_revenue_jpy === null), "Synthetic settings month must be unconfigured");
    await operatorPage.goto(`${base}/admin/ai-logs?month=${settingsMonth}`, { waitUntil: "domcontentloaded" });
    try {
      validationPhase = "fill-operator-settings";
      await operatorPage.locator('input[name="usd_jpy"]').fill("150");
      await operatorPage.locator('input[name="service_revenue_jpy"]').fill("50000");
      await operatorPage.getByRole("button", { name: "この月の計算条件を更新", exact: true }).click();
      validationPhase = "settings-save-feedback";
      await expect(operatorPage.getByRole("status")).toContainText("更新しました", { timeout: 30000 });
      await expect(operatorPage.locator('input[name="usd_jpy"]')).toHaveValue("150");
      const saved = checked(await db.from("ai_usage_monthly_settings").select("usd_jpy,service_revenue_jpy,updated_by").eq("month", `${settingsMonth}-01`).single(), "verify server-action settings");
      assert(Number(saved.usd_jpy) === 150 && Number(saved.service_revenue_jpy) === 50000 && saved.updated_by === users.operator.id, "Operator form must persist its exact inputs");
      await operatorPage.reload({ waitUntil: "domcontentloaded" });
      validationPhase = "settings-refresh-clear";
      await expect(operatorPage.locator('input[name="usd_jpy"]')).toHaveValue("150");
      await operatorPage.locator('input[name="usd_jpy"]').fill("");
      await operatorPage.locator('input[name="service_revenue_jpy"]').fill("");
      await operatorPage.getByRole("button", { name: "この月の計算条件を更新", exact: true }).click();
      await expect(operatorPage.getByRole("status")).toContainText("更新しました", { timeout: 30000 });
    } finally {
      // Audited service RPC is also used if browser assertions fail mid-form.
      checked(await db.rpc("save_ai_usage_monthly_settings", { p_month: `${settingsMonth}-01`, p_usd_jpy: null, p_service_revenue_jpy: null, p_actor_user_id: users.operator.id }), "clear synthetic settings only");
    }
    const clearedSettings = checked(await db.from("ai_usage_monthly_settings").select("usd_jpy,service_revenue_jpy").eq("month", `${settingsMonth}-01`).single(), "verify cleared synthetic settings");
    assert(clearedSettings.usd_jpy === null && clearedSettings.service_revenue_jpy === null, "Synthetic configuration must end unconfigured");
    await operatorPage.goto(`${base}/admin/ai-logs`, { waitUntil: "domcontentloaded" });
    pass(checks, "Real operator settings form saves, survives refresh and clears; only unconfigured 2099-11 staging month used");

    assert(paidCalls === 0, "Only one explicit paid call is permitted");
    validationPhase = "single-ai-call";
    paidCalls++;
    const response = await fetch(`${base}/api/stores/${storeId}/assistant`, {
      method: "POST", headers: headers("owner"), redirect: "error", signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ pathname: pagePath, search: "", history: [], message: `これは合成店舗の動作検証です。登録情報が不足していれば不足していると短い1文で回答してください。識別子 ${marker} は回答に含めないでください。` })
    });
    let reply; try { reply = await response.json(); } catch { throw new Error("Single paid assistant call returned a non-JSON response; it will NOT be retried"); }
    assert(response.status === 200 && typeof reply.answer === "string" && reply.answer.length > 0 && typeof reply.model === "string", "Single paid assistant call failed or produced no answer; it will NOT be retried");
    const events = await readFixtureEvents();
    assert(events.length === 1, "Exactly one evidence row must be saved for the no-retry assistant request");
    const event = events[0]; eventIds.push(event.id);
    assert(event.organization_id === organizationId && event.store_id === storeId && event.user_id === users.owner.id, "Usage attribution must match exact organization/store/actor");
    assert(event.feature === "assistant" && event.provider === "openai" && event.endpoint === "/v1/chat/completions" && event.status === "success" && event.http_status === 200 && event.attempt === 1, "Usage request metadata must match the one successful call");
    assert(event.model === reply.model && Number.isInteger(event.input_tokens) && event.input_tokens > 0 && Number.isInteger(event.output_tokens) && event.output_tokens > 0, "Provider-resolved model and numeric usage must be recorded");
    assert(typeof event.operation_id === "string" && typeof event.price_version === "string" && event.duration_ms >= 0, "Operation, pricing version and duration must be available");
    const serialized = JSON.stringify(event);
    assert(!serialized.includes(marker) && !Object.hasOwn(event, "input") && !Object.hasOwn(event, "output") && !Object.hasOwn(event, "error_message"), "Usage evidence must contain neither prompt/response/error bodies nor the prompt canary");
    if (event.cost_status === "estimated") {
      const snapshot = event.pricing_snapshot;
      assert(snapshot?.currency === "USD" && snapshot.source?.startsWith("https://developers.openai.com/") && snapshot.version === event.price_version, "Estimated cost must preserve source/rate version");
      const tokenCost = ((event.input_tokens - event.cached_input_tokens - event.cache_write_tokens) * snapshot.input + event.cached_input_tokens * snapshot.cached + event.cache_write_tokens * snapshot.cache_write + event.output_tokens * snapshot.output) / 1_000_000;
      assert(Math.abs(Number(event.token_cost_usd) - tokenCost) <= 1e-9 && Number(event.tool_cost_usd) === 0 && Math.abs(Number(event.estimated_cost_usd) - tokenCost) <= 1e-9, "Stored request cost must independently recalculate from saved token counts/rates");
    } else {
      assert(event.cost_status === "unpriced" && event.estimated_cost_usd === null, "Missing modern cache details must remain explicitly unpriced, never assumed zero");
    }
    meteredResult = { model: event.model, costStatus: event.cost_status, inputTokens: event.input_tokens, outputTokens: event.output_tokens, cachedInputTokens: event.cached_input_tokens, cacheWriteTokens: event.cache_write_tokens, estimatedCostUsd: event.estimated_cost_usd };
    pass(checks, "ONE paid AI request: exact attribution, provider usage, operation/attempt, privacy-safe evidence and saved-rate calculation");

    for (const width of [1440, 390]) {
      validationPhase = `visual-${width}`;
      await operatorPage.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await operatorPage.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(operatorPage.getByRole("heading", { name: "AI利用料と稼働状況", exact: true })).toBeVisible();
      await expect(operatorPage.getByText(storeName, { exact: true })).toBeVisible();
      await operatorPage.evaluate(() => document.fonts.ready);
      const dimensions = await operatorPage.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(dimensions.scroll <= dimensions.width + 1, "Usage dashboard must not overflow the desktop/mobile viewport");
      const path = `${screenshotDirectory}/${storeId}-${width}.png`;
      await operatorPage.screenshot({ path, fullPage: true });
      await chmod(path, 0o600);
      screenshots.push(path);
    }
    assert((await readFixtureEvents()).length === 1 && paidCalls === 1, "Dashboard refreshes must not create additional AI requests");
    pass(checks, "Live usage shown at 1440px and 390px without page overflow; private screenshots saved");
    for (const browserContext of contexts) await browserContext.close();
  } finally {
    if (browser) {
      const pages = browser.contexts().flatMap(context => context.pages());
      const page = pages.find(candidate => candidate.url().includes("/admin/ai-logs"));
      if (page) await page.screenshot({ path: `${screenshotDirectory}/latest-dashboard.png`, fullPage: true }).catch(() => {});
    }
    if (browser) await browser.close().catch(() => {});
    const failures = [];
    // Also retain IDs when the single provider call failed after recording evidence.
    if (users.owner?.id) {
      const evidence = await db.from("ai_usage_events").select("id").eq("store_id", storeId).eq("user_id", users.owner.id);
      if (evidence.error) failures.push("fixture evidence lookup before cleanup");
      else for (const event of evidence.data ?? []) if (!eventIds.includes(event.id)) eventIds.push(event.id);
    }
    // Usage is append-only. Delete only this invocation's replaceable synthetic fixtures;
    // foreign keys SET NULL and the real staging API-cost evidence remains intact.
    const organization = await db.from("organizations").delete().eq("id", organizationId);
    if (organization.error) failures.push("synthetic organization cleanup");
    for (const user of Object.values(users)) {
      const deleted = await db.auth.admin.deleteUser(user.id);
      if (deleted.error) failures.push("synthetic identity cleanup");
    }
    for (const [table, id] of [["organizations", organizationId], ["stores", storeId]]) {
      const result = await db.from(table).select("id").eq("id", id);
      if (result.error || result.data?.length) failures.push(`${table} cleanup verification`);
    }
    for (const user of Object.values(users)) {
      const result = await db.auth.admin.getUserById(user.id);
      if (result.data?.user || (result.error && result.error.status !== 404)) failures.push("synthetic auth cleanup verification");
    }
    if (eventIds.length) {
      const retained = await db.from("ai_usage_events").select("id,organization_id,store_id,user_id").in("id", eventIds);
      if (retained.error || retained.data?.length !== eventIds.length || retained.data.some(event => event.organization_id !== null || event.store_id !== null || event.user_id !== null)) failures.push("append-only evidence preservation verification");
    }
    cleaned = failures.length === 0;
    assert(cleaned, `Synthetic cleanup incomplete: ${failures.join(", ")}`);
    console.log("PASS exact synthetic organization/store/user cleanup; actual staging usage evidence retained with null fixture references");
    console.log(JSON.stringify({ cleanup: true, paidCalls, retainedUsageEventIds: eventIds, settingsChanged: false }));
  }
  console.log(JSON.stringify({ passed: true, checks, paidCalls, meteredResult, retainedUsageEventIds: eventIds, screenshots, cleanup: cleaned, currentSettingsChanged: false, syntheticSettingsCleared: true, credentialsWritten: false }, null, 2));
}

main().catch(error => {
  // Our assertions are fixed, non-secret diagnostics; suppress unexpected SDK/network details.
  const message = error instanceof assert.AssertionError || error instanceof Error && /^(Staging operation failed:|Official CLI operation failed|Preview JSON response unavailable|Single paid assistant call)/u.test(error.message) ? error.message : "Staging validation failed; raw diagnostic output suppressed";
  console.error(message);
  console.error(JSON.stringify({ phase: validationPhase, errorType: error?.name, browserHint: /^(locator\.|page\.|expect\()/u.test(error?.message ?? "") ? error.message.split("\n")[0].slice(0, 250) : null }));
  process.exitCode = 1;
});
