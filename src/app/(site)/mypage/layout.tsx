import Link from "next/link";
import { requireMember } from "@/lib/server/auth";
import { logout } from "../(auth)/actions";
import { MypageTabs } from "./tabs";

export default async function MypageLayout({ children }: LayoutProps<"/mypage">) {
  const member = await requireMember("/mypage");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">マイページ</p>
          <p className="text-lg font-bold">{member.full_name} 様</p>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded-lg px-3 py-2 text-sm font-bold text-muted-foreground underline underline-offset-4 hover:bg-accent">
            ログアウト
          </button>
        </form>
      </div>
      <MypageTabs />
      <div>{children}</div>
      <p className="text-sm text-muted-foreground">
        ご不明な点は<Link href="/contact" className="font-bold text-brand underline underline-offset-4">お問い合わせ</Link>から。
      </p>
    </div>
  );
}
