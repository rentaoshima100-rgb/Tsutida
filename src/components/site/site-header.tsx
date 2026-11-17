import Link from "next/link";
import { getMember } from "@/lib/server/auth";

export async function SiteHeader() {
  const member = await getMember();
  return (
    <header className="border-b border-border bg-background">
      {/* スマホ幅（〜393px）でもサイト名とボタンが折り返さないよう、狭いときは余白と文字を少し詰める */}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-3 min-[400px]:gap-3 min-[400px]:px-4">
        <Link href={member ? "/events" : "/"} className="flex min-w-0 flex-col leading-tight">
          <span className="text-[0.8rem] font-bold tracking-wide text-muted-foreground">ツチダ映像</span>
          {/* いちばん狭い画面（320px）で折り返すときも、語の途中で切れないようにする */}
          <span className="text-[0.9rem] font-bold text-ink min-[400px]:text-base">
            <span className="inline-block">DVD・Blu-ray</span> <span className="inline-block">ネット注文</span>
          </span>
        </Link>
        {member ? (
          <nav aria-label="会員メニュー" className="flex shrink-0 items-center gap-1 text-sm">
            <Link href="/events" className="whitespace-nowrap rounded-lg px-2.5 py-2 font-bold hover:bg-accent">
              行事
            </Link>
            <Link href="/mypage" className="whitespace-nowrap rounded-lg px-2.5 py-2 font-bold hover:bg-accent">
              マイページ
            </Link>
          </nav>
        ) : (
          <nav aria-label="ログイン" className="flex shrink-0 items-center gap-1 text-sm min-[400px]:gap-2">
            <Link href="/login" className="whitespace-nowrap rounded-lg px-2.5 py-2 font-bold hover:bg-accent min-[400px]:px-3">
              ログイン
            </Link>
            <Link href="/signup" className="whitespace-nowrap rounded-lg bg-brand px-2.5 py-2 font-bold text-white hover:bg-brand-strong min-[400px]:px-3">
              会員登録
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
