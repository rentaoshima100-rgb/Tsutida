import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/site/notice";
import { requireMember } from "@/lib/server/auth";
import { listLinkedChildren } from "@/lib/server/children";
import { getSettings } from "@/lib/server/settings";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "お子さまの登録" };

// M08 お子さまの登録
export default async function ChildrenPage(props: PageProps<"/mypage/children">) {
  const member = await requireMember("/mypage/children");
  const sp = await props.searchParams;
  const [children, settings] = await Promise.all([listLinkedChildren(member.id), getSettings()]);
  const max = settings.max_accounts_per_child;
  return (
    <div className="space-y-8">
      {sp.welcome === "1" ? (
        <Notice tone="success" title="会員登録が終わりました">
          ご注文やお支払いのお知らせは「{settings.mail_sender.from_address}」から届きます。携帯電話のメールをお使いの場合は、このアドレスからのメールを受け取れるように設定してください。
        </Notice>
      ) : null}

      <section className="space-y-4">
        <h1 className="text-xl font-bold">登録しているお子さま</h1>
        {children.length === 0 ? (
          <p className="rounded-xl bg-surface p-4">まだ登録がありません。学校・園から配られた登録コードを、下の欄に入力してください。</p>
        ) : (
          <ul className="space-y-3">
            {children.map((c) => (
              <li key={c.childId} className="rounded-xl border border-border p-4">
                <p className="text-lg font-bold">
                  {c.fullName}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{c.fullNameKana}</span>
                </p>
                <ul className="mt-2 space-y-1 text-[0.95rem]">
                  {c.years.map((y) => (
                    <li key={y.fiscalYear} className="flex flex-wrap justify-between gap-x-4">
                      <span>
                        {y.fiscalYear}年度　{y.schoolName}　{y.gradeLabel} {y.className}
                      </span>
                      <span className="text-muted-foreground">
                        つながっているアカウント {y.accounts}／{max}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {children.length > 0 ? (
          <p>
            <Link href="/events" className="font-bold text-brand underline underline-offset-4">
              販売中の行事を見る
            </Link>
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border-2 border-ink p-5">
        <h2 className="text-lg font-bold">登録コードを入力する</h2>
        <p className="text-[0.95rem] leading-7 text-muted-foreground">
          兄弟姉妹は、お子さまごとのコードを入力してください。毎年4月に、新年度のコードが学校・園から配られます。
        </p>
        <CodeForm
          childOptions={children.map((c) => ({
            id: c.childId,
            label: `${c.fullName}さん`,
          }))}
        />
      </section>
    </div>
  );
}
