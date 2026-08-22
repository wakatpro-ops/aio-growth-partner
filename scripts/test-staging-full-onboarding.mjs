import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const envFile = process.env.FULL_ONBOARDING_E2E_ENV_FILE
  ?? (existsSync(".env.staging.local") ? ".env.staging.local" : ".env.local");
process.loadEnvFile(envFile);
if (process.env.FULL_ONBOARDING_E2E_SECRET_ENV_FILE) {
  process.loadEnvFile(process.env.FULL_ONBOARDING_E2E_SECRET_ENV_FILE);
}

const baseUrl = process.env.FULL_ONBOARDING_E2E_BASE_URL ?? "https://staging.aioboost.jp";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!baseUrl.includes("staging.aioboost.jp") || !supabaseUrl.includes("zlqqjifitnvorudxbepy")) {
  throw new Error("This integration test is restricted to AIO boost staging.");
}
if (!adminKey) throw new Error("Staging Supabase admin credentials are unavailable.");

const admin = createClient(supabaseUrl, adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const adminEmail = `codex-full-admin-${suffix}@example.com`;
const ownerEmail = `codex-full-owner-${suffix}@example.com`;
const adminPassword = `Admin-${randomBytes(12).toString("base64url")}9!`;
const ownerPassword = `Owner-${randomBytes(12).toString("base64url")}9!`;
const verificationCode = "314159";
const testSourceUrl = "https://example.com/";
const userIds = [];
let applicationId = null;
let analysisId = null;
let organizationId = null;
let storeId = null;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function keyedHash(value) {
  return createHmac("sha256", process.env.CRON_SECRET || adminKey).update(value).digest("hex");
}

async function api(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": `aio-boost-full-e2e/${suffix}` },
    body: JSON.stringify(payload)
  });
  return { response, body: await response.json().catch(() => null) };
}

