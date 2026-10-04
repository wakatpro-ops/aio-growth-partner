// Isolated staging DB + existing protected AI key in a non-production Vercel preview.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const ref = "zlqqjifitnvorudxbepy", base = process.env.AIO_TEST_URL;
assert(process.argv.includes("--staging-synthetic-live"));
assert(/^https:\/\/aio-growth-partner-[a-z0-9]+-wakatpro-3797s-projects\.vercel\.app$/.test(base));
const cli = (bin, args, env = process.env) => { try { return execFileSync(bin, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); } catch { throw new Error("CLI failed; sensitive output suppressed"); } };
const keys = JSON.parse(cli("/opt/homebrew/bin/supabase", ["projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"]));
const secret = keys.find(k => k.name === "aio_staging_vercel" && k.type === "secret")?.api_key, anon = keys.find(k => k.type === "publishable")?.api_key;
assert(secret && anon);
const head = cli("vercel", ["curl", "/login", "--deployment", base, "--", "--head", "--silent", "--show-error", "--header", "x-vercel-set-bypass-cookie: true"], { ...process.env, VERCEL_PROJECT_ID: "prj_b7InveOcjuUuMhxEWllhRtU7eT3M", VERCEL_ORG_ID: "team_wlpBR7pDkaVGzgmdp9CUO9BI" });
const previewCookie = head.match(/^set-cookie: (_vercel_jwt=[^;]+)/imu)?.[1]; assert(previewCookie);
const db = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } });
const org = randomUUID(), store = randomUUID(), otherStore = randomUUID(), item = randomUUID(), customer = randomUUID(), otherCustomer = randomUUID(), users = {};
const checked = (result, label = "DB") => { if (result.error) throw new Error(`${label}: ${result.error.code ?? "failed"}`); return result.data; };
const headers = (role = "owner") => ({ "Content-Type": "application/json", Origin: base, Cookie: [previewCookie, users[role]?.token && `aio_auth_access_token=${users[role].token}`].filter(Boolean).join("; ") });
const endpoint = `/api/stores/${store}/sales-conversation`;
async function call(command, role = "owner", path = endpoint, origin = base) {
  const response = await fetch(`${base}${path}`, { method: command ? "POST" : "GET", headers: { ...headers(role), Origin: origin }, ...(command ? { body: JSON.stringify(command) } : {}), signal: AbortSignal.timeout(70000) });
  return { status: response.status, body: await response.json() };
}
const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body; };
try {
  checked(await db.from("organizations").insert({ id: org, name: "SALES CONVERSATION SYNTHETIC", status: "active" }));
  checked(await db.from("stores").insert([store, otherStore].map(id => ({ id, organization_id: org, name: "書類会話検証専用店舗", industry_type_key: "restaurant", status: "active", feature_flags: { sales_reports: true, sales_ai_report: true } }))));
  for (const role of ["owner", "staff", "viewer", "outsider"]) {
    const email = `sales-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa9!`;
    const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true })).user;
    users[role] = { id: user.id };
    checked(await db.from("user_profiles").upsert({ user_id: user.id, role: "user", display_name: `合成 ${role}`, status: "active" }));
    if (role === "owner") checked(await db.from("organization_members").insert({ organization_id: org, user_id: user.id, role_key: "org_owner", status: "active" }));
    if (["staff", "viewer"].includes(role)) checked(await db.from("store_memberships").insert({ store_id: store, organization_id: org, user_id: user.id, email, role_key: role, status: "active", invitation_status: "accepted" }));
    const auth = createClient(`https://${ref}.supabase.co`, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    users[role].token = checked(await auth.auth.signInWithPassword({ email, password })).session.access_token;
  }
  assert.equal(ok(await call(undefined, "owner", `/api/stores/${store}/summary`)).id, store, "preview is staging-backed");
  checked(await db.from("items").insert({ id: item, organization_id: org, store_id: store, industry_type_key: "restaurant", name: "架空の会食メニュー", unit: "個", unit_price: 1100, tax_rate: 10, status: "active", availability: "available" }));
  checked(await db.from("customers").insert([{ id: customer, store_id: store, name: "架空顧客A" }, { id: otherCustomer, store_id: otherStore, name: "架空別店舗顧客" }].map(row => ({ ...row, organization_id: org }))));
  let view = ok(await call()); assert.equal(view.offer.id, "import");
  view = ok(await call({ revision: view.revision, action: "defer", value: "import" })); assert.notEqual(view.offer?.id, "import");
  assert.equal((await call({ revision: 0, action: "cancel" })).status, 409);
  assert.equal(ok(await call(undefined, "staff")).revision, 0);
  for (const role of ["viewer", "outsider", "anonymous"]) assert([401, 403, 404].includes((await call(undefined, role)).status));
  assert([403, 404].includes((await call(undefined, "staff", `/api/stores/${otherStore}/sales-conversation`)).status));
  assert.equal((await call({ revision: view.revision, action: "cancel" }, "owner", endpoint, "https://untrusted.example")).status, 403);
  const direct = createClient(`https://${ref}.supabase.co`, anon, { global: { headers: { Authorization: `Bearer ${users.owner.token}` } } });
  assert.equal((await direct.from("sales_conversations").select("*")).error?.code, "42501");
  assert.equal((await direct.rpc("save_sales_conversation", { p_actor: users.owner.id, p_store: store, p_revision: 0, p_state: {} })).error?.code, "42501");
  assert((await db.rpc("save_sales_conversation", { p_actor: users.viewer.id, p_store: store, p_revision: 0, p_state: {} })).error);
  console.log("PASS staging identity, role/store/user isolation, CAS, CSRF, service-only RPC");
  for (const kind of ["estimate", "invoice"]) {
    view = ok(await call({ revision: ok(await call()).revision, action: "cancel" }));
    view = ok(await call({ revision: view.revision, action: "start", value: kind }));
    view = ok(await call({ revision: view.revision, action: "answer", itemId: item }));
    assert.equal((await call({ revision: view.revision, action: "answer", customerId: otherCustomer })).status, 400);
    view = ok(await call({ revision: view.revision, action: "answer", customerId: customer }));
    assert.equal((await call({ revision: view.revision, action: "answer", money: { quantity: 0, unitPrice: 100, taxRate: 10, taxInclusion: "inclusive" } })).status, 400);
    const money = { quantity: 2, unitPrice: 1100, taxRate: 10, taxInclusion: kind === "estimate" ? "inclusive" : "exclusive" };
    view = ok(await call({ revision: view.revision, action: "answer", money }));
    view = ok(await call({ revision: view.revision, action: "answer", value: "架空メニューの提供内容を確認するための下書きです。" }));
    assert.equal(ok(await call()).state.step, "confirm");
    if (kind === "estimate") {
      checked(await db.from("customers").update({ archived_at: new Date().toISOString() }).eq("id", customer));
      assert.equal((await call({ revision: view.revision, action: "generate" })).status, 409);
      checked(await db.from("customers").update({ archived_at: null }).eq("id", customer));
      checked(await db.from("items").update({ status: "inactive" }).eq("id", item));
      assert.equal((await call({ revision: view.revision, action: "generate" })).status, 409);
      checked(await db.from("items").update({ status: "active" }).eq("id", item));
      // Refresh selection to acknowledge its new updated_at.
      view = ok(await call({ revision: view.revision, action: "edit" }));
      view = ok(await call({ revision: view.revision, action: "answer", itemId: item }));
      view = ok(await call({ revision: view.revision, action: "answer", customerId: customer }));
      view = ok(await call({ revision: view.revision, action: "answer", money }));
      view = ok(await call({ revision: view.revision, action: "answer", value: "架空メニューの説明です。" }));
    }
    const generate = { revision: view.revision, action: "generate" };
    const parallel = await Promise.all([call(generate), call(generate)]);
    assert(parallel.some(result => result.status === 200), JSON.stringify(parallel));
    view = ok(await call()); assert.equal(view.state.step, "done");
    assert.equal(ok(await call(generate)).state.actionId, view.state.actionId);
    const table = kind === "estimate" ? "estimates" : "invoices";
    const rows = checked(await db.from(table).select("*").eq("store_id", store)); assert.equal(rows.length, 1);
    const doc = rows[0]; assert.equal(doc.status, "draft"); assert.equal(doc.customer_id, customer);
    assert.equal(doc.total, kind === "estimate" ? 2200 : 2420); assert.equal(doc.tax_total, kind === "estimate" ? 200 : 220);
    if (kind === "invoice") { assert.equal(doc.payment_status, "unpaid"); assert.equal(doc.issued_at, null); assert.equal(doc.stripe_payment_status, "not_created"); }
    const page = await fetch(`${base}/stores/${store}/${table}/${doc.id}`, { headers: headers() });
    const html = await page.text(); assert.equal(page.status, 200); assert(html.includes('id="document-edit"') && html.includes("架空の会食メニュー") && html.includes("まだ発行・送信していません"));
    checked(await db.from(table).update({ archived_at: new Date().toISOString() }).eq("id", doc.id)); assert.equal(ok(await call()).actionAvailable, false);
    checked(await db.from(table).update({ archived_at: null }).eq("id", doc.id)); assert.equal(ok(await call()).actionAvailable, true);
    console.log(`PASS ${kind}: actual AI, financial totals, one draft from double submit, replay, edit page, archive/restore`);
  }
  for (const table of ["sales_transactions", "payments", "invoice_pdf_issues", "external_publish_jobs"]) {
    const rows = checked(await db.from(table).select("id").eq("store_id", store), table); assert.equal(rows.length, 0);
  }
  const events = checked(await db.from("ai_usage_events").select("feature,status").eq("store_id", store));
  assert.equal(events.length, 2); assert(events.every(event => event.feature === "sales_conversation" && event.status === "success"));
  checked(await db.from("user_profiles").update({ status: "suspended" }).eq("user_id", users.owner.id));
  assert([401, 403, 404].includes((await call()).status));
  console.log("PASS no sales/payment/issuance/publish side effects; two metered calls; suspended actor denied");
} finally {
  checked(await db.from("organizations").delete().eq("id", org), "synthetic org cleanup");
  for (const user of Object.values(users)) checked(await db.auth.admin.deleteUser(user.id), "synthetic auth cleanup");
  assert.equal(checked(await db.from("stores").select("id").in("id", [store, otherStore])).length, 0);
  console.log("PASS synthetic fixtures removed; usage/audit evidence retained without credentials");
}
