import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// テストからも .env.local の値（ローカルの Supabase の鍵）を読む
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI などで環境変数を直接渡すとき
}

/** テストの準備・確認に使う、ローカルの Supabase の管理用クライアント */
export function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

type MailSummary = { ID: string; To: { Address: string }[]; Subject: string; Created: string };

/** Mailpit に届いた、その宛先の最新のメールの本文 */
export async function latestMail(to: string, subjectIncludes?: string, timeoutMs = 20_000): Promise<{ subject: string; text: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const json = (await res.json()) as { messages: MailSummary[] };
    const hit = json.messages.find((m) => !subjectIncludes || m.Subject.includes(subjectIncludes));
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Subject: string; Text: string; HTML: string };
      return { subject: msg.Subject, text: msg.Text || msg.HTML.replace(/<[^>]+>/g, " ") };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`mail to ${to} (${subjectIncludes ?? "any"}) did not arrive`);
}

export async function otpFor(email: string, subjectIncludes: string): Promise<string> {
  const mail = await latestMail(email, subjectIncludes);
  const m = mail.text.match(/\b(\d{6})\b/);
  if (!m) throw new Error(`no 6-digit code in mail: ${mail.text.slice(0, 200)}`);
  return m[1];
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** 会員登録して確認番号を入れ、M08 まで進む */
export async function signupMember(page: Page, opts: { email: string; name: string; kana: string; marketing?: boolean }) {
  await page.goto("/signup");
  await page.getByLabel("メールアドレス").fill(opts.email);
  await page.getByLabel("パスワード").fill("password-1234");
  await page.getByLabel("お名前（保護者・ご家族）").fill(opts.name);
  await page.getByLabel("ふりがな").fill(opts.kana);
  await page.getByLabel("電話番号").fill("090-1234-5678");
  await page.getByText("に同意します（必須）").click();
  if (opts.marketing) await page.locator('input[name="marketing"]').check();
  await page.getByRole("button", { name: "確認番号を送る" }).click();
  await expect(page).toHaveURL(/\/verify/);
  const code = await otpFor(opts.email, "確認番号");
  await page.getByLabel("確認番号（6桁）").fill(code);
  await page.getByRole("button", { name: "登録を完了する" }).click();
  await expect(page).toHaveURL(/\/mypage\/children/);
}

export async function registerChild(page: Page, code: string, name: string, kana: string) {
  await page.goto("/mypage/children");
  await page.getByLabel("登録コード（12文字）").fill(code);
  const newChild = page.getByText("はじめて登録するお子さま");
  if (await newChild.count()) await newChild.click();
  await page.getByLabel("お子さまのお名前").fill(name);
  await page.locator("#fullNameKana").fill(kana);
  await page.getByRole("button", { name: "登録する" }).click();
}

/** RFC 6238 の TOTP（認証アプリと同じ6桁）。テストで管理者の2段階認証を通すために使う */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", bytes).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}

let adminSecret: string | null = null;

/** 前の実行で登録した認証アプリを消し、毎回「登録の画面」から始められるようにする */
export async function resetAdminMfa(email = "admin@example.com") {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`${email} がいません（scripts/create-staff.mts で作ってください）`);
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
}

/** 管理画面にログインする（初回は認証アプリの登録の画面から秘密の値を読む） */
export async function adminLogin(page: Page) {
  if (!adminSecret && !process.env.E2E_ADMIN_TOTP_SECRET) await resetAdminMfa();
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill("admin@example.com");
  await page.getByLabel("パスワード").fill("admin-password-1234");
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByLabel("確認コード（6桁）")).toBeVisible();
  const secretText = page.getByText(/手で入力する場合：/);
  if (await secretText.count()) {
    adminSecret = (await secretText.textContent())!.replace(/^.*：/, "").trim();
  }
  if (!adminSecret) adminSecret = process.env.E2E_ADMIN_TOTP_SECRET ?? null;
  if (!adminSecret) throw new Error("TOTP の秘密の値がわかりません");
  await page.getByLabel("確認コード（6桁）").fill(totp(adminSecret));
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** 前の実行でつないだ会員を外し、登録コードを「つながっている会員0人」に戻す（テストを何度でも通せるように） */
export async function resetCodeLinks(code: string) {
  const admin = serviceClient();
  const { data, error } = await admin.from("registration_codes").select("id").eq("code", code).single();
  if (error || !data) throw new Error(`登録コード ${code} がありません`);
  await admin.from("member_children").update({ revoked_at: new Date().toISOString() }).eq("registration_code_id", data.id).is("revoked_at", null);
}
