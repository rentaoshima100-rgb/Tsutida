import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/nav";
import { requireStaff } from "@/lib/server/auth";
import { adminSignOut } from "../login/actions";

export const metadata: Metadata = { title: { default: "管理画面", template: "%s｜管理画面" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaff();
  return (
    <div className="flex min-h-screen bg-surface print:block print:bg-white">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r bg-sidebar p-3 md:block print:hidden">
        <div className="mb-4 px-3 py-2">
          <p className="text-xs font-bold text-muted-foreground">ツチダ映像 注文サイト</p>
          <p className="font-bold">管理画面</p>
        </div>
        <AdminNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-white px-5 py-2.5 text-sm print:hidden">
          <details className="md:hidden">
            <summary className="cursor-pointer font-bold">メニュー</summary>
            <div className="absolute z-20 mt-2 w-64 rounded-xl border bg-white p-3 shadow-lg">
              <AdminNav />
            </div>
          </details>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            <span>
              {staff.name}（{staff.role === "maintainer" ? "保守" : "管理者"}）
            </span>
            <form action={adminSignOut}>
              <button type="submit" className="rounded-md px-2 py-1 text-muted-foreground underline hover:bg-accent">ログアウト</button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-5 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
