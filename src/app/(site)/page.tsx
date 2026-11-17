import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CodeCardSample } from "@/components/site/code-card";
import { Notice } from "@/components/site/notice";
import { getMember } from "@/lib/server/auth";
import { fillText, getPublicSettings, textVariables } from "@/lib/server/settings";

// G01 トップ。Stripe に登録するURL。ログインなしで、何をいくらで売っているかがわかるようにする（仕様書8章）

const STEPS = [
  { title: "登録コードを受け取る", body: "学校・園から、お子さま1人に1枚のカードが配られます。" },
  { title: "会員登録", body: "カードのQRコードを読み取り、メールアドレスとパスワードを登録します。" },
  { title: "注文", body: "行事を選び、DVD・Blu-rayの枚数と受け取り方法を選びます。" },
  { title: "お支払い", body: "クレジットカード・PayPay・コンビニ払い・銀行振込から選べます。" },
  { title: "お届け", body: "学校・園へのお届け、またはご自宅への郵送でお受け取りください。" },
];

export default async function TopPage(props: PageProps<"/">) {
  if (await getMember()) redirect("/events");
  const withdrawn = (await props.searchParams).withdrawn === "1";
  const s = await getPublicSettings();
  const vars = textVariables(s);
  const b = s.business_info;

  return (
    <div className="space-y-14">
      {withdrawn ? (
        <Notice tone="success" title="退会の手続きが終わりました">
          ご利用ありがとうございました。ご注文の記録は、法律で決められた期間保管します。
        </Notice>
      ) : null}
      <section className="grid items-center gap-10 pt-2 sm:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <h1 className="text-[1.75rem] font-bold leading-snug sm:text-[2rem]">
            行事のDVD・Blu-rayを、
            <br />
            スマートフォンから注文できます
          </h1>
          <p className="text-[1.05rem] leading-8">{fillText(s.page_top.lead, vars)}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="xl">
              <Link href="/signup">会員登録をはじめる</Link>
            </Button>
            <Button asChild size="xl" variant="outline">
              <Link href="/login">ログイン</Link>
            </Button>
          </div>
        </div>
        <CodeCardSample />
      </section>

      {s.page_top.notice ? <Notice tone="warning">{fillText(s.page_top.notice, vars)}</Notice> : null}

      <section aria-labelledby="why" className="rounded-2xl bg-surface p-6">
        <h2 id="why" className="text-lg font-bold">
          行事のページは、在籍するご家庭だけが見られます
        </h2>
        <p className="mt-2 leading-8">{fillText(s.page_top.why_login, vars)}</p>
      </section>

      <section aria-labelledby="flow" className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="flow" className="text-xl font-bold">
            ご利用の流れ
          </h2>
          <Link href="/guide" className="text-sm font-bold text-brand underline underline-offset-4">
            くわしく見る
          </Link>
        </div>
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-xl border border-border p-4">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cap font-bold text-ink"
              >
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{step.title}</p>
                <p className="text-[0.95rem] text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="links" className="grid gap-3 sm:grid-cols-3">
        <h2 id="links" className="sr-only">
          ご案内
        </h2>
        {[
          { href: "/products", title: "商品と価格", body: "価格・送料・お届けの時期" },
          { href: "/sample", title: "見本の商品ページ", body: "注文の画面の見本" },
          { href: "/faq", title: "よくある質問", body: "登録コード・支払い・キャンセル" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="rounded-xl border border-border p-4 hover:border-brand">
            <p className="font-bold text-brand">{l.title}</p>
            <p className="text-sm text-muted-foreground">{l.body}</p>
          </Link>
        ))}
      </section>

      <section aria-labelledby="contact" className="space-y-2 rounded-2xl border border-border p-6">
        <h2 id="contact" className="text-lg font-bold">
          お問い合わせ
        </h2>
        <p>
          {b.name}
          {b.phone && b.phone !== "（未設定）" ? `　お電話：${b.phone}` : ""}
        </p>
        {b.hours ? <p className="text-muted-foreground">受付時間：{b.hours}</p> : null}
        <p>
          <Link href="/contact" className="font-bold text-brand underline underline-offset-4">
            お問い合わせフォーム
          </Link>
        </p>
        {s.snapsnap_url ? (
          <p className="pt-2 text-sm text-muted-foreground">
            写真のプリントのご注文は、
            <a href={s.snapsnap_url} className="font-bold text-brand underline underline-offset-4" rel="noopener">
              スナップスナップのツチダ映像のページ
            </a>
            からお願いします。
          </p>
        ) : null}
      </section>
    </div>
  );
}
