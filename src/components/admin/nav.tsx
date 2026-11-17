"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, CalendarRange, ClipboardList, Factory, FileText, Gauge, KeyRound, Mail, PackageOpen,
  PhoneCall, ScrollText, Settings, Truck, Users, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }[] }[] = [
  { label: "", items: [{ href: "/admin", label: "ダッシュボード", icon: Gauge, exact: true }] },
  {
    label: "注文",
    items: [
      { href: "/admin/orders", label: "注文一覧", icon: ClipboardList, exact: true },
      { href: "/admin/orders/new", label: "代理注文", icon: PhoneCall },
      { href: "/admin/production", label: "集計・制作", icon: Factory },
      { href: "/admin/sorting", label: "仕分け（納品）", icon: PackageOpen },
      { href: "/admin/shipping", label: "発送（郵送）", icon: Truck },
    ],
  },
  {
    label: "行事",
    items: [
      { href: "/admin/events", label: "行事・商品", icon: CalendarRange },
      { href: "/admin/flyers", label: "チラシ・告知文", icon: FileText },
    ],
  },
  {
    label: "学校・園",
    items: [
      { href: "/admin/schools", label: "学校・園", icon: Building2 },
      { href: "/admin/codes", label: "登録コード", icon: KeyRound },
      { href: "/admin/years", label: "年度の切り替え", icon: RefreshCw },
    ],
  },
  {
    label: "会員・メール",
    items: [
      { href: "/admin/members", label: "会員", icon: Users },
      { href: "/admin/mail", label: "メール", icon: Mail },
    ],
  },
  {
    label: "",
    items: [
      { href: "/admin/sales", label: "売上", icon: BarChart3 },
      { href: "/admin/settings", label: "設定", icon: Settings },
      { href: "/admin/audit", label: "操作の記録", icon: ScrollText },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="管理メニュー" className="space-y-4 text-sm">
      {GROUPS.map((g, gi) => (
        <div key={gi} className="space-y-1">
          {g.label ? <p className="px-3 text-xs font-bold text-muted-foreground">{g.label}</p> : null}
          {g.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 font-medium",
                  active ? "bg-brand text-white" : "text-ink hover:bg-sidebar-accent",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
