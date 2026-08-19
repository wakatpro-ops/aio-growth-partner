import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.AUTHZ_TEST_BASE_URL ?? "http://127.0.0.1:3100";

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("staging Supabaseの3環境変数が必要です。値はテスト出力へ表示しません。");
}

type PersonaName =
  | "platformAdmin"
  | "owner"
  | "manager"
  | "staff"
  | "viewer"
  | "otherOwner"
  | "noMembershipPending"
  | "noMembershipApprovedUnpaid"
  | "noMembershipIssued"
  | "pendingMember"
  | "archivedMember"
  | "suspendedProfile"
  | "archivedProfile"
  | "archivedOrganizationOwner";

type Persona = {
  id: string;
  email: string;
  password: string;
  accessToken?: string;
};

const runId = randomUUID().slice(0, 8);
const password = `Authz-${randomUUID()}-9a!`;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const orgA = randomUUID();
const orgB = randomUUID();
const orgArchived = randomUUID();
const storeA = randomUUID();
const storeB = randomUUID();
const storeArchivedOrg = randomUUID();
const personas = {} as Record<PersonaName, Persona>;
let seedKeywordId = "";

function jwtClient(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, anonKey!, {
    global: { headers: { authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

async function createPersona(name: PersonaName, profile: { role?: string; status?: string; archived?: boolean } = {}) {
  const email = `aio-authz-${runId}-${name.toLowerCase()}@example.com`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw new Error(`fixture auth user作成失敗: ${name}`);
  const user = result.data.user;
  const upsert = await admin.from("user_profiles").upsert({
    user_id: user.id,
    display_name: `AUTHZ ${name}`,
    role: profile.role ?? "user",
    status: profile.status ?? "active",
    archived_at: profile.archived ? new Date().toISOString() : null
  }, { onConflict: "user_id" });
  if (upsert.error) throw new Error(`fixture profile作成失敗: ${name}`);
  personas[name] = { id: user.id, email, password };
}

async function addMembership(name: PersonaName, organizationId: string, role: string, options: { status?: string; archived?: boolean } = {}) {
  const result = await admin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: personas[name].id,
    role_key: role,
    status: options.status ?? "active",
    archived_at: options.archived ? new Date().toISOString() : null
  });
  if (result.error) throw new Error(`fixture membership作成失敗: ${name}`);
}

async function signIn(name: PersonaName) {
  const client = createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await client.auth.signInWithPassword({ email: personas[name].email, password });
  if (result.error || !result.data.session) throw new Error(`fixture sign-in失敗: ${name}`);
  personas[name].accessToken = result.data.session.access_token;
}

async function browserSession(browser: Browser, name: PersonaName): Promise<BrowserContext> {
  const context = await browser.newContext();
  const response = await context.request.post(`${baseUrl}/api/auth/session`, {
    data: { access_token: personas[name].accessToken, expires_in: 3600 }
  });
  expect(response.status(), `${name}のアプリセッション作成`).toBe(200);
  return context;
}

test.beforeAll(async () => {
  for (const name of [
    "platformAdmin", "owner", "manager", "staff", "viewer", "otherOwner",
    "noMembershipPending", "noMembershipApprovedUnpaid", "noMembershipIssued", "pendingMember", "archivedMember",
    "suspendedProfile", "archivedProfile", "archivedOrganizationOwner"
  ] as PersonaName[]) {
    await createPersona(name, name === "platformAdmin"
      ? { role: "platform_admin" }
      : name === "suspendedProfile"
        ? { status: "suspended" }
        : name === "archivedProfile"
          ? { archived: true }
          : {});
  }

  const industry = await admin.from("industry_types").select("key").limit(1).single();
  if (industry.error || !industry.data) throw new Error("fixture用業態がありません。");
  const orgInsert = await admin.from("organizations").insert([
    { id: orgA, name: `AUTHZ A ${runId}`, owner_user_id: personas.owner.id, status: "active", archived_at: null },
    { id: orgB, name: `AUTHZ B ${runId}`, owner_user_id: personas.otherOwner.id, status: "active", archived_at: null },
    { id: orgArchived, name: `AUTHZ ARCHIVED ${runId}`, owner_user_id: personas.archivedOrganizationOwner.id, status: "archived", archived_at: new Date().toISOString() }
  ]);
  if (orgInsert.error) throw new Error("fixture organization作成失敗");

  const storeInsert = await admin.from("stores").insert([
    { id: storeA, organization_id: orgA, industry_type_key: industry.data.key, name: `AUTHZ Store A ${runId}`, status: "active" },
    { id: storeB, organization_id: orgB, industry_type_key: industry.data.key, name: `AUTHZ Store B ${runId}`, status: "active" },
    { id: storeArchivedOrg, organization_id: orgArchived, industry_type_key: industry.data.key, name: `AUTHZ Store Archived ${runId}`, status: "active" }
  ]);
  if (storeInsert.error) throw new Error("fixture store作成失敗");

  await addMembership("owner", orgA, "org_owner");
  await addMembership("manager", orgA, "store_manager");
  await addMembership("staff", orgA, "staff");
  await addMembership("viewer", orgA, "viewer");
  await addMembership("otherOwner", orgB, "org_owner");
  await addMembership("pendingMember", orgA, "org_owner", { status: "pending" });
  await addMembership("archivedMember", orgA, "org_owner", { archived: true });
  await addMembership("suspendedProfile", orgA, "org_owner");
  await addMembership("archivedProfile", orgA, "org_owner");
  await addMembership("archivedOrganizationOwner", orgArchived, "org_owner");

  const applicationInsert = await admin.from("applications").insert([
    {
      store_name: `AUTHZ Pending ${runId}`, contact_name: "Authz", email: personas.noMembershipPending.email,
      store_count: 1, pain_points: "security test", status: "new", approval_status: "pending",
      payment_status: "unpaid", account_status: "not_created", invited_user_id: personas.noMembershipPending.id
    },
    {
      store_name: `AUTHZ Issued ${runId}`, contact_name: "Authz", email: personas.noMembershipIssued.email,
      store_count: 1, pain_points: "security test", status: "account_issued", approval_status: "approved",
      payment_status: "paid", account_status: "issued", invited_user_id: personas.noMembershipIssued.id
    },
    {
      store_name: `AUTHZ Approved Unpaid ${runId}`, contact_name: "Authz", email: personas.noMembershipApprovedUnpaid.email,
      store_count: 1, pain_points: "security test", status: "approved", approval_status: "approved",
      payment_status: "unpaid", account_status: "not_created", invited_user_id: personas.noMembershipApprovedUnpaid.id
    }
  ]);
  if (applicationInsert.error) throw new Error("fixture application作成失敗");

  const keyword = await admin.from("search_visibility_keywords").insert({
    organization_id: orgA,
    store_id: storeA,
    keyword: `authz seed ${runId}`,
    created_by: personas.owner.id,
    updated_by: personas.owner.id
  }).select("id").single();
  if (keyword.error || !keyword.data) throw new Error("fixture results作成失敗");
  seedKeywordId = keyword.data.id;

  for (const name of Object.keys(personas) as PersonaName[]) await signIn(name);
});

test.afterAll(async () => {
  await admin.from("applications").delete().like("store_name", `AUTHZ % ${runId}`);
  await admin.from("organizations").delete().in("id", [orgA, orgB, orgArchived]);
  for (const persona of Object.values(personas)) await admin.auth.admin.deleteUser(persona.id);
});

test("URL直接入力: 未認証・未所属・他組織・停止状態を拒否する", async ({ browser, page }) => {
  await page.goto(`${baseUrl}/stores/${storeA}/results`);
  await expect(page).toHaveURL(/\/login/);

  for (const name of [
    "noMembershipPending", "noMembershipApprovedUnpaid", "noMembershipIssued", "pendingMember", "archivedMember",
    "suspendedProfile", "archivedProfile"
  ] as PersonaName[]) {
    const context = await browserSession(browser, name);
    const deniedPage = await context.newPage();
    await deniedPage.goto(`${baseUrl}/stores/${storeA}/results`);
    await expect(deniedPage.getByRole("heading", { name: "成果を見る" }), `${name}へ成果本文を返さない`).toHaveCount(0);
    await expect(deniedPage.getByText("ページが見つかりません").or(deniedPage.getByRole("heading", { name: "ログイン" }))).toBeVisible();
    await context.close();
  }

  const other = await browserSession(browser, "otherOwner");
  const otherPage = await other.newPage();
  await otherPage.goto(`${baseUrl}/stores/${storeA}/results`);
  await expect(otherPage.getByText("ページが見つかりません")).toBeVisible();
  await other.close();

  const archivedOrg = await browserSession(browser, "archivedOrganizationOwner");
  const archivedOrgPage = await archivedOrg.newPage();
  await archivedOrgPage.goto(`${baseUrl}/stores/${storeArchivedOrg}/results`);
  await expect(archivedOrgPage.getByText("ページが見つかりません")).toBeVisible();
  await archivedOrg.close();
});

test("URL・API: active所属は自組織だけ読め、platform adminは横断できる", async ({ browser }) => {
  for (const name of ["owner", "manager", "staff", "viewer"] as PersonaName[]) {
    const context = await browserSession(browser, name);
    expect((await context.request.get(`${baseUrl}/stores/${storeA}/results`)).status(), `${name} own URL`).toBe(200);
    expect((await context.request.get(`${baseUrl}/stores/${storeA}/results/export`)).status(), `${name} own API`).toBe(200);
    expect((await context.request.get(`${baseUrl}/stores/${storeB}/results/export`)).status(), `${name} other API`).toBe(404);
    await context.close();
  }

  const platformAdmin = await browserSession(browser, "platformAdmin");
  expect((await platformAdmin.request.get(`${baseUrl}/stores/${storeA}/results`)).status()).toBe(200);
  expect((await platformAdmin.request.get(`${baseUrl}/stores/${storeB}/results`)).status()).toBe(200);
  await platformAdmin.close();
});

test("Server Action: viewer・未所属・他組織・停止アカウントの直接送信でも成果データを書き換えない", async ({ browser }) => {
  const before = await admin.from("search_visibility_keywords").select("id", { count: "exact", head: true }).eq("store_id", storeA);
  for (const name of ["viewer", "noMembershipApprovedUnpaid", "noMembershipIssued", "otherOwner", "suspendedProfile"] as PersonaName[]) {
    // Load a valid form first, then replace the HttpOnly session cookie before submitting.
    // This exercises the Server Action boundary directly instead of relying on page navigation guards.
    const context = await browserSession(browser, "viewer");
    const page = await context.newPage();
    await page.goto(`${baseUrl}/stores/${storeA}/results`);
    const switched = await context.request.post(`${baseUrl}/api/auth/session`, {
      data: { access_token: personas[name].accessToken, expires_in: 3600 }
    });
    expect(switched.status(), `${name}へセッション差替え`).toBe(200);
    await page.getByLabel("追加する検索キーワード").fill(`${name} denied ${runId}`);
    await page.getByRole("button", { name: "キーワードを追加" }).click();
    await page.waitForURL(/error=/);
    await expect(page.getByText("登録しました", { exact: false }), `${name}へ成功表示を返さない`).toHaveCount(0);
    await context.close();
  }
  const after = await admin.from("search_visibility_keywords").select("id", { count: "exact", head: true }).eq("store_id", storeA);
  expect(after.count).toBe(before.count);
});

test("DB REST/RPC: viewer・未所属・他組織を拒否し、editorだけ自組織へ書ける", async () => {
  const anonymous = createClient(supabaseUrl!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } });
  const viewer = jwtClient(personas.viewer.accessToken!);
  const outsider = jwtClient(personas.noMembershipIssued.accessToken!);
  const owner = jwtClient(personas.owner.accessToken!);
  const other = jwtClient(personas.otherOwner.accessToken!);
  const blocked = [
    ["pending-member", jwtClient(personas.pendingMember.accessToken!)],
    ["archived-member", jwtClient(personas.archivedMember.accessToken!)],
    ["suspended-profile", jwtClient(personas.suspendedProfile.accessToken!)],
    ["archived-profile", jwtClient(personas.archivedProfile.accessToken!)],
    ["archived-organization", jwtClient(personas.archivedOrganizationOwner.accessToken!)]
  ] as const;

  const anonymousRead = await anonymous.from("search_visibility_keywords").select("id").eq("id", seedKeywordId);
  expect(anonymousRead.error).toBeNull();
  expect(anonymousRead.data).toHaveLength(0);
  const anonymousWrite = await anonymous.from("search_visibility_keywords").insert({
    organization_id: orgA,
    store_id: storeA,
    keyword: `anonymous denied ${runId}`
  });
  expect(anonymousWrite.error).not.toBeNull();

  const viewerRead = await viewer.from("search_visibility_keywords").select("id").eq("id", seedKeywordId);
  expect(viewerRead.error).toBeNull();
  expect(viewerRead.data).toHaveLength(1);
  const otherRead = await other.from("search_visibility_keywords").select("id").eq("id", seedKeywordId);
  expect(otherRead.error).toBeNull();
  expect(otherRead.data).toHaveLength(0);

  for (const [name, client] of blocked) {
    const read = await client.from("search_visibility_keywords").select("id").eq("id", seedKeywordId);
    expect(read.error, `${name} DB read`).toBeNull();
    expect(read.data, `${name} DB read`).toHaveLength(0);
    const member = await client.rpc("is_org_member", { org_id: name === "archived-organization" ? orgArchived : orgA });
    const editor = await client.rpc("is_org_editor", { org_id: name === "archived-organization" ? orgArchived : orgA });
    expect(member.data, `${name} member RPC`).toBe(false);
    expect(editor.data, `${name} editor RPC`).toBe(false);
  }

  for (const [name, client] of [["viewer", viewer], ["outsider", outsider], ["other", other]] as const) {
    const result = await client.from("search_visibility_keywords").insert({
      organization_id: orgA,
      store_id: storeA,
      keyword: `${name} denied ${runId}`
    });
    expect(result.error, `${name} DB write`).not.toBeNull();
  }

  const ownerInsert = await owner.from("search_visibility_keywords").insert({
    organization_id: orgA,
    store_id: storeA,
    keyword: `owner allowed ${runId}`
  }).select("id").single();
  expect(ownerInsert.error).toBeNull();

  const spoofedParent = await owner.from("search_visibility_keywords").insert({
    organization_id: orgA,
    store_id: storeB,
    keyword: `parent mismatch ${runId}`
  });
  expect(spoofedParent.error).not.toBeNull();

  const [anonymousMember, anonymousEditor, anonymousAdmin, ownerMember, ownerEditor, viewerMember, viewerEditor, outsiderMember] = await Promise.all([
    anonymous.rpc("is_org_member", { org_id: orgA }),
    anonymous.rpc("is_org_editor", { org_id: orgA }),
    anonymous.rpc("is_platform_admin"),
    owner.rpc("is_org_member", { org_id: orgA }),
    owner.rpc("is_org_editor", { org_id: orgA }),
    viewer.rpc("is_org_member", { org_id: orgA }),
    viewer.rpc("is_org_editor", { org_id: orgA }),
    outsider.rpc("is_org_member", { org_id: orgA })
  ]);
  expect(anonymousMember.data).toBe(false);
  expect(anonymousEditor.data).toBe(false);
  expect(anonymousAdmin.data).toBe(false);
  expect(ownerMember.data).toBe(true);
  expect(ownerEditor.data).toBe(true);
  expect(viewerMember.data).toBe(true);
  expect(viewerEditor.data).toBe(false);
  expect(outsiderMember.data).toBe(false);
});

