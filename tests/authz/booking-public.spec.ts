import { expect, test } from "@playwright/test";

const baseUrl = process.env.BOOKING_TEST_BASE_URL ?? "http://127.0.0.1:3100";
const storeId = process.env.BOOKING_TEST_STORE_ID ?? "00000000-0000-4000-8000-000000000000";

test("未認証ユーザーの予約URL直入力とAPIアクセスを拒否する", async ({ page, request }) => {
  await page.goto(`${baseUrl}/stores/${storeId}/bookings`);
  await expect(page).toHaveURL(/\/login(?:\?|$)/u);

  const response = await request.get(`${baseUrl}/api/stores/${storeId}/bookings`);
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "ログインが必要です。" });
});
