import type { Metadata } from "next";
import { Notice } from "@/components/site/notice";
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
        <AdminLoginForm />
      </div>
    </main>
  );
}
