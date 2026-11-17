import { defineConfig, devices } from "@playwright/test";

// 15章：会員登録 → コードの入力 → 注文 → テスト決済を通して確かめる。
// ローカルの Supabase（npx supabase start）と、PAYMENT_GATEWAY=fake の開発サーバーで動かす
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
