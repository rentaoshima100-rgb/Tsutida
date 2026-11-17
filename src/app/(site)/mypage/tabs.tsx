"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/mypage", label: "注文履歴", match: (p: string) => p === "/mypage" || p.startsWith("/mypage/orders") },
  { href: "/mypage/children", label: "お子さま", match: (p: string) => p.startsWith("/mypage/children") },
  { href: "/mypage/settings", label: "会員情報", match: (p: string) => p.startsWith("/mypage/settings") },
];

export function MypageTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="マイページのメニュー" className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-2 py-2.5 text-center text-[0.95rem] font-bold",
              active ? "bg-white text-ink shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
