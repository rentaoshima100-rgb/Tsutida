import type { Metadata } from "next";
import { Notice } from "@/components/site/notice";
import { verifyUnsubscribeToken } from "@/lib/server/mail/unsubscribe";
import { UnsubscribeForm } from "./unsubscribe-form";

export const metadata: Metadata = { title: "お知らせメールの配信停止", robots: { index: false } };

// G12 配信停止。リンクを開いただけでは止めず、ボタンで止める（メールのリンクを自動で開く仕組みへの備え）
export default async function UnsubscribePage(props: PageProps<"/unsubscribe">) {
  const sp = await props.searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const valid = Boolean(verifyUnsubscribeToken(token));
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">お知らせメールの配信停止</h1>
      {valid ? <UnsubscribeForm token={token} /> : <Notice tone="error">リンクが正しくありません。メールのリンクをもう一度開くか、マイページの「会員情報」から設定してください。</Notice>}
    </div>
  );
}
