import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.use({ viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

test("管理者：パスワード＋TOTP でログインし、ダッシュボードと注文一覧を見る", async ({ page }) => {
  await adminLogin(page);
  await expect(page.getByRole("heading", { name: "ダッシュボード" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/a01-dashboard.png", fullPage: true });
  await page.getByRole("link", { name: "注文一覧" }).click();
  await expect(page.getByRole("heading", { name: "注文一覧" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/a07-orders.png", fullPage: true });
  const first = page.locator("a.font-mono").first();
  if (await first.count()) {
    await first.click();
    await expect(page.getByRole("heading", { name: /^注文 T\d{7}$/ })).toBeVisible();
    await page.screenshot({ path: "test-results/shots/a08-order.png", fullPage: true });
  }
});
