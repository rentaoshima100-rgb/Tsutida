import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, inputClass, selectClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { orderWindow } from "@/lib/domain/deadlines";
import { EVENT_STATUS_LABEL } from "@/lib/domain/status";
import { fiscalYearOf, formatJstCompact } from "@/lib/domain/time";

export const metadata: Metadata = { title: "行事・商品" };

const WINDOW = { before_sale: "販売前", open: "受付中", late: "締切後の受付", closed: "受付終了" } as const;

// A05 行事の一覧
export default async function EventsAdminPage(props: PageProps<"/admin/events">) {
  await requireStaff();
  const sp = await props.searchParams;
  const year = Number(sp.year ?? fiscalYearOf(new Date()));
  const school = typeof sp.school === "string" ? sp.school : "";
  const admin = createAdminClient();
  const { data: schools } = await admin.from("schools").select("id, name").order("name");
  let q = admin.from("events").select("id, name, status, sale_starts_at, deadline_at, late_enabled, late_until, production_fixed_at, school:schools!inner(name)").eq("fiscal_year", year).order("sale_starts_at", { ascending: false });
  if (school) q = q.eq("school_id", school);
  const { data: events } = await q;
  const now = new Date();
  return (
    <div className="space-y-4">
      <PageHeader title="行事・商品" actions={<Button asChild size="lg"><Link href="/admin/events/new">行事を作る</Link></Button>} />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">年度</span><input name="year" type="number" defaultValue={year} className={`${inputClass} w-24`} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">学校・園</span>
          <select name="school" defaultValue={school} className={selectClass}><option value="">すべて</option>{(schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <Button type="submit" variant="outline">表示</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">学校・園</th><th>行事</th><th>販売開始</th><th>締切</th><th>公開</th><th className="px-3">受付</th></tr></thead>
          <tbody>
            {(events ?? []).map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-2">{e.school.name}</td>
                <td><Link href={`/admin/events/${e.id}`} className="font-bold text-brand underline">{e.name}</Link></td>
                <td>{formatJstCompact(e.sale_starts_at)}</td>
                <td>{formatJstCompact(e.deadline_at)}{e.production_fixed_at ? <span className="ml-1 rounded bg-surface px-1 text-xs">本数確定</span> : null}</td>
                <td>{EVENT_STATUS_LABEL[e.status as keyof typeof EVENT_STATUS_LABEL]}</td>
                <td className="px-3">{e.status === "published" ? WINDOW[orderWindow(e, now)] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(events ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">この年度の行事はありません。</p> : null}
      </div>
    </div>
  );
}
