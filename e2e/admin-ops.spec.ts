import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { adminLogin, latestMail, uniqueEmail } from "./helpers";

// 管理画面の業務の流れ（A09 代理注文 → 印刷 → A08 現金の入金、A06・A10〜A12・A15、PDF・CSV、定期処理）
test.use({ viewport: { width: 1366, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
test.describe.configure({ mode: "serial" });

const UNDOKAI = "00000000-0000-4000-8000-000000001001"; // 運動会（受付中・学校／郵送）
const NATSU = "00000000-0000-4000-8000-000000001003"; // 夏まつり（締切後の受付中・郵送のみ）

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await adminLogin(page);
});

test.afterAll(async () => {
  await page.close();
});

async function fillProxy(p: Page, o: { klass: string; child: string; kana: string; qty: Record<string, number>; buyer: string; phone: string; email?: string; method: RegExp }) {
  await p.locator('select[name="classId"]').selectOption({ label: o.klass });
  await p.locator('input[name="childName"]').fill(o.child);
  await p.locator('input[name="childKana"]').fill(o.kana);
  for (const [name, n] of Object.entries(o.qty)) await p.getByLabel(`${name}の枚数`).fill(String(n));
  await p.locator('input[name="buyerName"]').fill(o.buyer);
  await p.locator('input[name="buyerPhone"]').fill(o.phone);
  if (o.email) await p.locator('input[name="buyerEmail"]').fill(o.email);
  await p.getByLabel(o.method).check();
}

test("A09 代理注文：コンビニ払い（メールあり）→ 払込票の印刷・メール", async () => {
  await page.goto(`/admin/orders/new?event=${UNDOKAI}`);
  await expect(page.getByRole("heading", { name: "代理注文" })).toBeVisible();
  const email = uniqueEmail("proxy-konbini");
  await fillProxy(page, { klass: "年少 もも組", child: "電話 はなこ", kana: "でんわ はなこ", qty: { "運動会 DVD": 2 }, buyer: "電話 花子", phone: "090-0000-1111", email, method: /コンビニ払い/ });
  // 2枚目は2枚目からの価格（3,000円＋2,500円）
  await expect(page.locator('aside[aria-label="金額"]')).toContainText("5,500円");
  await page.screenshot({ path: "test-results/shots/a09-proxy-form.png", fullPage: true });
  await page.getByRole("button", { name: "注文を作る" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\/T\d{7}\/slip$/);
  await expect(page.getByRole("heading", { name: "お支払いのご案内", exact: true }).first()).toBeVisible();
  await expect(page.getByText("ファミリーマート").first()).toBeVisible();
  await page.screenshot({ path: "test-results/shots/a09-slip-konbini.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "test-results/shots/a09-slip-konbini-print.png", fullPage: true });
  await page.emulateMedia({ media: "screen" });
  // メールはキューに入り、S1（5分ごとの送信）で送られる
  await page.request.get("/api/cron/send", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const mail = await latestMail(email, "お支払いのご案内");
  expect(mail.text).toContain("5,500円");
});

test("A09 代理注文：銀行振込（メールなし）→ 振込先", async () => {
  await page.goto(`/admin/orders/new?event=${UNDOKAI}`);
  await fillProxy(page, { klass: "年長 きりん組", child: "紙 たろう", kana: "かみ たろう", qty: { "運動会 Blu-ray": 1 }, buyer: "紙 太郎", phone: "090-0000-2222", method: /銀行振込/ });
  await page.getByRole("button", { name: "注文を作る" }).click();
  await expect(page).toHaveURL(/\/slip$/);
  await expect(page.getByText("銀行", { exact: true })).toBeVisible();
  await expect(page.getByText("3,500円").first()).toBeVisible();
});

test("A09 代理注文：コンビニ払いでメールがないと止める（入力は消えない）", async () => {
  await page.goto(`/admin/orders/new?event=${UNDOKAI}`);
  await fillProxy(page, { klass: "年少 もも組", child: "電話 じろう", kana: "でんわ じろう", qty: { "運動会 DVD": 1 }, buyer: "電話 次郎", phone: "090-0000-3333", method: /コンビニ払い/ });
  await page.getByRole("button", { name: "注文を作る" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "メールアドレスが必要です" })).toBeVisible();
  await expect(page.locator('input[name="childName"]')).toHaveValue("電話 じろう");
  await expect(page.locator('input[name="buyerPhone"]')).toHaveValue("090-0000-3333");
});

test("A09 代理注文：締切後の受付（郵送のみ・締切後の価格）を現金で → A08 で入金を記録", async () => {
  await page.goto(`/admin/orders/new?event=${NATSU}`);
  await expect(page.getByText("締切後の注文です")).toBeVisible();
  await fillProxy(page, { klass: "年少 もも組", child: "現金 さくら", kana: "げんきん さくら", qty: { "夏まつり DVD": 2 }, buyer: "現金 桜", phone: "090-0000-4444", method: /現金/ });
  await page.locator('input[name="shipPostalCode"]').fill("910-0001");
  await page.locator('input[name="shipAddress"]').fill("福井県福井市大手1-1-1");
  // 締切後の価格 3,500円×2 ＋ 送料600円
  await expect(page.locator('aside[aria-label="金額"]')).toContainText("7,600円");
  await page.getByRole("button", { name: "注文を作る" }).click();
  await expect(page).toHaveURL(/\/slip$/);
  await expect(page.getByRole("heading", { name: "ご注文の控え" })).toBeVisible();
  await page.getByRole("link", { name: "注文の詳細へ" }).click();
  await expect(page.getByRole("heading", { name: /^注文 T\d{7}$/ })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "現金の入金を記録する" }).click();
  await expect(page.getByText("支払い済み").first()).toBeVisible();
  await page.screenshot({ path: "test-results/shots/a08-cash-paid.png", fullPage: true });
});

test("A07 代理注文だけに絞り込める", async () => {
  await page.goto("/admin/orders?channel=proxy");
  await expect(page.getByRole("heading", { name: "注文一覧" })).toBeVisible();
  const rows = page.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  for (const t of await rows.allTextContents()) expect(t).toContain("代理");
});

test("A06 チラシ（PDF）と告知文", async () => {
  await page.goto(`/admin/flyers?event=${UNDOKAI}`);
  await expect(page.getByText("販売開始のお知らせ")).toBeVisible();
  await expect(page.locator("pre").first()).toContainText("openExternalBrowser=1");
  await page.screenshot({ path: "test-results/shots/a06-flyers.png", fullPage: true });
  const pdf = await page.request.get(`/api/admin/flyers/${UNDOKAI}?phone=1`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const body = await pdf.body();
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
  writeFileSync("test-results/shots/a06-flyer.pdf", body);
});

test("A15 売上：行事別・学校別・月別と CSV", async () => {
  for (const view of ["event", "school", "month"]) {
    await page.goto(`/admin/sales?view=${view}`);
    await expect(page.getByRole("heading", { name: "売上" })).toBeVisible();
  }
  await page.goto("/admin/sales?view=event");
  await expect(page.getByText("ネット注文の割合")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/a15-sales.png", fullPage: true });
  const csv = await page.request.get("/api/admin/sales");
  expect(csv.status()).toBe(200);
  const text = (await csv.body()).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("支払い日,注文日,注文番号");
  expect(text).toContain("代理注文");
  const sjis = await page.request.get("/api/admin/sales?encoding=sjis");
  expect(sjis.headers()["content-type"]).toContain("Shift_JIS");
});

test("A10〜A12・A03・A05 の画面と PDF が開ける", async () => {
  for (const [path, heading] of [
    [`/admin/production?event=${UNDOKAI}`, "集計・制作"],
    [`/admin/sorting?event=${UNDOKAI}`, "仕分け"],
    [`/admin/shipping?event=${NATSU}`, "発送"],
    ["/admin/codes", "登録コード"],
    [`/admin/events/${UNDOKAI}`, "運動会"],
    ["/admin/mail", "メール"],
    ["/admin/members", "会員"],
    ["/admin/settings", "設定"],
    ["/admin/audit", "操作の記録"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: heading })).toBeVisible();
  }
  await page.goto(`/admin/production?event=${UNDOKAI}`);
  await page.screenshot({ path: "test-results/shots/a10-production.png", fullPage: true });
  // 監査ログに代理注文が残っている
  await page.goto("/admin/audit");
  await expect(page.locator("tbody").getByText("代理注文の作成").first()).toBeVisible();
});

test("管理用の PDF・CSV はログインしていないと 401", async ({ request }) => {
  for (const url of [`/api/admin/flyers/${UNDOKAI}`, "/api/admin/sales", `/api/admin/sorting/${UNDOKAI}`]) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect(r.status()).toBe(401);
  }
});

test("定期処理：CRON_SECRET がないと 401、あれば動く", async ({ request }) => {
  expect((await request.get("/api/cron/hourly")).status()).toBe(401);
  const secret = process.env.CRON_SECRET!;
  const r = await request.get("/api/cron/hourly", { headers: { authorization: `Bearer ${secret}` } });
  expect(r.status()).toBe(200);
  const json = await r.json();
  expect(json).toBeTruthy();
  const s = await request.get("/api/cron/send", { headers: { authorization: `Bearer ${secret}` } });
  expect(s.status()).toBe(200);
});
