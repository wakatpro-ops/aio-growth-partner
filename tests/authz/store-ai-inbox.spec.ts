import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.AUTHZ_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const webhookSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET ?? "store-email-authz-test-secret";
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("staging Supabaseの3環境変数が必要です。値は出力しません。");

type PersonaName = "owner" | "staff" | "viewer" | "outsider" | "otherOwner" | "suspended";
type Persona = { id: string; email: string; password: string; token: string };
const runId = randomUUID().slice(0, 8);
const password = `Mail-${randomUUID()}-9a!`;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const orgA = randomUUID();
const orgB = randomUUID();
const storeA = randomUUID();
const storeB = randomUUID();
const personas = {} as Record<PersonaName, Persona>;
let inboxId = "";
let inboxAddress = "";

function jwtClient(token: string): SupabaseClient {
  return createClient(supabaseUrl!, anonKey!, { global: { headers: { authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
}

async function createPersona(name: PersonaName, status = "active") {
  const email = `aio-mail-${runId}-${name.toLowerCase()}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`認証fixture作成失敗: ${name}`);
  const profile = await admin.from("user_profiles").upsert({ user_id: created.data.user.id, display_name: `MAIL ${name}`, role: "user", status }, { onConflict: "user_id" });
  if (profile.error) throw new Error(`profile fixture作成失敗: ${name}`);
  const signed = await createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(`fixture login失敗: ${name}`);
  personas[name] = { id: created.data.user.id, email, password, token: signed.data.session.access_token };
}

async function browserSession(browser: Browser, name: PersonaName): Promise<BrowserContext> {
  const context = await browser.newContext();
  const result = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas[name].token, expires_in: 3600 } });
  expect(result.status()).toBe(200);
  return context;
}

async function insertMessage(category: "inquiry" | "reservation", suffix: string) {
  const extracted = category === "reservation" ? {
    customer_name: `予約 ${suffix}`,
    starts_at: "2026-09-20T01:00:00.000Z",
    ends_at: "2026-09-20T02:00:00.000Z",
    service_name: "施術"
  } : {};
  const result = await admin.from("store_ai_email_messages").insert({
    inbox_id: inboxId,
    organization_id: orgA,
    store_id: storeA,
    message_fingerprint: `fixture-${runId}-${suffix}`,
    sender_email: "customer@example.com",
    sender_domain: "example.com",
    subject: `${category} ${suffix}`,
    summary: "確認用fixture",
    category,
    classification_confidence: category === "reservation" ? 0.99 : 0.8,
    processing_status: category === "reservation" ? "ready_to_apply" : "review_required",
    known_template: category === "reservation",
    extracted_data: extracted
  }).select("id").single();
  if (result.error || !result.data) throw new Error(`メールfixture作成失敗: ${result.error?.message}`);
  return String(result.data.id);
}

test.beforeAll(async () => {
  for (const name of ["owner", "staff", "viewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) await createPersona(name, name === "suspended" ? "suspended" : "active");
  const industry = await admin.from("industry_types").select("key").limit(1).single();
  if (industry.error || !industry.data) throw new Error("業種fixtureなし");
  const orgs = await admin.from("organizations").insert([
    { id: orgA, name: `MAIL A ${runId}`, owner_user_id: personas.owner.id, status: "active" },
    { id: orgB, name: `MAIL B ${runId}`, owner_user_id: personas.otherOwner.id, status: "active" }
  ]);
  if (orgs.error) throw new Error(`組織fixture失敗: ${orgs.error.message}`);
  const stores = await admin.from("stores").insert([
    { id: storeA, organization_id: orgA, industry_type_key: industry.data.key, name: `MAIL Store A ${runId}`, status: "active" },
    { id: storeB, organization_id: orgB, industry_type_key: industry.data.key, name: `MAIL Store B ${runId}`, status: "active" }
  ]);
  if (stores.error) throw new Error(`店舗fixture失敗: ${stores.error.message}`);
  const memberships = await admin.from("organization_members").insert([
    { organization_id: orgA, user_id: personas.owner.id, role_key: "org_owner", status: "active" },
    { organization_id: orgA, user_id: personas.viewer.id, role_key: "viewer", status: "active" },
    { organization_id: orgA, user_id: personas.suspended.id, role_key: "org_owner", status: "active" },
    { organization_id: orgB, user_id: personas.otherOwner.id, role_key: "org_owner", status: "active" }
  ]);
  if (memberships.error) throw new Error(`組織権限fixture失敗: ${memberships.error.message}`);
  const staff = await admin.from("store_memberships").insert({ organization_id: orgA, store_id: storeA, user_id: personas.staff.id, email: personas.staff.email, role_key: "staff", status: "active", invitation_status: "accepted" });
  if (staff.error) throw new Error(`店舗権限fixture失敗: ${staff.error.message}`);
  const inbox = await admin.from("store_ai_inboxes").select("id,email_address").eq("store_id", storeA).is("archived_at", null).single();
  if (inbox.error || !inbox.data) throw new Error(`自動受信箱fixtureなし: ${inbox.error?.message}`);
  inboxId = String(inbox.data.id);
  inboxAddress = String(inbox.data.email_address);
});

test.afterAll(async () => {
  await admin.from("organizations").delete().in("id", [orgA, orgB]);
  for (const account of Object.values(personas)) await admin.auth.admin.deleteUser(account.id);
});

test("URL: 未所属・別組織・停止アカウントは拒否し、割当店舗だけ表示する", async ({ browser, page }) => {
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
  await expect(page).toHaveURL(/\/login/u);
  for (const name of ["outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const context = await browserSession(browser, name);
    const response = await context.request.get(`${baseUrl}/stores/${storeA}/ai-inbox`);
    expect(await response.text()).not.toContain("店舗メールをまとめて整理");
    await context.close();
  }
  for (const name of ["owner", "staff", "viewer"] as PersonaName[]) {
    const context = await browserSession(browser, name);
    const allowed = await context.request.get(`${baseUrl}/stores/${storeA}/ai-inbox`);
    expect(await allowed.text()).toContain("店舗メールをまとめて整理");
    const crossStore = await context.request.get(`${baseUrl}/stores/${storeB}/ai-inbox`);
    expect(await crossStore.text()).not.toContain("店舗メールをまとめて整理");
    await context.close();
  }
});

test("DB REST/RPC: 認証済みでも直接読書きと予約反映RPCを拒否する", async () => {
  for (const name of ["owner", "staff", "viewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const client = jwtClient(personas[name].token);
    const read = await client.from("store_ai_email_messages").select("id");
    expect(read.error, `${name} direct read`).not.toBeNull();
    const write = await client.from("store_ai_email_messages").insert({ inbox_id: inboxId, organization_id: orgA, store_id: storeA, message_fingerprint: `bypass-${name}`, summary: "bypass", category: "unknown" });
    expect(write.error, `${name} direct write`).not.toBeNull();
    const rpc = await client.rpc("apply_store_ai_email_booking", { p_message_id: randomUUID(), p_actor_user_id: personas[name].id, p_automatic: false });
    expect(rpc.error, `${name} direct RPC`).not.toBeNull();
  }
});

test("Webhook: 誤った秘密は拒否し、正しい秘密で店舗だけに保存し、機密本文を保持しない", async ({ request }) => {
  const invalid = await request.post(`${baseUrl}/api/inbound/store-email`, { headers: { "x-aio-inbound-secret": "wrong" }, multipart: { to: inboxAddress, from: "予約通知 <booking@example.jp>", subject: "予約受付", text: "お名前：山田 花子\n予約日時：2026年9月21日 14:00" } });
  expect(invalid.status()).toBe(401);
  const accepted = await request.post(`${baseUrl}/api/inbound/store-email`, { headers: { "x-aio-inbound-secret": webhookSecret }, multipart: { to: inboxAddress, from: "予約通知 <booking@example.jp>", subject: "予約受付", text: "予約番号：WEB-1\nお名前：山田 花子\n予約日時：2026年9月21日 14:00\nメニュー：施術", headers: `Message-ID: <${runId}-reservation@example.jp>` } });
  expect(accepted.status()).toBe(202);
  const saved = await admin.from("store_ai_email_messages").select("store_id,category,processing_status").eq("store_id", storeA).eq("provider_event_id", `<${runId}-reservation@example.jp>`).single();
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({ store_id: storeA, category: "reservation", processing_status: "ready_to_apply" });

  const secretMessage = await request.post(`${baseUrl}/api/inbound/store-email`, { headers: { "x-aio-inbound-secret": webhookSecret }, multipart: { to: inboxAddress, from: "security@example.jp", subject: "パスワード再設定", text: "認証コード：123456", headers: `Message-ID: <${runId}-secret@example.jp>` } });
  expect(secretMessage.status()).toBe(202);
  const minimized = await admin.from("store_ai_email_messages").select("subject,summary,extracted_data,sender_email,sensitive,processing_status").eq("provider_event_id", `<${runId}-secret@example.jp>`).single();
  expect(minimized.data).toMatchObject({ subject: "機密性の高いメール", extracted_data: {}, sender_email: null, sensitive: true, processing_status: "rejected" });
  expect(String(minimized.data?.summary)).not.toContain("123456");
});

test("Server Action: 閲覧のみ・未所属は分類確認できず、スタッフは担当店舗だけ確認できる", async ({ browser }) => {
  const deniedMessage = await insertMessage("inquiry", "viewer-denied");
  for (const name of ["viewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const context = await browserSession(browser, "owner");
    const page = await context.newPage();
    await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
    const switched = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas[name].token, expires_in: 3600 } });
    expect(switched.status()).toBe(200);
    await page.locator(`#message-${deniedMessage}`).getByRole("button", { name: "分類を確認済みにする" }).click({ noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    await context.close();
  }
  const unchanged = await admin.from("store_ai_email_messages").select("processing_status").eq("id", deniedMessage).single();
  expect(unchanged.data?.processing_status).toBe("review_required");

  const allowedMessage = await insertMessage("inquiry", "staff-allowed");
  const staffContext = await browserSession(browser, "staff");
  const staffPage = await staffContext.newPage();
  await staffPage.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
  await staffPage.locator(`#message-${allowedMessage}`).getByRole("button", { name: "分類を確認済みにする" }).click();
  await expect(staffPage).toHaveURL(/confirmed=1/u);
  await staffContext.close();
  const confirmed = await admin.from("store_ai_email_messages").select("processing_status,reviewed_by").eq("id", allowedMessage).single();
  expect(confirmed.data).toMatchObject({ processing_status: "applied", reviewed_by: personas.staff.id });
});

test("Server Action: スタッフは受信箱の自動反映設定を変更できない", async ({ browser }) => {
  const context = await browserSession(browser, "owner");
  const page = await context.newPage();
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
  await page.getByText("自動反映と受信アドレスの安全設定").click();
  const switched = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas.staff.token, expires_in: 3600 } });
  expect(switched.status()).toBe(200);
  await page.locator('textarea[name="trusted_senders"]').fill("attacker@example.com");
  await page.getByRole("button", { name: "安全設定を保存" }).click();
  await expect(page.getByText(/設定を変更できるのは店舗オーナー/u)).toBeVisible();
  const inbox = await admin.from("store_ai_inboxes").select("trusted_senders,auto_apply_reservations").eq("id", inboxId).single();
  expect(inbox.data).toMatchObject({ trusted_senders: [], auto_apply_reservations: false });
  await context.close();
});
