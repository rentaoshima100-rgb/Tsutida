"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { demoSide, isDemo } from "@/lib/demo";
import { isKana, tidyKana } from "@/lib/domain/kana";
import { ensureMemberRow, safeNextPath } from "@/lib/server/auth";
import { demoAdminSignIn, demoCreateMember, demoMemberSignIn } from "@/lib/server/demo-auth";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// 会員登録・確認番号・ログイン・パスワード再設定（G09〜G11）。確認番号は6桁で、リンクは使わない（14章）

const PENDING_EMAIL = "pending_signup_email";
const RESET_EMAIL = "pending_reset_email";
const NEXT_COOKIE = "after_login_next";

async function rememberEmail(name: string, email: string) {
  (await cookies()).set(name, email, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60, path: "/" });
}

const signupSchema = z.object({
  email: z.string().email("メールアドレスを正しく入力してください").max(254),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(72, "パスワードは72文字以内にしてください"),
  fullName: z.string().min(1, "お名前を入力してください").max(40),
  fullNameKana: z.string().min(1, "ふりがなを入力してください").max(60).refine(isKana, "ふりがなは、ひらがなかカタカナで入力してください"),
  phone: z.string().regex(/^[0-9０-９+\-－ ()（）]{10,15}$/, "電話番号を入力してください（例：090-1234-5678）"),
  terms: z.literal("on", { message: "利用規約とプライバシーポリシーへの同意が必要です" }),
});

export async function signup(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = {
    email: str(fd, "email").toLowerCase(),
    fullName: str(fd, "fullName"),
    fullNameKana: str(fd, "fullNameKana"),
    phone: str(fd, "phone"),
    marketing: str(fd, "marketing"),
    next: str(fd, "next"),
  };
  const parsed = signupSchema.safeParse({ ...values, password: String(fd.get("password") ?? ""), terms: str(fd, "terms") });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const settings = await getSettings();
  const metadata = {
    signup_kind: "member",
    full_name: parsed.data.fullName,
    full_name_kana: tidyKana(parsed.data.fullNameKana),
    phone: parsed.data.phone.normalize("NFKC"),
    marketing_opt_in: values.marketing === "on",
    consent_version: settings.consent_wording.version,
  };
  if (isDemo()) {
    // デモ：メールを送らずにアカウントを作り、確認番号の画面へ進む（番号は何を入れても通る）
    await demoCreateMember({ email: parsed.data.email, password: parsed.data.password, metadata });
    await rememberEmail(PENDING_EMAIL, parsed.data.email);
    if (values.next) (await cookies()).set(NEXT_COOKIE, safeNextPath(values.next), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60, path: "/" });
    redirect("/verify");
  }
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: metadata },
  });
  if (error) {
    if (/weak|password/i.test(error.message)) return { errors: { password: "もう少し推測されにくいパスワードにしてください" }, values };
    if (/rate|limit|seconds/i.test(error.message)) return { message: "短い時間に何度も送信されました。1分ほど待ってから、もう一度お試しください", values };
    console.error("[signup]", error.message);
    return { message: "登録を受け付けられませんでした。時間をおいて、もう一度お試しください", values };
  }
  await rememberEmail(PENDING_EMAIL, parsed.data.email);
  if (values.next) (await cookies()).set(NEXT_COOKIE, safeNextPath(values.next), { httpOnly: true, sameSite: "lax", maxAge: 60 * 60, path: "/" });
  redirect("/verify");
}

export async function verifySignup(_prev: FormState, fd: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = jar.get(PENDING_EMAIL)?.value;
  if (!email) return { message: "時間がたったため、手続きが切れました。もう一度、会員登録またはログインをしてください" };
  if (isDemo()) {
    if (!(await demoMemberSignIn(email))) return { message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください" };
    jar.delete(PENDING_EMAIL);
    const demoNext = jar.get(NEXT_COOKIE)?.value;
    jar.delete(NEXT_COOKIE);
    redirect(demoNext ? safeNextPath(demoNext) : "/mypage/children?welcome=1");
  }
  const token = str(fd, "token").normalize("NFKC").replace(/\D/g, "");
  if (token.length !== 6) return { errors: { token: "メールに届いた6桁の番号を入力してください" } };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.user) {
    return { errors: { token: "番号が違うか、有効期限（1時間）が過ぎています。番号を確かめるか、もう一度送ってください" } };
  }
  await ensureMemberRow(data.user.id);
  jar.delete(PENDING_EMAIL);
  const next = jar.get(NEXT_COOKIE)?.value;
  jar.delete(NEXT_COOKIE);
  redirect(next ? safeNextPath(next) : "/mypage/children?welcome=1");
}

