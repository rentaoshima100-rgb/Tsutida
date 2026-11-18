import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InAppBrowserNotice } from "@/components/site/in-app-browser-notice";
import { Notice } from "@/components/site/notice";
import { isDemo } from "@/lib/demo";
import { getMember, safeNextPath } from "@/lib/server/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };

// G11 ログイン
export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  if (await getMember()) redirect(next);
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <InAppBrowserNotice />
      {isDemo() ? (
        <Notice tone="info" title="デモ環境です">
          メールアドレスの欄に「A」と入れると管理画面、「B」と入れると会員（保護者）の画面に入ります。パスワードは何でもかまいません。ほかの文字や空のままでも、会員の画面に入ります。本番では、会員登録したメールアドレスとパスワードが必要です。
        </Notice>
      ) : null}
      <LoginForm next={next} />
      <div className="rounded-xl bg-surface p-4 text-center">
        <p>はじめての方は、学校・園から配られた登録コードで</p>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-bold text-brand underline underline-offset-4">
          会員登録
        </Link>
        をしてください。
      </div>
    </div>
  );
}
