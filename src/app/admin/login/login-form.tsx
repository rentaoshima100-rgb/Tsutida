"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin, type AdminLoginState } from "./actions";

export function AdminLoginForm({ demo = false }: { demo?: boolean }) {
  const [state, action] = useActionState(adminLogin, { step: "password" } as AdminLoginState);

  if (state.step === "password") {
    return (
      <form action={action} className="space-y-4" noValidate={demo}>
        {state.message ? <Notice tone="error">{state.message}</Notice> : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">メールアドレス</Label>
          <Input id="email" name="email" type="email" autoComplete="username" className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">パスワード</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" className="h-10" />
        </div>
        <SubmitButton size="lg" className="w-full">次へ</SubmitButton>
        <p className="text-center text-sm">
          <Link href="/password/reset" className="text-brand underline">パスワードを設定する・忘れた</Link>
        </p>
      </form>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      {state.step === "enroll" ? (
        <div className="space-y-3">
          <p className="text-sm">
            はじめてのログインです。スマートフォンの認証アプリ（Google Authenticator、Microsoft Authenticator など）で、このQRコードを読み取ってください。
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="認証アプリに登録するQRコード" className="mx-auto size-48 rounded-lg border bg-white p-2" />
          <p className="break-all text-center font-mono text-xs text-muted-foreground">手で入力する場合：{state.secret}</p>
        </div>
      ) : (
        <p className="text-sm">
          {demo
            ? "本番では、認証アプリに表示されている6桁の確認コードを入力します。デモでは好きな数字を入れて進めてください。"
            : "認証アプリに表示されている6桁の確認コードを入力してください。"}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="code">確認コード（6桁）</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="h-11 text-center font-mono text-xl tracking-[0.3em]" autoFocus />
      </div>
      <SubmitButton size="lg" className="w-full">ログイン</SubmitButton>
    </form>
  );
}
