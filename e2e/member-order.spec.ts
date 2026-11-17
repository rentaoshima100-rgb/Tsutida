import { expect, test } from "@playwright/test";
import { latestMail, registerChild, resetCodeLinks, signupMember, uniqueEmail } from "./helpers";

test.describe.configure({ mode: "serial" });

test("会員登録 → コードの入力 → 注文 → カードで支払い（擬似決済）", async ({ page }) => {
  await resetCodeLinks("TEST0M000001");
  const email = uniqueEmail("hanako");
  await signupMember(page, { email, name: "山田 花子", kana: "やまだ はなこ", marketing: true });
  await expect(page.getByText("会員登録が終わりました")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m08-welcome.png", fullPage: true });

  await registerChild(page, "test-0m00-0001", "山田 さくら", "やまだ さくら");
  await expect(page.getByText("お子さまを登録しました")).toBeVisible();
  await expect(page.getByText("つながっているアカウント 1／3")).toBeVisible();

  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "2026年度 運動会" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m01-events.png", fullPage: true });
  await page.getByRole("link", { name: "行事のページを見る" }).first().click();
  await expect(page.getByRole("heading", { name: "2026年度 運動会" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m02-event.png", fullPage: true });
  await page.getByRole("link", { name: "注文する" }).click();

  // DVD を2枚、Blu-ray を1枚
  const dvd = page.getByRole("group", { name: /運動会 DVDの枚数/ });
  await dvd.getByRole("button", { name: "1枚増やす" }).click();
  await dvd.getByRole("button", { name: "1枚増やす" }).click();
  await page.getByRole("group", { name: /運動会 Blu-rayの枚数/ }).getByRole("button", { name: "1枚増やす" }).click();
  await page.getByText("学校・園で受け取る").click();
  await page.getByText("クレジットカード").first().click();
  await expect(page.getByText("9,000円")).toBeVisible(); // 3,000 + 2,500 + 3,500
  await page.screenshot({ path: "test-results/shots/m03-order.png", fullPage: true });
  await page.getByRole("button", { name: "確認へ進む" }).click();

  await expect(page).toHaveURL(/\/order\/confirm/);
  await expect(page.getByText("申込みの期限")).toBeVisible();
  await expect(page.getByText("9,000円").last()).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m04-confirm.png", fullPage: true });
  await page.getByRole("button", { name: "注文を確定して支払う" }).click();

  await expect(page).toHaveURL(/\/dev\/fake-checkout/);
  await page.getByRole("button", { name: "支払う" }).click();
  await expect(page).toHaveURL(/\/orders\/T\d{7}\/complete/);
  await expect(page.getByText("お支払いが完了しました")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m05-complete.png", fullPage: true });

  const orderNo = (await page.locator("p.font-mono").first().textContent())!.trim();
  // 注文完了のメール（送信キューを流してから確かめる）
  await fetch("http://localhost:3000/api/cron/send", { headers: { authorization: "Bearer local-dev-cron-secret-0123456789" } });
  const mail = await latestMail(email, "ご注文ありがとうございます");
  expect(mail.text).toContain(orderNo);
  expect(mail.text).toContain("山田 さくらさん");

  // 明細ごとのキャンセル（Blu-ray だけ）→ 差額の返金
  await page.goto(`/mypage/orders/${orderNo}`);
  page.once("dialog", (d) => d.accept());
  await page.getByLabel(/運動会 Blu-ray/).check();
  await page.getByRole("button", { name: "選んだ明細を取り消す" }).click();
  await expect(page.getByText("3,500円を返金します")).toBeVisible();
  await page.reload();
  await expect(page.getByText("取り消し（返金済み）")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m07-detail.png", fullPage: true });
});

test("コンビニ払い：払込票の発行 → 入金で支払い済み", async ({ page }) => {
  await resetCodeLinks("TEST0K000001");
  const email = uniqueEmail("konbini");
  await signupMember(page, { email, name: "佐藤 一郎", kana: "さとう いちろう" });
  await registerChild(page, "TEST0K000001", "佐藤 そら", "さとう そら");
  // 登録が終わる前に次のページへ移ると、登録後の画面の更新に戻されることがある
  await expect(page.getByText("お子さまを登録しました")).toBeVisible();
  await page.goto("/events");
  await page.getByRole("link", { name: "行事のページを見る" }).first().click();
  await page.getByRole("link", { name: "注文する" }).click();
  await page.getByRole("group", { name: /運動会 DVDの枚数/ }).getByRole("button", { name: "1枚増やす" }).click();
  await page.getByText("自宅へ郵送").click();
  await page.getByLabel("郵便番号").fill("910-0001");
  await page.getByLabel("住所").fill("福井県福井市大願寺1-2-3");
  await page.getByText("コンビニ払い").first().click();
  await page.getByRole("button", { name: "確認へ進む" }).click();
  await expect(page.getByText("お支払いの時期")).toBeVisible();
  await expect(page.getByText("送料")).toBeVisible();
  await page.getByRole("button", { name: "注文を確定して支払う" }).click();
  await page.getByRole("button", { name: "払込票を発行する" }).click();
  await expect(page.getByText("お支払いのご案内")).toBeVisible();
  await expect(page.getByText("ファミリーマート").first()).toBeVisible();
  await page.screenshot({ path: "test-results/shots/m05-konbini.png", fullPage: true });
  const orderNo = (await page.locator("p.font-mono").first().textContent())!.trim();

  // 入金（擬似）
  const { pathname } = new URL(page.url());
  expect(pathname).toContain(orderNo);
  await page.goto(`/mypage/orders/${orderNo}`);
  await expect(page.getByText(/お支払い待ち（/).first()).toBeVisible();
});

test("QR コードから：コードを読み取って会員登録 → お子さまの登録でコードが入力済み", async ({ page }) => {
  await page.goto("/r?openExternalBrowser=1#TEST0M000002");
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByText("登録コードを読み取りました")).toBeVisible();
  // アドレスにコードを残さない
  expect(page.url()).not.toContain("TEST0M000002");
  await signupMember(page, { email: uniqueEmail("qr"), name: "読取 太郎", kana: "よみとり たろう" });
  await expect(page.getByLabel("登録コード（12文字）")).toHaveValue("TEST0M000002");
});
