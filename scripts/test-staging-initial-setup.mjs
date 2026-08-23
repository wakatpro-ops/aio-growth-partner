import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const envFile = process.env.INITIAL_SETUP_E2E_ENV_FILE
  ?? (existsSync(".env.staging.local") ? ".env.staging.local" : ".env.local");
process.loadEnvFile(envFile);

const baseUrl = process.env.INITIAL_SETUP_E2E_BASE_URL ?? "https://staging.aioboost.jp";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const allowedStagingUrl = baseUrl.includes("staging.aioboost.jp") || baseUrl.includes("aio-growth-partner-staging-");
const allowedStagingDatabase = supabaseUrl.includes("zlqqjifitnvorudxbepy");
if (!allowedStagingUrl || !allowedStagingDatabase) {
  throw new Error(`This integration test is restricted to AIO boost staging: ${JSON.stringify({ allowedStagingUrl, allowedStagingDatabase, supabaseConfigured: Boolean(supabaseUrl) })}`);
}
if (!adminKey) throw new Error("Staging Supabase admin credentials are unavailable.");

const admin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Aio-${randomBytes(12).toString("base64url")}9!`;
const organizationId = randomUUID();
const storeId = randomUUID();
const snapshotId = randomUUID();
const users = [];

async function createUser(label) {
  const email = `codex-initial-${label}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("test user creation failed");
  users.push(data.user.id);
  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: data.user.id,
    display_name: `初期設定${label}`,
    role: "user"
  });
  if (profileError) throw profileError;
  return { id: data.user.id, email };
}

