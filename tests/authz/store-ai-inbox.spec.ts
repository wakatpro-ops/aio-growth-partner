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
    reservation_id: `FIXTURE-${runId}-${suffix}`,
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
    booking_event_type: category === "reservation" ? "created" : null,
    booking_provider: category === "reservation" ? "email_example_com" : null,
    template_fingerprint: category === "reservation" ? "a".repeat(64) : null,
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

test("DB REST/RPC: 認証済みでもメール・学習ルールの直接読書きと予約反映RPCを拒否する", async () => {
  for (const name of ["owner", "staff", "viewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const client = jwtClient(personas[name].token);
    const read = await client.from("store_ai_email_messages").select("id");
    expect(read.error, `${name} direct read`).not.toBeNull();
    const write = await client.from("store_ai_email_messages").insert({ inbox_id: inboxId, organization_id: orgA, store_id: storeA, message_fingerprint: `bypass-${name}`, summary: "bypass", category: "unknown" });
    expect(write.error, `${name} direct write`).not.toBeNull();
    const templateRead = await client.from("store_ai_email_templates").select("id");
    expect(templateRead.error, `${name} direct template read`).not.toBeNull();
    const templateWrite = await client.from("store_ai_email_templates").insert({ organization_id: orgA, store_id: storeA, sender_email: "attacker@example.com", sender_domain: "example.com", provider_key: "email_example_com", event_type: "created", template_fingerprint: "b".repeat(64) });
    expect(templateWrite.error, `${name} direct template write`).not.toBeNull();
    const rpc = await client.rpc("apply_store_ai_email_event", { p_message_id: randomUUID(), p_actor_user_id: personas[name].id, p_automatic: false, p_learn_template: true });
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

test("初回だけ承認して学習し、同じ店舗・送信元・形式・新規通知の2回目だけを自動処理する", async ({ browser, request }) => {
  const sender = `予約通知 <booking-${runId}@beauty.recruit.co.jp>`;
  const firstEventId = `<${runId}-learn-first@example.jp>`;
  const firstReservationId = `HPB-${runId}-101`;
  const first = await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約受付 ${firstReservationId}`,
      text: `予約番号：${firstReservationId}\nお名前：初回 花子\n予約日時：2026年9月25日 14:00\nメニュー：アロマ60分\n電話番号：09011112222`,
      headers: `Message-ID: ${firstEventId}`
    }
  });
  expect(first.status()).toBe(202);
  const firstMessage = await admin.from("store_ai_email_messages")
    .select("id,processing_status,matched_template_id,booking_event_type,booking_provider,template_fingerprint")
    .eq("provider_event_id", firstEventId)
    .single();
  expect(firstMessage.error).toBeNull();
  expect(firstMessage.data).toMatchObject({ processing_status: "ready_to_apply", matched_template_id: null, booking_event_type: "created", booking_provider: "hotpepper_beauty" });
  expect(String(firstMessage.data?.template_fingerprint)).toHaveLength(64);

  const ownerContext = await browserSession(browser, "owner");
  const page = await ownerContext.newPage();
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox#message-${firstMessage.data!.id}`);
  const firstCard = page.locator(`#message-${firstMessage.data!.id}`);
  await firstCard.locator('input[name="learn_template"]').check();
  await firstCard.getByRole("button", { name: "内容を確認して予約へ反映" }).click();
  await expect(page).toHaveURL(/\/bookings\//u);
  await ownerContext.close();

  const learned = await admin.from("store_ai_email_templates")
    .select("id,status,event_type,sender_email,template_fingerprint,match_count,auto_processed_count")
    .eq("store_id", storeA)
    .eq("sender_email", `booking-${runId}@beauty.recruit.co.jp`)
    .single();
  expect(learned.error).toBeNull();
  expect(learned.data).toMatchObject({ status: "active", event_type: "created", match_count: 1, auto_processed_count: 0 });

  const secondEventId = `<${runId}-learn-second@example.jp>`;
  const secondReservationId = `HPB-${runId}-102`;
  const second = await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約受付 ${secondReservationId}`,
      text: `予約番号：${secondReservationId}\nお名前：二回目 太郎\n予約日時：2026年9月25日 16:00\nメニュー：整体90分\n電話番号：09033334444`,
      headers: `Message-ID: ${secondEventId}`
    }
  });
  expect(second.status()).toBe(202);
  const automaticallyApplied = await admin.from("store_ai_email_messages")
    .select("processing_status,requires_human_confirmation,matched_template_id,applied_target_id")
    .eq("provider_event_id", secondEventId)
    .single();
  expect(automaticallyApplied.data).toMatchObject({ processing_status: "applied", requires_human_confirmation: false, matched_template_id: learned.data!.id });
  const autoBooking = await admin.from("bookings").select("external_booking_id,customer_name,external_provider").eq("id", automaticallyApplied.data!.applied_target_id).single();
  expect(autoBooking.data).toMatchObject({ external_booking_id: secondReservationId, customer_name: "二回目 太郎", external_provider: "email_hotpepper_beauty" });

  const firstChangeEventId = `<${runId}-change-first@example.jp>`;
  await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約変更 ${firstReservationId}`,
      text: `予約番号：${firstReservationId}\nお名前：初回 花子\n予約日時：2026年9月26日 13:00\nメニュー：アロマ60分\n電話番号：09011112222`,
      headers: `Message-ID: ${firstChangeEventId}`
    }
  });
  const firstChange = await admin.from("store_ai_email_messages").select("id,processing_status,matched_template_id,booking_event_type").eq("provider_event_id", firstChangeEventId).single();
  expect(firstChange.data).toMatchObject({ processing_status: "ready_to_apply", matched_template_id: null, booking_event_type: "changed" });
  const changeContext = await browserSession(browser, "owner");
  const changePage = await changeContext.newPage();
  await changePage.goto(`${baseUrl}/stores/${storeA}/ai-inbox#message-${firstChange.data!.id}`);
  const changeCard = changePage.locator(`#message-${firstChange.data!.id}`);
  await changeCard.locator('input[name="learn_template"]').check();
  await changeCard.getByRole("button", { name: "予約変更を反映" }).click();
  await expect(changePage).toHaveURL(/\/bookings\//u);
  await changeContext.close();
  const changedBooking = await admin.from("bookings").select("starts_at").eq("external_booking_id", firstReservationId).eq("store_id", storeA).single();
  expect(changedBooking.data?.starts_at).toBe("2026-09-26T04:00:00+00:00");

  const secondChangeEventId = `<${runId}-change-second@example.jp>`;
  await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約変更 ${firstReservationId}`,
      text: `予約番号：${firstReservationId}\nお名前：初回 花子\n予約日時：2026年9月26日 15:00\nメニュー：アロマ60分\n電話番号：09011112222`,
      headers: `Message-ID: ${secondChangeEventId}`
    }
  });
  const autoChange = await admin.from("store_ai_email_messages").select("processing_status,matched_template_id").eq("provider_event_id", secondChangeEventId).single();
  expect(autoChange.data?.processing_status).toBe("applied");
  expect(autoChange.data?.matched_template_id).not.toBeNull();
  const autoChangedBooking = await admin.from("bookings").select("starts_at").eq("external_booking_id", firstReservationId).eq("store_id", storeA).single();
  expect(autoChangedBooking.data?.starts_at).toBe("2026-09-26T06:00:00+00:00");

  const firstCancelEventId = `<${runId}-cancel-first@example.jp>`;
  await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約キャンセル ${firstReservationId}`,
      text: `予約番号：${firstReservationId}\n予約キャンセルを受け付けました。`,
      headers: `Message-ID: ${firstCancelEventId}`
    }
  });
  const firstCancel = await admin.from("store_ai_email_messages").select("id,processing_status,matched_template_id,booking_event_type").eq("provider_event_id", firstCancelEventId).single();
  expect(firstCancel.data).toMatchObject({ processing_status: "ready_to_apply", matched_template_id: null, booking_event_type: "cancelled" });
  const cancelContext = await browserSession(browser, "owner");
  const cancelPage = await cancelContext.newPage();
  await cancelPage.goto(`${baseUrl}/stores/${storeA}/ai-inbox#message-${firstCancel.data!.id}`);
  const cancelCard = cancelPage.locator(`#message-${firstCancel.data!.id}`);
  await cancelCard.locator('input[name="learn_template"]').check();
  await cancelCard.getByRole("button", { name: "予約キャンセルを反映" }).click();
  await expect(cancelPage).toHaveURL(/\/bookings\//u);
  await cancelContext.close();
  expect((await admin.from("bookings").select("status").eq("external_booking_id", firstReservationId).eq("store_id", storeA).single()).data?.status).toBe("cancelled");

  const secondCancelEventId = `<${runId}-cancel-second@example.jp>`;
  await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約キャンセル ${secondReservationId}`,
      text: `予約番号：${secondReservationId}\n予約キャンセルを受け付けました。`,
      headers: `Message-ID: ${secondCancelEventId}`
    }
  });
  expect((await admin.from("store_ai_email_messages").select("processing_status").eq("provider_event_id", secondCancelEventId).single()).data?.processing_status).toBe("applied");
  expect((await admin.from("bookings").select("status").eq("external_booking_id", secondReservationId).eq("store_id", storeA).single()).data?.status).toBe("cancelled");

  const duplicateEventId = `<${runId}-duplicate-created@example.jp>`;
  await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: sender,
      subject: `ホットペッパービューティー 予約受付 ${secondReservationId}`,
      text: `予約番号：${secondReservationId}\nお名前：二回目 太郎\n予約日時：2026年9月27日 11:00\nメニュー：整体90分\n電話番号：09033334444`,
      headers: `Message-ID: ${duplicateEventId}`
    }
  });
  const duplicate = await admin.from("store_ai_email_messages").select("processing_status,requires_human_confirmation,matched_template_id").eq("provider_event_id", duplicateEventId).single();
  expect(duplicate.data?.matched_template_id).toBe(learned.data!.id);
  expect(duplicate.data).toMatchObject({ processing_status: "review_required", requires_human_confirmation: true });

  const otherSenderEventId = `<${runId}-other-sender@example.jp>`;
  const otherSender = await request.post(`${baseUrl}/api/inbound/store-email`, {
    headers: { "x-aio-inbound-secret": webhookSecret },
    multipart: {
      to: inboxAddress,
      from: `別送信元 <other-${runId}@beauty.recruit.co.jp>`,
      subject: `ホットペッパービューティー 予約受付 HPB-${runId}-103`,
      text: `予約番号：HPB-${runId}-103\nお名前：別 送信元\n予約日時：2026年9月25日 18:00\nメニュー：施術`,
      headers: `Message-ID: ${otherSenderEventId}`
    }
  });
  expect(otherSender.status()).toBe(202);
  const notApplied = await admin.from("store_ai_email_messages").select("processing_status,matched_template_id").eq("provider_event_id", otherSenderEventId).single();
  expect(notApplied.data).toMatchObject({ processing_status: "ready_to_apply", matched_template_id: null });
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
  await admin.from("store_ai_inboxes").update({ auto_apply_reservations: false }).eq("id", inboxId);
  const context = await browserSession(browser, "owner");
  const page = await context.newPage();
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
  await page.getByText("自動反映と受信アドレスの安全設定").click();
  const switched = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas.staff.token, expires_in: 3600 } });
  expect(switched.status()).toBe(200);
  await page.locator('input[name="auto_apply_reservations"]').check();
  await page.getByRole("button", { name: "安全設定を保存" }).click();
  await expect(page.getByText(/設定を変更できるのは店舗オーナー/u)).toBeVisible();
  const inbox = await admin.from("store_ai_inboxes").select("trusted_senders,auto_apply_reservations").eq("id", inboxId).single();
  expect(inbox.data?.auto_apply_reservations).toBe(false);
  expect(inbox.data?.trusted_senders).not.toContain("attacker@example.com");
  await context.close();
});

test("Server Action: スタッフは予約確認できても自動処理ルールを学習させられない", async ({ browser }) => {
  const messageId = await insertMessage("reservation", "staff-cannot-learn");
  const context = await browserSession(browser, "owner");
  const page = await context.newPage();
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox#message-${messageId}`);
  const card = page.locator(`#message-${messageId}`);
  await card.locator('input[name="learn_template"]').check();
  const switched = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas.staff.token, expires_in: 3600 } });
  expect(switched.status()).toBe(200);
  await card.getByRole("button", { name: "内容を確認して予約へ反映" }).click();
  await expect(page.getByText(/設定を変更できるのは店舗オーナー/u)).toBeVisible();
  const unchanged = await admin.from("store_ai_email_messages").select("processing_status,applied_target_id").eq("id", messageId).single();
  expect(unchanged.data).toMatchObject({ processing_status: "ready_to_apply", applied_target_id: null });
  const learned = await admin.from("store_ai_email_templates").select("id").eq("approved_message_id", messageId);
  expect(learned.data).toHaveLength(0);
  await context.close();
});

