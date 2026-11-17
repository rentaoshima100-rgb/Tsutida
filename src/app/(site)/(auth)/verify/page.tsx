import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Notice } from "@/components/site/notice";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "確認番号の入力" };

// G10 確認番号の入力（6桁・有効期限1時間・再送は60秒あける）
export default async function VerifyPage(props: PageProps<"/verify">) {
  const sp = await props.searchParams;
  const email = (await cookies()).get("pending_signup_email")?.value;
  if (!email) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">確認番号の入力</h1>
        <Notice tone="warning" title="手続きが切れました">
          時間がたったため、手続きが切れました。もう一度
          <Link href="/signup" className="font-bold underline">会員登録</Link>
          または
          <Link href="/login" className="font-bold underline">ログイン</Link>
          をしてください。
        </Notice>
      </div>
    );
  }
  const masked = email.replace(/^(.{1,2}).*(@.*)$/, "$1***$2");
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">確認番号の入力</h1>
      <p className="leading-8">
        {masked} に、6桁の確認番号を送りました。メールに書かれた番号を入力してください。
      </p>
      <VerifyForm resent={sp.resent === "1"} />
      <Notice tone="info" title="メールが届かないとき">
        迷惑メールのフォルダをご確認ください。携帯電話のメールをお使いの場合は、「@order.t-eizou.com」からのメールを受け取れるように設定してください。すでに登録済みのメールアドレスの場合は、番号は届きません。
        <Link href="/login" className="font-bold underline">ログイン</Link>
        か
        <Link href="/password/reset" className="font-bold underline">パスワードの再設定</Link>
        をお試しください。
      </Notice>
    </div>
  );
}
