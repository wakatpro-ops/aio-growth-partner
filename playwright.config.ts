import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.AUTHZ_TEST_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "off",
    screenshot: "off",
    video: "off"
  }
});