test("学習ルールは店舗オーナーだけが停止・削除・復元できる", async ({ browser }) => {
  const template = await admin.from("store_ai_email_templates").insert({
    organization_id: orgA,
    store_id: storeA,
    sender_email: `lifecycle-${runId}@example.com`,
    sender_domain: "example.com",
    provider_key: "email_example_com",
    event_type: "created",
    template_fingerprint: "c".repeat(64),
    created_by: personas.owner.id,
    updated_by: personas.owner.id
  }).select("id").single();
  expect(template.error).toBeNull();

  const staffContext = await browserSession(browser, "staff");
  const staffPage = await staffContext.newPage();
  await staffPage.goto(`${baseUrl}/stores/${storeA}/ai-inbox`);
  await expect(staffPage.getByRole("heading", { name: "学習済みの予約メール形式" })).toHaveCount(0);
  await staffContext.close();

  const ownerContext = await browserSession(browser, "owner");
  const page = await ownerContext.newPage();
  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox#learned-email-rules`);
  const rule = page.locator(".ai-inbox-template-card").filter({ hasText: `lifecycle-${runId}@example.com` });
  await rule.getByRole("button", { name: "自動処理を一時停止" }).click();
  await expect(page).toHaveURL(/template_status=paused/u);
  expect((await admin.from("store_ai_email_templates").select("status").eq("id", template.data!.id).single()).data?.status).toBe("paused");

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".ai-inbox-template-card").filter({ hasText: `lifecycle-${runId}@example.com` }).getByRole("button", { name: "ルールを削除" }).click();
  await expect(page).toHaveURL(/template_deleted=1/u);
  expect((await admin.from("store_ai_email_templates").select("archived_at").eq("id", template.data!.id).single()).data?.archived_at).not.toBeNull();

  await page.goto(`${baseUrl}/stores/${storeA}/ai-inbox?rules=deleted#learned-email-rules`);
  await page.locator(".ai-inbox-template-card").filter({ hasText: `lifecycle-${runId}@example.com` }).getByRole("button", { name: "停止状態で元に戻す" }).click();
  await expect(page).toHaveURL(/template_restored=1/u);
  expect((await admin.from("store_ai_email_templates").select("status,archived_at").eq("id", template.data!.id).single()).data).toMatchObject({ status: "paused", archived_at: null });
  await ownerContext.close();
});
