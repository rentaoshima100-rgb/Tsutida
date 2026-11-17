import Link from "next/link";
import { getMember } from "@/lib/server/auth";

export async function SiteHeader() {
  const member = await getMember();
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href={member ? "/events" : "/"} className="flex flex-col leading-tight">
          <span className="text-[0.8rem] font-bold tracking-wide text-muted-foreground">ツチダ映像</span>
          <span className="text-base font-bold text-ink">DVD・Blu-ray ネット注文</span>
        </Link>
        {member ? (
          <nav aria-label="会員メニュー" className="flex items-center gap-1 text-sm">
            <Link href="/events" className="rounded-lg px-2.5 py-2 font-bold hover:bg-accent">
              行事
            </Link>
            <Link href="/mypage" className="rounded-lg px-2.5 py-2 font-bold hover:bg-accent">
              マイページ
            </Link>
          </nav>
        ) : (
          <nav aria-label="ログイン" className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-2 font-bold hover:bg-accent">
              ログイン
            </Link>
            <Link href="/signup" className="rounded-lg bg-brand px-3 py-2 font-bold text-white hover:bg-brand-strong">
              会員登録
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
