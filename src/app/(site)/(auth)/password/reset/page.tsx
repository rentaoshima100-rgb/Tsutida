import type { Metadata } from "next";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "パスワードの再設定" };

// G11 パスワードの再設定（確認番号で行う）。管理者の初回のパスワード設定にも使う
export default function ResetPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>
      <ResetForm />
    </div>
  );
}