async function createAdminUser() {
  const { data, error } = await admin.auth.admin.createUser({ email: adminEmail, password: adminPassword, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("platform admin creation failed");
  userIds.push(data.user.id);
  const { error: profileError } = await admin.from("user_profiles").insert({
    user_id: data.user.id,
    display_name: "統合テスト運営管理者",
    role: "platform_admin"
  });
  if (profileError) throw profileError;
}

async function signIn(page, email, password) {
  await page.goto(`${baseUrl}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.ok(dimensions.scrollWidth <= dimensions.width + 2, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
}

try {
  await createAdminUser();

  const browser = await chromium.launch({ headless: true });
  try {
    const publicContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const publicPage = await publicContext.newPage();
    await publicPage.goto(`${baseUrl}/apply`);
    await publicPage.getByRole("heading", { name: "お店のページURLを入力してください" }).waitFor();
    await assertNoHorizontalOverflow(publicPage, "public apply desktop");
    await publicPage.locator("#source_url").fill(testSourceUrl);
    await publicPage.getByRole("button", { name: "URLから無料で簡易診断する" }).click();
    await publicPage.getByText("無料の簡易診断", { exact: true }).waitFor({ timeout: 90_000 });
    await publicPage.getByText("AIおすすめ準備度", { exact: true }).waitFor();
    await publicPage.getByRole("heading", { name: "まずメールアドレスを確認します" }).waitFor();
    await assertNoHorizontalOverflow(publicPage, "analysis preview desktop");
    await publicContext.close();

    const analysis = await api("/api/public/store-analysis", { source_url: testSourceUrl });
    assert.equal(analysis.response.status, 200, JSON.stringify(analysis.body));
    assert.equal(analysis.body?.ok, true);
    const analysisToken = analysis.body.analysis_token;
    assert.equal(typeof analysisToken, "string");
    const tokenHash = sha256(analysisToken);
    const { data: storedAnalysis, error: analysisError } = await admin.from("public_store_analyses")
      .select("id, extracted_profile, analysis_result, status")
      .eq("public_token_hash", tokenHash)
      .single();
    if (analysisError || !storedAnalysis) throw analysisError ?? new Error("analysis draft missing");
    analysisId = storedAnalysis.id;
    assert.ok(["success", "partial"].includes(storedAnalysis.status));

    const deterministicProfile = {
      ...(storedAnalysis.extracted_profile ?? {}),
      store_name: "AI抽出テストサロン",
      industry_key: "beauty_salon",
      industry_label: "美容室・サロン",
      address: "東京都杉並区梅里2-35-13",
      phone: "03-1234-5678",
      description: "公開URLから整理した統合テスト用店舗説明",
      services: ["ハーブピーリング", "アロマリンパマッサージ"],
      strengths: ["丁寧なカウンセリング", "完全予約制"],
      target_customers: ["美容と健康を整えたい方"]
    };
    assert.equal((await admin.from("public_store_analyses").update({ extracted_profile: deterministicProfile }).eq("id", analysisId)).error, null);

    const normalizedEmail = ownerEmail.toLowerCase();
    const verificationFields = {
      verification_name: "統合テスト店舗オーナー",
      verification_email: normalizedEmail,
      verification_email_hash: keyedHash(`email:${normalizedEmail}`),
      verification_code_hash: keyedHash(`verification:${analysisToken}:${normalizedEmail}:${verificationCode}`),
      verification_code_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      verification_attempts: 0,
      verification_sent_at: new Date().toISOString(),
      verification_send_count: 1,
      verification_window_started_at: new Date().toISOString()
    };
    assert.equal((await admin.from("public_store_analyses").update(verificationFields).eq("id", analysisId)).error, null);

    const wrongCode = await api("/api/public/store-analysis/verification/confirm", {
      analysis_token: analysisToken, email: normalizedEmail, code: "000000"
    });
    assert.equal(wrongCode.response.status, 400);
    assert.equal(typeof wrongCode.body?.error, "string");

    // Staging intentionally has no mail delivery provider. Mark the disposable
    // address verified after exercising the public rejection path so the rest
    // of the real application lifecycle can be tested without sending mail.
    assert.equal((await admin.from("public_store_analyses").update({
      verified_at: new Date().toISOString(),
      verification_code_hash: null,
      verification_code_expires_at: null
    }).eq("id", analysisId)).error, null);

    const tamperedContact = await api("/api/applications", {
      analysis_token: analysisToken,
      contact_name: "別人",
      email: "tampered@example.com",
      phone: "090-1234-5678",
      company_name: "統合テスト株式会社",
      store_relationship: "owner",
      authority_confirmed: true,
      message: "改ざん拒否確認"
    });
    assert.equal(tamperedContact.response.status, 403);

    const application = await api("/api/applications", {
      analysis_token: analysisToken,
      contact_name: "統合テスト店舗オーナー",
      email: normalizedEmail,
      phone: "090-1234-5678",
      company_name: "統合テスト株式会社",
      store_relationship: "owner",
      authority_confirmed: true,
      message: "実サイトの全工程統合テスト"
    });
    assert.equal(application.response.status, 200, JSON.stringify(application.body));
    assert.equal(application.body?.ok, true);
    assert.equal(application.body?.already_submitted, false);

    const duplicateApplication = await api("/api/applications", {
      analysis_token: analysisToken,
      contact_name: "統合テスト店舗オーナー",
      email: normalizedEmail,
      phone: "090-1234-5678",
      company_name: "統合テスト株式会社",
      store_relationship: "owner",
      authority_confirmed: true
    });
    assert.equal(duplicateApplication.response.status, 200);
    assert.equal(duplicateApplication.body?.already_submitted, true);

    const { data: storedApplication, error: appError } = await admin.from("applications")
      .select("id, intake_review_status, status, payment_status, organization_id, store_id")
      .eq("source_analysis_id", analysisId)
      .single();
    if (appError || !storedApplication) throw appError ?? new Error("application missing");
    applicationId = storedApplication.id;
    assert.equal(storedApplication.intake_review_status, "pending");
    assert.equal(storedApplication.organization_id, null);
    assert.equal(storedApplication.store_id, null);

    const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, adminEmail, adminPassword);
    await adminPage.goto(`${baseUrl}/admin/applications/${applicationId}`);
    await adminPage.getByRole("heading", { name: "株式会社 Navi Lifeによる事前審査" }).waitFor();
    assert.equal(await adminPage.getByRole("button", { name: "招待リンクを発行して利用開始メール送信" }).isEnabled(), false);
    await adminPage.locator("#intake_review_status").selectOption("approved");
    await adminPage.locator("#intake_review_note").fill("店舗オーナー本人の申込として確認済み");
    await adminPage.getByRole("button", { name: "事前審査を保存してメール送信" }).click();
    await adminPage.waitForURL((url) => url.searchParams.get("reviewed") === "1", { timeout: 30_000 });
    await adminPage.getByText("承認済み", { exact: true }).first().waitFor();
    const { data: approvedApplication } = await admin.from("applications")
      .select("intake_review_status, intake_reviewed_by, organization_id, store_id")
      .eq("id", applicationId).single();
    assert.equal(approvedApplication?.intake_review_status, "approved");
    assert.ok(approvedApplication?.intake_reviewed_by);
    assert.equal(approvedApplication?.organization_id, null);
    assert.equal(approvedApplication?.store_id, null);

    const { data: reviewLinkApplication } = await admin.from("applications").select("admin_checklist").eq("id", applicationId).single();
    const storedReviewUrl = reviewLinkApplication?.admin_checklist?.operator_review?.last_url;
    assert.equal(typeof storedReviewUrl, "string");
    assert.ok(storedReviewUrl.startsWith(`${baseUrl}/apply/result?token=`));
    await adminPage.getByRole("heading", { name: "発行済み詳細診断リンク" }).waitFor();
    const resultPage = await publicContextForResult(browser, storedReviewUrl);
    await resultPage.getByRole("heading", { name: /様のAIO詳細診断/ }).waitFor({ timeout: 30_000 });
    await resultPage.getByText("この詳細診断の承認だけで契約成立", { exact: false }).waitFor();
    await resultPage.context().close();

    await adminPage.locator("#status").selectOption("payment_confirmed");
    await adminPage.locator("#billing_status").selectOption("paid");
    await adminPage.locator("#billing_amount").fill("200000");
    await adminPage.locator("#payment_status").selectOption("paid");
    await adminPage.locator("#approval_status").selectOption("approved");
    await adminPage.locator("#billing_memo").fill("電子契約締結・月額料金の入金確認済み（統合テスト）");
    await adminPage.locator("#sales_notes").fill("本人確認、申込内容、運営承認を確認済み");
    await adminPage.getByRole("button", { name: "保存", exact: true }).click();
    await adminPage.waitForURL((url) => url.searchParams.get("saved") === "1", { timeout: 30_000 });
    assert.equal(await adminPage.getByRole("button", { name: "招待リンクを発行して利用開始メール送信" }).isEnabled(), true);
    await adminPage.getByRole("button", { name: "招待リンクを発行して利用開始メール送信" }).click();
    await adminPage.waitForURL((url) => url.searchParams.get("prepared") === "1", { timeout: 45_000 });
    await adminPage.getByRole("heading", { name: "発行済み招待リンク" }).waitFor();

    const { data: issuedApplication, error: issuedError } = await admin.from("applications")
      .select("status, payment_status, approval_status, organization_id, store_id, invited_user_id, account_status, onboarding_status, admin_checklist")
      .eq("id", applicationId).single();
    if (issuedError || !issuedApplication) throw issuedError ?? new Error("issued application missing");
    assert.equal(issuedApplication.status, "account_issued");
    assert.equal(issuedApplication.payment_status, "paid");
    assert.equal(issuedApplication.approval_status, "approved");
    assert.equal(issuedApplication.account_status, "invited");
    assert.ok(issuedApplication.admin_checklist?.invite?.last_url);
    organizationId = issuedApplication.organization_id;
    storeId = issuedApplication.store_id;
    userIds.push(issuedApplication.invited_user_id);

    const { data: ownerUser, error: ownerError } = await admin.auth.admin.updateUserById(issuedApplication.invited_user_id, {
      password: ownerPassword,
      email_confirm: true
    });
    if (ownerError || !ownerUser.user) throw ownerError ?? new Error("owner password preparation failed");

    const ownerContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, ownerEmail, ownerPassword);
    await ownerPage.goto(`${baseUrl}/onboarding/setup-review?storeId=${storeId}`);
    await ownerPage.getByRole("heading", { name: "違う部分だけ直して、利用を開始" }).waitFor();
    await ownerPage.getByText("株式会社 Navi Lifeによる申込者・利用権限の承認は完了", { exact: false }).waitFor();
    await assertNoHorizontalOverflow(ownerPage, "initial setup tablet");
    assert.equal(await ownerPage.locator("#store_name").getAttribute("value"), "AI抽出テストサロン");
    assert.equal(await ownerPage.locator("#address").getAttribute("value"), "東京都杉並区梅里2-35-13");
    assert.equal(await ownerPage.locator("#menu_name_0").getAttribute("value"), "ハーブピーリング");
    assert.equal(await ownerPage.locator("#menu_name_1").getAttribute("value"), "アロマリンパマッサージ");

    await ownerPage.locator("#store_name").fill("確認済み統合テストサロン");
    await ownerPage.locator("#address").fill("東京都杉並区梅里二丁目35番13号");
    await ownerPage.locator("#menu_name_0").fill("確認済みハーブピーリング");
    await ownerPage.locator("#menu_unit_price_0").fill("11000");
    await ownerPage.locator('input[name="menu_enabled_1"]').uncheck();
    await ownerPage.locator("#invoice_issuer_name").fill("統合テスト株式会社");
    await ownerPage.locator("#invoice_prefix").fill("TEST");
    await ownerPage.locator('input[name="final_confirmation"]').check();
    await ownerPage.getByRole("button", { name: "この内容で利用を開始する" }).click();
    await ownerPage.waitForURL((url) => url.pathname === `/stores/${storeId}/aio-improvement` && url.searchParams.get("setup") === "completed", { timeout: 45_000 });
    await ownerPage.getByText("初期設定を反映しました。", { exact: false }).waitFor();

    const [{ data: finalStore }, { data: finalItems }, { data: finalSnapshot }, { data: finalInvoice }, { data: finalApplication }] = await Promise.all([
      admin.from("stores").select("name, address, profile_data, industry_type_key").eq("id", storeId).single(),
      admin.from("items").select("name, unit_price, archived_at, onboarding_source_key").eq("store_id", storeId).is("archived_at", null),
      admin.from("onboarding_snapshots").select("confirmation_status, confirmed_by, confirmation_payload").eq("store_id", storeId).eq("snapshot_type", "application_intake").single(),
      admin.from("invoice_number_sequences").select("prefix, qualified_invoice_issuer_name").eq("store_id", storeId).single(),
      admin.from("applications").select("onboarding_status, account_status").eq("id", applicationId).single()
    ]);
    assert.equal(finalStore?.name, "確認済み統合テストサロン");
    assert.equal(finalStore?.address, "東京都杉並区梅里二丁目35番13号");
    assert.equal(finalStore?.profile_data?.onboarding_status, "completed");
    assert.deepEqual((finalItems ?? []).map((item) => item.name), ["確認済みハーブピーリング"]);
    assert.equal(finalItems?.[0]?.unit_price, 11000);
    assert.equal(finalSnapshot?.confirmation_status, "completed");
    assert.equal(finalSnapshot?.confirmed_by, issuedApplication.invited_user_id);
    assert.equal(finalInvoice?.prefix, "TEST");
    assert.equal(finalInvoice?.qualified_invoice_issuer_name, "統合テスト株式会社");
    assert.equal(finalApplication?.onboarding_status, "completed");
    assert.equal(finalApplication?.account_status, "issued");

    await ownerPage.goto(`${baseUrl}/onboarding/setup-review?storeId=${storeId}`);
    await ownerPage.getByRole("heading", { name: "初期設定は反映済みです" }).waitFor();
    assert.equal((await admin.from("items").select("id", { count: "exact", head: true }).eq("store_id", storeId).is("archived_at", null)).count, 1);
    await assertNoHorizontalOverflow(ownerPage, "completed setup tablet");
    await ownerContext.close();
    await adminContext.close();
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({
    status: "passed",
    public_apply_desktop: true,
    email_verification_rejection_and_staging_handoff: true,
    verified_identity_tamper_rejected: true,
    duplicate_application_prevented: true,
    operator_review: true,
    detail_release: true,
    payment_gate: true,
    account_issue: true,
    initial_setup_tablet: true,
    ai_profile_handoff: true,
    menu_edit_and_exclusion: true,
    invoice_handoff: true,
    duplicate_setup_prevented: true
  }));
} finally {
  if (organizationId) {
    const { error } = await admin.from("organizations").delete().eq("id", organizationId);
    if (error) console.error(`organization cleanup failed: ${error.message}`);
  }
  if (applicationId) {
    const { error } = await admin.from("applications").delete().eq("id", applicationId);
    if (error) console.error(`application cleanup failed: ${error.message}`);
  }
  if (analysisId) {
    const { error } = await admin.from("public_store_analyses").delete().eq("id", analysisId);
    if (error) console.error(`analysis cleanup failed: ${error.message}`);
  }
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`user cleanup failed: ${error.message}`);
  }
}

async function publicContextForResult(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(url);
  return page;
}
