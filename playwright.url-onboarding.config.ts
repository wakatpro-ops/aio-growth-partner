import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/url-onboarding",
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/apply",
    timeout: 120_000,
    reuseExistingServer: true
  }
});
