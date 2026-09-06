import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test("LINE Webhookの稼働確認は秘密情報を返さない", async ({ request }) => {
  const response = await request.get(`${baseUrl}/api/line/webhook`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true, service: "AIO boost LINE webhook" });
});

test("Invalid signature is rejected before JSON or DB processing", async ({ request }) => {
  const response = await request.post(`${baseUrl}/api/line/webhook`, {
    headers: { "x-line-signature": "invalid" },
    data: { events: [{ webhookEventId: "must-not-be-processed", type: "message" }] }
  });
  expect([401, 503]).toContain(response.status());
});

test("LINEリマインドCronを未認証で実行できない", async ({ request }) => {
  const response = await request.get(`${baseUrl}/api/cron/line-booking-reminders`);
  expect(response.status()).toBe(401);
});

