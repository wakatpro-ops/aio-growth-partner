import { expect, test } from "@playwright/test";

const previewResponse = {
  ok: true,
  analysis_token: "test-token-that-is-long-enough-for-the-public-flow-12345",
  status: "success",
  profile: {
    store_name: "ハーブピーリング＆アロマリンパマッサージnana",
    industry_label: "美容室・サロン",
    address: "東京都杉並区高円寺南1-2-3"
  },
  diagnosis: {
    business_summary: "高円寺の完全個室サロンとして公開情報を確認しました。",
    readiness_score: 82,
    top_improvement: { key: "target", title: "おすすめしたいお客様を具体化", description: "誰に合う施術かを明確にします。" }
  }
};

test("簡易診断からメール確認・正式申込・運営確認待ちまで進める", async ({ page }) => {
  let submittedBody: Record<string, unknown> | null = null;
  await page.route("**/api/public/store-analysis", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previewResponse) }));
  await page.route("**/api/public/store-analysis/verification/request", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, expires_in_minutes: 10 }) }));
  await page.route("**/api/public/store-analysis/verification/confirm", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, contact_name: "テスト担当者", email: "owner@example.com" }) }));
  await page.route("**/api/applications", async (route) => {
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, review_status: "pending" }) });
  });

  await page.goto("/apply");
  await expect(page.locator("#contact_name")).toHaveCount(0);
  await page.locator("#source_url").fill("https://example.com");
  await page.getByRole("button", { name: "URLから無料で簡易診断する" }).click();

  await expect(page).toHaveURL(/\/apply\/analyzing$/u);
  await expect(page.getByRole("heading", { name: "お店の公開情報を整理しています" })).toBeVisible();
  await expect(page.getByText("AIにおすすめされる準備状況を診断しています")).toBeVisible();
  await expect(page).toHaveURL(/\/apply\/diagnosis$/u);
  await expect(page.getByText("AIおすすめ準備度", { exact: true })).toBeVisible();
  await expect(page.getByText("82%")).toBeVisible();
  await expect(page.getByText("おすすめしたいお客様を具体化")).toBeVisible();
  await expect(page.getByText("東京都杉並区高円寺南1-2-3")).toBeVisible();
  await expect(page.getByText(/想定質問/u)).toHaveCount(0);
  await expect(page.locator("#structure_mode")).toHaveCount(0);
  await expect(page.locator("#company_name")).toHaveCount(0);
  if (process.env.URL_ONBOARDING_SCREENSHOT) await page.screenshot({ path: process.env.URL_ONBOARDING_SCREENSHOT, fullPage: true });

  await page.locator('input[name="store_confirmed"]').check();
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#contact_name").fill("テスト担当者");
  await page.locator("#phone").fill("090-1234-5678");
  await page.locator("#store_relationship").selectOption("owner");
  await page.locator('input[name="authority_confirmed"]').check();
  await page.getByRole("button", { name: "確認メールを受け取る" }).click();
  await page.locator("#verification_code").fill("123456");
  await page.getByRole("button", { name: "メールを確認して申し込む" }).click();

  await expect(page.getByRole("heading", { name: "株式会社 Navi Lifeが申込内容を確認します" })).toBeVisible();
  expect(submittedBody).toMatchObject({
    analysis_token: previewResponse.analysis_token,
    contact_name: "テスト担当者",
    email: "owner@example.com",
    phone: "090-1234-5678",
    store_relationship: "owner",
    store_confirmed: true,
    authority_confirmed: true
  });
  expect(submittedBody).not.toHaveProperty("operating_model");
});

test("誤った確認コードでは正式申込を開かない", async ({ page }) => {
  await page.route("**/api/public/store-analysis", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(previewResponse) }));
  await page.route("**/api/public/store-analysis/verification/request", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }));
  await page.route("**/api/public/store-analysis/verification/confirm", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, code: "verification_invalid", error: "確認コードが一致しません。" }) }));
  await page.goto("/apply");
  await page.locator("#source_url").fill("https://example.com");
  await page.getByRole("button", { name: "URLから無料で簡易診断する" }).click();
  await expect(page).toHaveURL(/\/apply\/diagnosis$/u);
  await page.locator('input[name="store_confirmed"]').check();
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#contact_name").fill("テスト担当者");
  await page.locator("#phone").fill("090-1234-5678");
  await page.locator("#store_relationship").selectOption("owner");
  await page.locator('input[name="authority_confirmed"]').check();
  await page.getByRole("button", { name: "確認メールを受け取る" }).click();
  await page.locator("#verification_code").fill("000000");
  await page.getByRole("button", { name: "メールを確認して申し込む" }).click();
  await expect(page.getByText("確認コードが一致しません。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "株式会社 Navi Lifeが申込内容を確認します" })).toHaveCount(0);
});

test("取得失敗時に技術的な内部情報を出さず再試行できる", async ({ page }) => {
  await page.route("**/api/public/store-analysis", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, code: "blocked_address", error: "公開されている店舗ページのURLを入力してください。" }) }));
  await page.goto("/apply");
  await page.locator("#source_url").fill("http://localhost:3000/admin");
  await page.getByRole("button", { name: "URLから無料で簡易診断する" }).click();
  await expect(page).toHaveURL(/\/apply\/analyzing$/u);
  await expect(page.getByText("公開されている店舗ページのURLを入力してください。")).toBeVisible();
  await expect(page.getByText(/blocked_address|SUPABASE|stack/iu)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "別のURLを入力" })).toBeVisible();
});

test("スマートフォン幅でも横スクロールせず主操作が見える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/apply");
  await expect(page.getByRole("button", { name: "URLから無料で簡易診断する" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("不正な承認リンクでは詳細診断を表示しない", async ({ page }) => {
  await page.goto("/apply/result?token=tampered-token");
  await expect(page.getByRole("heading", { name: "詳細診断を表示できません" })).toBeVisible();
  await expect(page.getByText(/想定質問 1/u)).toHaveCount(0);
});
