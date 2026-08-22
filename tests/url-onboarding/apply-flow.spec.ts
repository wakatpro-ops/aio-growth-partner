import { expect, test } from "@playwright/test";

const analysisResponse = {
  ok: true,
  analysis_token: "test-token-that-is-long-enough-for-the-public-flow-12345",
  status: "success",
  source_url: "https://example.com/",
  final_url: "https://example.com/",
  ai_status: "success",
  profile: {
    store_name: "ハーブピーリング＆アロマリンパマッサージnana",
    company_name: "",
    industry_key: "beauty_salon",
    industry_label: "美容室・サロン",
    address: "東京都杉並区高円寺南1-2-3",
    phone: "03-1234-5678",
    opening_hours: "10:00-20:00",
    description: "高円寺の完全個室サロンです。",
    services: ["ハーブピーリング", "アロマリンパマッサージ"],
    strengths: ["完全個室"],
    target_customers: [],
    social_urls: [],
    source_urls: ["https://example.com/"],
    field_origins: { store_name: "published", industry_key: "inferred", address: "published", phone: "published", opening_hours: "published", services: "published", strengths: "inferred", target_customers: "missing" }
  },
  diagnosis: {
    business_summary: "高円寺の完全個室サロンとして、ハーブピーリングとアロマリンパマッサージを提供しています。",
    readiness_score: 82,
    readiness_items: [
      { key: "identity", label: "店舗の基本情報", earned: 25, weight: 25, status: "確認できました", detail: "店舗名・地域・連絡先を確認できました。" },
      { key: "offering", label: "メニュー・提供内容", earned: 25, weight: 25, status: "確認できました", detail: "具体的なサービスを確認できました。" },
      { key: "local", label: "地域情報", earned: 15, weight: 15, status: "確認できました", detail: "所在地を確認できました。" }
    ],
    target_questions: ["高円寺でハーブピーリングならどこがおすすめ？", "高円寺で安心できるサロンは？", "nanaはどんな人におすすめ？"],
    top_improvement: { key: "target", title: "おすすめしたいお客様を具体化", description: "誰に合う施術かを明確にします。" },
    clarifying_questions: [{ id: "target_customers", label: "おすすめしたいお客様", question: "特にどのようなお客様に来てほしいですか？", placeholder: "例: 肌質改善をしたい方" }],
    recommended_modules: [{ key: "aio_improvement", label: "AIO改善", reason: "最初の改善を案内します。" }]
  }
};

test("URLだけで診断し、価値を確認してから最小情報で申し込める", async ({ page }) => {
  let submittedBody: Record<string, unknown> | null = null;
  await page.route("**/api/public/store-analysis", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(analysisResponse) }));
  await page.route("**/api/applications", async (route) => {
    submittedBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, application_id: "hidden-from-ui" }) });
  });

  await page.goto("/apply");
  await expect(page.getByRole("heading", { name: "お店のURLだけで、AIO改善を始められます" })).toBeVisible();
  await expect(page.locator("#contact_name")).toHaveCount(0);
  await page.locator("#source_url").fill("https://example.com");
  await page.getByRole("button", { name: "URLから無料で確認する" }).click();

  await expect(page.getByText("AIおすすめ準備度", { exact: true })).toBeVisible();
  await expect(page.getByText("82%")).toBeVisible();
  await expect(page.getByText("高円寺でハーブピーリングならどこがおすすめ？", { exact: false })).toBeVisible();
  await expect(page.locator("#contact_name")).toHaveCount(0);
  if (process.env.URL_ONBOARDING_SCREENSHOT) {
    await page.screenshot({ path: process.env.URL_ONBOARDING_SCREENSHOT, fullPage: true });
  }

  await page.getByRole("button", { name: "診断結果を保存して導入相談する" }).click();
  await expect(page.locator("#store_name")).toHaveValue("ハーブピーリング＆アロマリンパマッサージnana");
  if (process.env.URL_ONBOARDING_SCREENSHOT) {
    await page.screenshot({ path: process.env.URL_ONBOARDING_SCREENSHOT.replace(/\.png$/u, "-contact.png"), fullPage: true });
  }
  await page.locator("#contact_name").fill("テスト担当者");
  await page.locator("#email").fill("owner@example.com");
  await page.locator("#answer_target_customers").fill("肌質改善をしたい30〜50代の女性");
  await page.getByRole("button", { name: "確認内容を保存して導入相談を送る" }).click();

  await expect(page.getByRole("heading", { name: "診断結果と導入相談を受け付けました" })).toBeVisible();
  await expect(page.getByText("hidden-from-ui")).toHaveCount(0);
  expect(submittedBody).toMatchObject({
    analysis_token: analysisResponse.analysis_token,
    store_name: analysisResponse.profile.store_name,
    industry_detail_key: "beauty_salon",
    contact_name: "テスト担当者",
    email: "owner@example.com",
    answers: { target_customers: "肌質改善をしたい30〜50代の女性" }
  });
});

test("取得失敗時に技術的な内部情報を出さず再試行できる", async ({ page }) => {
  await page.route("**/api/public/store-analysis", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, code: "blocked_address", error: "公開されている店舗ページのURLを入力してください。" }) }));
  await page.goto("/apply");
  await page.locator("#source_url").fill("http://localhost:3000/admin");
  await page.getByRole("button", { name: "URLから無料で確認する" }).click();
  await expect(page.getByText("公開されている店舗ページのURLを入力してください。")).toBeVisible();
  await expect(page.getByText(/blocked_address|SUPABASE|stack/iu)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "URLから無料で確認する" })).toBeEnabled();
});

test("スマートフォン幅でも横スクロールせず主操作が見える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/apply");
  await expect(page.getByRole("button", { name: "URLから無料で確認する" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
