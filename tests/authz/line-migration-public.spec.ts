import { expect, test } from "@playwright/test";

const baseUrl = process.env.BOOKING_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const storeId = process.env.BOOKING_TEST_STORE_ID;

test("未認証ユーザーは既存LINE予約の移行画面へ直接アクセスできない", async ({ page }) => {
  test.skip(!storeId, "既存店舗のIDを指定した環境で実行します。");
  await page.goto(`${baseUrl}/stores/${storeId}/bookings/migration`);
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);
});