async function signIn(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

try {
  const owner = await createUser("owner");
  const staff = await createUser("staff");
  const unaffiliated = await createUser("unaffiliated");

  assert.equal((await admin.from("organizations").insert({
    id: organizationId,
    name: `初期設定統合テスト ${suffix}`,
    owner_user_id: owner.id,
    plan_key: "starter"
  })).error, null);
  assert.equal((await admin.from("organization_members").insert([
    { organization_id: organizationId, user_id: owner.id, role_key: "org_owner" },
    { organization_id: organizationId, user_id: staff.id, role_key: "staff" }
  ])).error, null);
  assert.equal((await admin.from("stores").insert({
    id: storeId,
    organization_id: organizationId,
    industry_type_key: "beauty_salon",
    name: "AI抽出サロン",
    address: "東京都杉並区",
    phone: "03-0000-0000",
    website_url: "https://example.com/salon",
    description: "AI抽出説明",
    profile_data: { onboarding_status: "not_started", services: ["候補A", "候補B"] },
    feature_flags: {},
    status: "active"
  })).error, null);
  assert.equal((await admin.from("onboarding_snapshots").insert({
    id: snapshotId,
    organization_id: organizationId,
    store_id: storeId,
    snapshot_type: "application_intake",
    title: "統合テスト初期設定",
    content: { extracted_profile: { services: ["候補A", "候補B"], address: "東京都杉並区" } },
    status: "active"
  })).error, null);
  assert.equal((await admin.from("invoice_number_sequences").insert({
    organization_id: organizationId,
    store_id: storeId,
    prefix: "INV",
    next_number: 1,
    qualified_invoice_issuer_name: "AI抽出サロン"
  })).error, null);

  const browser = await chromium.launch({ headless: true });
  try {
    const ownerPage = await browser.newPage();
    await signIn(ownerPage, owner.email);
    await ownerPage.goto(`${baseUrl}/stores/${storeId}`);
    await ownerPage.getByRole("link", { name: "データ取り込み" }).waitFor();
    await ownerPage.getByRole("button", { name: "AIに尋ねる" }).click();
    await ownerPage.getByRole("dialog", { name: "AIに尋ねる" }).waitFor();
    await ownerPage.getByRole("button", { name: "AI相談を閉じる" }).click();
    const assistantResponse = await ownerPage.evaluate(async ({ storeId }) => {
      const response = await fetch(`/api/stores/${storeId}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: `/stores/${storeId}`, message: "この画面でできることを教えて", history: [] }) });
      return { status: response.status, body: await response.json() };
    }, { storeId });
    assert.equal(assistantResponse.status, 200);
    assert.equal(typeof assistantResponse.body?.answer, "string");

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["商品名", "販売価格", "在庫管理"], ["取込済みメニュー", 5000, "はい"]]), "メニュー");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["商品名", "在庫数"], ["取込済みメニュー", 7]]), "在庫");
    const workbookBuffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    await ownerPage.goto(`${baseUrl}/stores/${storeId}/data-imports/ai?onboarding=1`);
    await ownerPage.getByText("初回設定の途中です", { exact: false }).waitFor();
    await ownerPage.locator("#unified_file").setInputFiles({ name: `initial-${suffix}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbookBuffer });
    await ownerPage.getByRole("button", { name: "アップロードしてAI解析" }).click();
    await ownerPage.waitForURL((url) => url.pathname.includes("/data-imports/ai/") && url.searchParams.get("onboarding") === "1");
    await ownerPage.getByRole("button", { name: "回答と分類を保存" }).click();
    await ownerPage.waitForURL((url) => url.searchParams.get("reviewed") === "1" && url.searchParams.get("onboarding") === "1");
    ownerPage.once("dialog", (dialog) => dialog.accept());
    await ownerPage.getByRole("button", { name: "確認した内容で取り込みを確定" }).click();
    await ownerPage.waitForURL((url) => url.searchParams.get("completed") === "1" && url.searchParams.get("onboarding") === "1");
    await ownerPage.getByRole("link", { name: "初回設定の続きを開く" }).click();
    await ownerPage.getByRole("heading", { name: "管理画面は、すでに準備できています" }).waitFor();
    await ownerPage.getByRole("heading", { name: "すでにここまで準備できています" }).waitFor();
    await ownerPage.getByRole("button", { name: "AIと一緒に仕上げる" }).click();
    await ownerPage.getByRole("button", { name: /1法人・1ブランド・1店舗/ }).click();
    await ownerPage.getByRole("button", { name: /電話・LINE・紙などで管理する/ }).click();
    await ownerPage.getByRole("button", { name: /CSV・Excelで売上を取り込む/ }).click();
    await ownerPage.getByRole("button", { name: "途中保存して終了" }).click();
    await ownerPage.waitForURL((url) => url.pathname === "/onboarding" && url.searchParams.get("setupDraft") === "saved");
    await ownerPage.getByText("いつでも続きから再開できます", { exact: false }).waitFor();
    await ownerPage.getByRole("link", { name: "AIと一緒に初期設定を仕上げる" }).click();
    await ownerPage.getByText("途中保存した内容から再開しています").waitFor();
    await ownerPage.locator("#store_name_editor").fill("確認済みサロン");
    await ownerPage.getByRole("button", { name: "この店舗情報で進む" }).click();
    await ownerPage.getByText("既存データの取り込みが完了しています", { exact: false }).waitFor();
    await ownerPage.getByText("商品・メニュー").waitFor();
    await ownerPage.getByRole("button", { name: /取り込み結果を使って進む/ }).click();
    await ownerPage.getByRole("button", { name: /内容を確認・編集する/ }).click();
    await ownerPage.locator("#menu_name_editor_0").fill("確認済みハーブピーリング");
    await ownerPage.locator('.setup-menu-editor input[type="checkbox"]').nth(1).uncheck();
    await ownerPage.getByRole("button", { name: "選んだメニューで進む" }).click();
    await ownerPage.locator("#invoice_issuer_name_editor").fill("確認済みサロン");
    await ownerPage.locator("#invoice_prefix_editor").fill("SALON");
    await ownerPage.getByRole("button", { name: "この請求書情報で進む" }).click();
    await ownerPage.getByText("この内容で正式データを作成します").click();
    await ownerPage.getByRole("button", { name: "この内容で利用を開始する" }).click();
    await ownerPage.waitForURL((url) => url.pathname === `/stores/${storeId}/aio-improvement` && url.searchParams.get("setup") === "completed");
    await ownerPage.getByText("初期設定を反映しました。", { exact: false }).waitFor();

    const [{ data: storedStore }, { data: storedItems }, { data: storedStocks }, { data: storedSnapshot }, { data: invoice }] = await Promise.all([
      admin.from("stores").select("name, profile_data, industry_type_key").eq("id", storeId).single(),
      admin.from("items").select("id, name, onboarding_source_key, archived_at").eq("store_id", storeId).is("archived_at", null),
      admin.from("inventory_stocks").select("item_id, quantity").eq("store_id", storeId),
      admin.from("onboarding_snapshots").select("confirmation_status, confirmed_by, confirmation_payload").eq("id", snapshotId).single(),
      admin.from("invoice_number_sequences").select("prefix, qualified_invoice_issuer_name").eq("store_id", storeId).single()
    ]);
    assert.equal(storedStore?.name, "確認済みサロン");
    assert.equal(storedStore?.profile_data?.onboarding_status, "completed");
    assert.deepEqual((storedItems ?? []).map((item) => item.name).sort(), ["取込済みメニュー", "確認済みハーブピーリング"].sort());
    const importedItemId = storedItems?.find((item) => item.name === "取込済みメニュー")?.id;
    assert.equal(storedStocks?.find((stock) => stock.item_id === importedItemId)?.quantity, 7);
    assert.equal(storedSnapshot?.confirmation_status, "completed");
    assert.equal(storedSnapshot?.confirmed_by, owner.id);
    assert.equal(invoice?.prefix, "SALON");

    await ownerPage.goto(`${baseUrl}/onboarding/setup-review?storeId=${storeId}`);
    await ownerPage.getByRole("heading", { name: "初期設定は反映済みです" }).waitFor();
    assert.equal((await admin.from("items").select("id", { count: "exact", head: true }).eq("store_id", storeId).is("archived_at", null)).count, 2);

    const staffPage = await browser.newPage();
    await signIn(staffPage, staff.email);
    await staffPage.goto(`${baseUrl}/onboarding/setup-review?storeId=${storeId}`);
    await staffPage.waitForURL((url) => url.pathname === "/forbidden");
    await staffPage.getByRole("heading", { name: "この画面を表示する権限がありません" }).waitFor();
    const staffAssistant = await staffPage.evaluate(async ({ storeId }) => {
      const response = await fetch(`/api/stores/${storeId}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: `/stores/${storeId}`, message: "操作方法を教えて", history: [] }) });
      return response.status;
    }, { storeId });
    assert.equal(staffAssistant, 200);

    const unaffiliatedPage = await browser.newPage();
    await signIn(unaffiliatedPage, unaffiliated.email);
    await unaffiliatedPage.goto(`${baseUrl}/onboarding/setup-review?storeId=${storeId}`);
    await unaffiliatedPage.getByRole("heading", { name: "ページが見つかりません" }).waitFor();
    const unaffiliatedAssistant = await unaffiliatedPage.evaluate(async ({ storeId }) => {
      const response = await fetch(`/api/stores/${storeId}/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pathname: `/stores/${storeId}`, message: "操作方法を教えて", history: [] }) });
      return response.status;
    }, { storeId });
    assert.equal(unaffiliatedAssistant, 404);
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    status: "passed",
    owner_confirmation: true,
    menu_edit_and_exclusion: true,
    duplicate_prevention: true,
    onboarding_import_to_items_and_inventory: true,
    contextual_ai_assistant: true,
    staff_forbidden: true,
    unaffiliated_hidden: true
  }));
} finally {
  const { data: importFiles } = await admin.from("unified_import_jobs").select("storage_bucket, storage_path").eq("store_id", storeId);
  for (const file of importFiles ?? []) {
    const { error: storageCleanupError } = await admin.storage.from(file.storage_bucket).remove([file.storage_path]);
    if (storageCleanupError) throw storageCleanupError;
  }
  const { error: organizationCleanupError } = await admin.from("organizations").delete().eq("id", organizationId);
  if (organizationCleanupError) throw organizationCleanupError;
  for (const userId of users) {
    const { error: userCleanupError } = await admin.auth.admin.deleteUser(userId);
    if (userCleanupError) throw userCleanupError;
  }
}
