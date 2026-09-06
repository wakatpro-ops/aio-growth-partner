import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.AUTHZ_TEST_BASE_URL ?? "http://127.0.0.1:3100";
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("staging Supabaseの3環境変数が必要です。値は出力しません。");

type PersonaName = "owner" | "viewer" | "storeStaff" | "storeViewer" | "outsider" | "otherOwner" | "suspended";
type Persona = { id: string; email: string; password: string; token?: string };
const runId = randomUUID().slice(0, 8);
const password = `Booking-${randomUUID()}-9a!`;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const orgA = randomUUID();
const orgB = randomUUID();
const storeA = randomUUID();
const storeB = randomUUID();
const serviceA = randomUUID();
const resourceA = randomUUID();
const bookingA = randomUUID();
const personas = {} as Record<PersonaName, Persona>;

function jwtClient(token: string): SupabaseClient {
  return createClient(supabaseUrl!, anonKey!, { global: { headers: { authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } });
}

async function persona(name: PersonaName, status = "active") {
  const email = `aio-booking-${runId}-${name.toLowerCase()}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`認証fixture作成失敗: ${name}`);
  const profile = await admin.from("user_profiles").upsert({ user_id: created.data.user.id, display_name: `BOOKING ${name}`, role: "user", status }, { onConflict: "user_id" });
  if (profile.error) throw new Error(`profile fixture作成失敗: ${name}`);
  const signed = await createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } }).auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(`fixture login失敗: ${name}`);
  personas[name] = { id: created.data.user.id, email, password, token: signed.data.session.access_token };
}

async function orgMembership(name: PersonaName, organizationId: string, role: string) {
  const result = await admin.from("organization_members").insert({ organization_id: organizationId, user_id: personas[name].id, role_key: role, status: "active" });
  if (result.error) throw new Error(`organization membership失敗: ${name}`);
}

async function browserSession(browser: Browser, name: PersonaName): Promise<BrowserContext> {
  const context = await browser.newContext();
  const result = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas[name].token, expires_in: 3600 } });
  expect(result.status()).toBe(200);
  return context;
}

function rpcInput(overrides: Record<string, unknown> = {}) {
  return {
    p_organization_id: orgA,
    p_store_id: storeA,
    p_customer_id: null,
    p_service_id: serviceA,
    p_status: "confirmed",
    p_source: "manual",
    p_starts_at: "2026-09-10T01:00:00.000Z",
    p_ends_at: "2026-09-10T02:00:00.000Z",
    p_customer_name: `予約テスト ${runId}`,
    p_customer_phone: "09000000000",
    p_customer_email: null,
    p_service_name: "施術テスト",
    p_notes: null,
    p_resource_ids: [resourceA],
    p_actor_user_id: personas.owner.id,
    ...overrides
  };
}

test.beforeAll(async () => {
  for (const name of ["owner", "viewer", "storeStaff", "storeViewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) await persona(name, name === "suspended" ? "suspended" : "active");
  const industry = await admin.from("industry_types").select("key").limit(1).single();
  if (industry.error || !industry.data) throw new Error("業種fixtureなし");
  const orgs = await admin.from("organizations").insert([
    { id: orgA, name: `BOOKING A ${runId}`, owner_user_id: personas.owner.id, status: "active" },
    { id: orgB, name: `BOOKING B ${runId}`, owner_user_id: personas.otherOwner.id, status: "active" }
  ]);
  if (orgs.error) throw new Error(`組織fixture失敗: ${orgs.error.message}`);
  const stores = await admin.from("stores").insert([
    { id: storeA, organization_id: orgA, industry_type_key: industry.data.key, name: `BOOKING Store A ${runId}`, status: "active" },
    { id: storeB, organization_id: orgB, industry_type_key: industry.data.key, name: `BOOKING Store B ${runId}`, status: "active" }
  ]);
  if (stores.error) throw new Error(`店舗fixture失敗: ${stores.error.message}`);
  await orgMembership("owner", orgA, "org_owner");
  await orgMembership("viewer", orgA, "viewer");
  await orgMembership("otherOwner", orgB, "org_owner");
  await orgMembership("suspended", orgA, "org_owner");
  const storeMembers = await admin.from("store_memberships").insert([
    { organization_id: orgA, store_id: storeA, user_id: personas.storeStaff.id, email: personas.storeStaff.email, role_key: "staff", status: "active", invitation_status: "accepted" },
    { organization_id: orgA, store_id: storeA, user_id: personas.storeViewer.id, email: personas.storeViewer.email, role_key: "viewer", status: "active", invitation_status: "accepted" }
  ]);
  if (storeMembers.error) throw new Error(`店舗権限fixture失敗: ${storeMembers.error.message}`);
  const service = await admin.from("booking_services").insert({ id: serviceA, organization_id: orgA, store_id: storeA, name: "施術テスト", duration_minutes: 60, created_by: personas.owner.id, updated_by: personas.owner.id });
  if (service.error) throw new Error(`予約内容fixture失敗: ${service.error.message}`);
  const resource = await admin.from("booking_resources").insert({ id: resourceA, organization_id: orgA, store_id: storeA, name: "担当テスト", resource_type: "staff", capacity: 1, created_by: personas.owner.id, updated_by: personas.owner.id });
  if (resource.error) throw new Error(`予約資源fixture失敗: ${resource.error.message}`);
  const booking = await admin.from("bookings").insert({ id: bookingA, organization_id: orgA, store_id: storeA, service_id: serviceA, status: "confirmed", source: "manual", starts_at: "2026-09-09T01:00:00.000Z", ends_at: "2026-09-09T02:00:00.000Z", customer_name: `既存予約 ${runId}`, service_name: "施術テスト", created_by: personas.owner.id, updated_by: personas.owner.id });
  if (booking.error) throw new Error(`予約fixture失敗: ${booking.error.message}`);
  const allocation = await admin.from("booking_resource_allocations").insert({ organization_id: orgA, store_id: storeA, booking_id: bookingA, resource_id: resourceA });
  if (allocation.error) throw new Error(`割当fixture失敗: ${allocation.error.message}`);
});
test.afterAll(async () => {
  await admin.from("organizations").delete().in("id", [orgA, orgB]);
  for (const account of Object.values(personas)) await admin.auth.admin.deleteUser(account.id);
});

test("URLとAPI: 未所属・別組織・停止アカウントを拒否し、割当店舗だけ表示する", async ({ browser, page }) => {
  await page.goto(`${baseUrl}/stores/${storeA}/bookings`);
  await expect(page).toHaveURL(/\/login/u);
  for (const name of ["outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const context = await browserSession(browser, name);
    const target = await context.newPage();
    await target.goto(`${baseUrl}/stores/${storeA}/bookings`);
    await expect(target.getByRole("heading", { name: "予約", exact: true })).toHaveCount(0);
    expect((await context.request.get(`${baseUrl}/api/stores/${storeA}/bookings`)).status()).toBe(404);
    await context.close();
  }
  for (const name of ["owner", "viewer", "storeStaff", "storeViewer"] as PersonaName[]) {
    const context = await browserSession(browser, name);
    expect((await context.request.get(`${baseUrl}/stores/${storeA}/bookings`)).status()).toBe(200);
    expect((await context.request.get(`${baseUrl}/api/stores/${storeA}/bookings`)).status()).toBe(200);
    expect((await context.request.get(`${baseUrl}/api/stores/${storeB}/bookings`)).status()).toBe(404);
    await context.close();
  }
});

test("Server Action: 閲覧のみと未所属の直接送信では予約を作らない", async ({ browser }) => {
  const before = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("store_id", storeA);
  for (const name of ["viewer", "storeViewer", "outsider", "otherOwner", "suspended"] as PersonaName[]) {
    const context = await browserSession(browser, "owner");
    const page = await context.newPage();
    await page.goto(`${baseUrl}/stores/${storeA}/bookings/new`);
    const switched = await context.request.post(`${baseUrl}/api/auth/session`, { data: { access_token: personas[name].token, expires_in: 3600 } });
    expect(switched.status()).toBe(200);
    await page.getByLabel("お客様名").fill(`${name} denied`);
    await page.getByLabel("開始").fill("2026-09-11T10:00");
    await page.getByLabel("終了").fill("2026-09-11T11:00");
    await page.getByRole("button", { name: "予約を登録" }).click({ noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(700);
    await context.close();
  }
  const after = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("store_id", storeA);
  expect(after.count).toBe(before.count);
});

test("DB REST/RPC: editorだけRPCで作成でき、未所属・別店舗・viewer・停止状態を拒否する", async () => {
  const owner = jwtClient(personas.owner.token!);
  const staff = jwtClient(personas.storeStaff.token!);
  const denied = ["viewer", "storeViewer", "outsider", "otherOwner", "suspended"] as PersonaName[];

  const ownerRead = await owner.from("bookings").select("id").eq("id", bookingA);
  expect(ownerRead.data).toHaveLength(1);
  for (const name of denied) {
    const client = jwtClient(personas[name].token!);
    const read = await client.from("bookings").select("id").eq("id", bookingA);
    if (name === "viewer" || name === "storeViewer") expect(read.data, `${name}は割当店舗を閲覧可`).toHaveLength(1);
    else expect(read.data, `${name}は対象外`).toHaveLength(0);
    const write = await client.rpc("create_store_booking", rpcInput({ p_starts_at: "2026-09-12T01:00:00Z", p_ends_at: "2026-09-12T02:00:00Z", p_actor_user_id: personas[name].id }));
    expect(write.error, `${name} RPC拒否`).not.toBeNull();
  }

  const directInsert = await owner.from("bookings").insert({ organization_id: orgA, store_id: storeA, status: "confirmed", source: "manual", starts_at: "2026-09-13T01:00:00Z", ends_at: "2026-09-13T02:00:00Z", customer_name: "REST bypass" });
  expect(directInsert.error, "editorでもREST直書きは禁止").not.toBeNull();

  const ownerCreate = await owner.rpc("create_store_booking", rpcInput());
  expect(ownerCreate.error).toBeNull();
  const staffCreate = await staff.rpc("create_store_booking", rpcInput({ p_starts_at: "2026-09-10T02:00:00Z", p_ends_at: "2026-09-10T03:00:00Z", p_customer_name: "店舗スタッフ正常", p_actor_user_id: personas.storeStaff.id }));
  expect(staffCreate.error).toBeNull();
});

test("DB同時性: 同じ担当者の重複予約を拒否し、境界が同じ連続予約は許可する", async () => {
  const owner = jwtClient(personas.owner.token!);
  const first = await owner.rpc("create_store_booking", rpcInput({ p_starts_at: "2026-09-14T01:00:00Z", p_ends_at: "2026-09-14T02:00:00Z", p_customer_name: "重複基準" }));
  expect(first.error).toBeNull();
  const overlap = await owner.rpc("create_store_booking", rpcInput({ p_starts_at: "2026-09-14T01:30:00Z", p_ends_at: "2026-09-14T02:30:00Z", p_customer_name: "重複拒否" }));
  expect(overlap.error?.message).toMatch(/予約が重複しています/u);
  const adjacent = await owner.rpc("create_store_booking", rpcInput({ p_starts_at: "2026-09-14T02:00:00Z", p_ends_at: "2026-09-14T03:00:00Z", p_customer_name: "連続予約" }));
  expect(adjacent.error).toBeNull();
});
