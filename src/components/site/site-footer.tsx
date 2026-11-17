import Link from "next/link";
import { getPublicSettings } from "@/lib/server/settings";

const LINKS = [
  { href: "/guide", label: "ご利用の流れ" },
  { href: "/products", label: "商品と価格" },
  { href: "/faq", label: "よくある質問" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/legal/tokushoho", label: "特定商取引法に基づく表記" },
  { href: "/legal/terms", label: "利用規約" },
  { href: "/legal/privacy", label: "プライバシーポリシー" },
  { href: "/legal/cancel", label: "キャンセル・交換について" },
];

export async function SiteFooter() {
  const s = await getPublicSettings();
  const b = s.business_info;
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm">
        <nav aria-label="サイトの案内">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="underline-offset-4 hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-1 text-muted-foreground">
          <p className="font-bold text-ink">{b.name}</p>
          {b.phone && b.phone !== "（未設定）" ? (
            <p>
              お電話：{b.phone}
              {b.hours ? `（${b.hours}）` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
