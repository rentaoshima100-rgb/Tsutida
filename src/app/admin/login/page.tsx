import type { Metadata } from "next";
import { Notice } from "@/components/site/notice";
import { isDemo } from "@/lib/demo";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = { title: "管理画面ログイン", robots: { index: false } };

// A00 ログイン（メール＋パスワード＋TOTP）
export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const sp = await props.searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs font-bold text-muted-foreground">ツチダ映像 注文サイト</p>
          <h1 className="text-xl font-bold">管理画面</h1>
        </div>
        {sp.reset === "1" ? <Notice tone="success">パスワードを決めました。続けてログインしてください。</Notice> : null}
        {isDemo() ? (
          <Notice tone="info" title="デモ環境です">
            メールアドレスの欄に「A」と入れると管理画面、「B」と入れると会員（保護者）の画面に入ります。パスワードと確認コードは何でもかまいません。ほかの文字でも管理画面に入ります。本番では、パスワードに加えて、スマートフォンの認証アプリに出る6桁の確認コード（2段階認証）が必要です。
          </Notice>
        ) : null}
        <AdminLoginForm demo={isDemo()} />
      </div>
    </main>
  );
}
