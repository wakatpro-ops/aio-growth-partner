import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const storeId = process.env.BOOKING_TEST_STORE_ID;

test("AI受信Webhookの稼働確認は秘密情報を返さない", async ({ request }) => {
  const response = await request.get(`${baseUrl}/api/inbound/store-email`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, service: "AIO boost store email inbound" });
});

test("共有秘密なしの受信要求はDB処理より前に拒否する", async ({ request }) => {
  const response = await request.post(`${baseUrl}/api/inbound/store-email`, {
    multipart: { to: "store-unknown@in.aioboost.jp", from: "attacker@example.invalid", subject: "予約", text: "予約日時：2026年9月10日 10:00" }
  });
  expect([401, 503]).toContain(response.status());
});

test("未認証ユーザーは店舗のAI受信箱へURL直接入力しても内容を取得できない", async ({ page }) => {
  test.skip(!storeId, "既存店舗のIDを指定した環境で実行します。");
  await page.goto(`${baseUrl}/stores/${storeId}/ai-inbox`);
  const redirectedToLogin = /\/login(?:\?|$)/u.test(page.url());
  const concealedAsNotFound = await page.getByRole("heading", { name: "ページが見つかりません" }).isVisible();
  expect(redirectedToLogin || concealedAsNotFound).toBe(true);
  await expect(page.getByRole("heading", { name: "AI受信箱" })).toHaveCount(0);
});
