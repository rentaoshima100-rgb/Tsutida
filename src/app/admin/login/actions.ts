"use server";

import { redirect } from "next/navigation";
import { demoSide, isDemo } from "@/lib/demo";
import { demoAdminSignIn, demoMemberSignIn } from "@/lib/server/demo-auth";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { str } from "@/lib/form";

// A00 管理者のログイン：メール＋パスワード → TOTP（初回は登録）。aal2 にならないと /admin に入れない（3章）

export type AdminLoginState =
  | { step: "password"; message?: string }
  | { step: "enroll"; factorId: string; qr: string; secret: string; message?: string }
  | { step: "verify"; factorId: string; message?: string };

const DEMO_FACTOR = "demo";

async function adminSignIn(_prev: AdminLoginState, fd: FormData): Promise<AdminLoginState> {
  // デモ：何を入れても次（確認コードの入力）へ進む。メールアドレスの欄が「B」なら会員の画面に入る
  if (isDemo()) {
    if (demoSide(str(fd, "email")) === "member") {
      if (!(await demoMemberSignIn(""))) return { step: "password", message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください" };
      redirect("/events");
    }
    return { step: "verify", factorId: DEMO_FACTOR };
  }
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { step: "password", message: "メールアドレスかパスワードが違います" };

  const { data: staff } = await createAdminClient()
    .from("staff")
    .select("active")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (!staff?.active) {
    await supabase.auth.signOut();
    return { step: "password", message: "管理画面を使えるアカウントではありません" };
  }

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");
  if (verified) return { step: "verify", factorId: verified.id };

  // 登録の途中でやめた認証アプリを消してから、登録し直す
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "ツチダ映像 注文サイト 管理画面",
    issuer: "ツチダ映像 注文サイト",
  });
  if (enrollError || !enrolled) return { step: "password", message: "2段階認証の準備ができませんでした" };
  return { step: "enroll", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret };
}

/** ひとつのフォームで2段階を進める（パスワード → 確認コード） */
export async function adminLogin(prev: AdminLoginState, fd: FormData): Promise<AdminLoginState> {
  if (prev.step === "password") return adminSignIn(prev, fd);
  return adminVerifyTotp(prev, fd);
}

async function adminVerifyTotp(prev: Exclude<AdminLoginState, { step: "password" }>, fd: FormData): Promise<AdminLoginState> {
  if (isDemo() && prev.factorId === DEMO_FACTOR) {
    // デモ：確認コードは何を入れても通す
    if (!(await demoAdminSignIn())) return { ...prev, message: "デモ用のログインができませんでした。時間をおいて、もう一度お試しください" };
    redirect("/admin");
  }
  const code = str(fd, "code").replace(/\D/g, "");
  const supabase = await createUserClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: prev.factorId, code });
  if (error) return { ...prev, message: "確認コードが違います。認証アプリの最新の6桁を入力してください" };
  redirect("/admin");
}

export async function adminSignOut() {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