export async function resendSignupCode(): Promise<FormState> {
  const email = (await cookies()).get(PENDING_EMAIL)?.value;
  if (!email) return { message: "時間がたったため、手続きが切れました。もう一度、会員登録をしてください" };
  if (isDemo()) return { ok: true, message: "デモではメールを送りません。本番では、ここで確認番号をもう一度送ります" };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { message: "60秒ほど待ってから、もう一度お試しください" };
  return { ok: true, message: "確認番号をもう一度送りました" };
}

export async function login(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email").toLowerCase(), next: str(fd, "next") };
  const password = String(fd.get("password") ?? "");
  if (isDemo()) {
    // デモ：何を入れてもログインできる。メールアドレスの欄が「A」なら管理画面に入る
    if (demoSide(values.email) === "admin") {
      if (!(await demoAdminSignIn())) return { message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください", values };
      redirect("/admin");
    }
    if (!(await demoMemberSignIn(values.email))) return { message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください", values };
    redirect(safeNextPath(values.next));
  }
  if (!values.email || !password) return { message: "メールアドレスとパスワードを入力してください", values };
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: values.email, password });
  if (error) {
    if (/not confirmed/i.test(error.message)) {
      await rememberEmail(PENDING_EMAIL, values.email);
      await supabase.auth.resend({ type: "signup", email: values.email });
      redirect("/verify?resent=1");
    }
    return { message: "メールアドレスかパスワードが違います", values };
  }
  const member = await ensureMemberRow(data.user.id);
  if (!member) {
    await supabase.auth.signOut();
    const { data: staff } = await createAdminClient().from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
    return {
      message: staff
        ? "管理者のアカウントです。管理画面（/admin/login）からログインしてください"
        : "このアカウントは使えません。お問い合わせください",
      values,
    };
  }
  redirect(safeNextPath(values.next));
}

export async function logout() {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  if (isDemo()) {
    // デモ：メールは送らず、確認番号の入力へ進む
    await rememberEmail(RESET_EMAIL, email || "demo");
    return { ok: true, values: { email } };
  }
  if (!z.string().email().safeParse(email).success) return { errors: { email: "メールアドレスを正しく入力してください" }, values: { email } };
  const supabase = await createUserClient();
  // 登録の有無は画面に出さない
  await supabase.auth.resetPasswordForEmail(email);
  await rememberEmail(RESET_EMAIL, email);
  return { ok: true, values: { email } };
}

export async function confirmPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = jar.get(RESET_EMAIL)?.value;
  if (!email) return { message: "時間がたったため、手続きが切れました。もう一度メールアドレスを入力してください" };
  if (isDemo()) {
    // デモ：パスワードは変えずに、そのままログインする
    jar.delete(RESET_EMAIL);
    if (!(await demoMemberSignIn(email))) return { ok: true, message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください", values: { email } };
    redirect("/events");
  }
  const token = str(fd, "token").normalize("NFKC").replace(/\D/g, "");
  const password = String(fd.get("password") ?? "");
  if (token.length !== 6) return { ok: true, errors: { token: "メールに届いた6桁の番号を入力してください" }, values: { email } };
  if (password.length < 8) return { ok: true, errors: { password: "パスワードは8文字以上にしてください" }, values: { email } };

  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error || !data.user) {
    return { ok: true, errors: { token: "番号が違うか、有効期限（1時間）が過ぎています" }, values: { email } };
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return { ok: true, errors: { password: "このパスワードは使えません。別のものにしてください" }, values: { email } };
  jar.delete(RESET_EMAIL);
  const { data: staff } = await createAdminClient().from("staff").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (staff) {
    // 管理者は、続けて2段階認証でログインし直す
    await supabase.auth.signOut();
    redirect("/admin/login?reset=1");
  }
  await ensureMemberRow(data.user.id);
  redirect("/events");
}
