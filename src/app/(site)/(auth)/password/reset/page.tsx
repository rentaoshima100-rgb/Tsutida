import type { Metadata } from "next";
import { Notice } from "@/components/site/notice";
import { isDemo } from "@/lib/demo";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "パスワードの再設定" };

// G11 パスワードの再設定（確認番号で行う）。管理者の初回のパスワード設定にも使う
export default function ResetPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>
      {isDemo() ? (
        <Notice tone="info" title="デモ環境です">
          本番では、メールに届いた6桁の確認番号を入力して、新しいパスワードを決めます。デモではメールを送らず、パスワードも変わりません。何を入れても進めます。
        </Notice>
      ) : null}
      <ResetForm />
    </div>
  );
}
