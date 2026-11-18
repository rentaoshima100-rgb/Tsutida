import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InAppBrowserNotice } from "@/components/site/in-app-browser-notice";
import { Notice } from "@/components/site/notice";
import { isDemo } from "@/lib/demo";
import { getMember, safeNextPath } from "@/lib/server/auth";
import { getPublicSettings } from "@/lib/server/settings";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "会員登録" };

// G09 会員登録
export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next, "") : "";
  if (await getMember()) redirect(next || "/mypage/children");
  const s = await getPublicSettings();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">会員登録</h1>
      <InAppBrowserNotice />
      <p className="leading-8">
        登録は最初の1回だけです。ご家族それぞれが、ご自分のメールアドレスで登録できます。
      </p>
      {isDemo() ? (
        <Notice tone="info" title="デモ環境です">
          本番では、登録したメールアドレスに6桁の確認番号が届き、その番号を入力すると登録が完了します。デモではメールを送らないので、次の画面で好きな数字を入れて進めてください。
        </Notice>
      ) : null}
      <SignupForm next={next} consentLabel={s.consent_wording.label} />
      <p className="text-center">
        登録済みの方は
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-bold text-brand underline underline-offset-4">
          ログイン
        </Link>
      </p>
    </div>
  );
}