test("端末セッション: 2端末は独立し、一方のアプリログアウト後はその端末だけ拒否する", async ({ browser }) => {
  await signIn("owner");
  const deviceA = await browserSession(browser, "owner");
  await signIn("owner");
  const deviceB = await browserSession(browser, "owner");
  expect((await deviceA.request.get(`${baseUrl}/stores/${storeA}/results/export`)).status()).toBe(200);
  expect((await deviceB.request.get(`${baseUrl}/stores/${storeA}/results/export`)).status()).toBe(200);

  expect((await deviceA.request.delete(`${baseUrl}/api/auth/session`)).status()).toBe(200);
  expect([307, 401, 403, 404]).toContain((await deviceA.request.get(`${baseUrl}/stores/${storeA}/results/export`, { maxRedirects: 0 })).status());
  expect((await deviceB.request.get(`${baseUrl}/stores/${storeA}/results/export`)).status()).toBe(200);

  const forged = await browser.newContext();
  await forged.addCookies([{ name: "aio_auth_access_token", value: "forged.invalid.token", domain: "127.0.0.1", path: "/" }]);
  expect([307, 401, 403, 404]).toContain((await forged.request.get(`${baseUrl}/stores/${storeA}/results/export`, { maxRedirects: 0 })).status());
  await Promise.all([deviceA.close(), deviceB.close(), forged.close()]);
});
