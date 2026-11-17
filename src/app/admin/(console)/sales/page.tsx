import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, Stat, selectClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { byEvent, byMonth, bySchool, salesDataset, totalOf, type SalesSummary } from "@/lib/server/sales";
import { formatYen } from "@/lib/domain/pricing";
import { fiscalYearOf } from "@/lib/domain/time";

export const metadata: Metadata = { title: "売上" };

const VIEWS = { event: "行事別", school: "学校・園別", month: "月別（支払い日）" } as const;
type View = keyof typeof VIEWS;

function pct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}

// A15 売上：行事別・学校・園別・月別の売上と本数、注文の割合、会計ソフト用CSV
export default async function SalesPage(props: PageProps<"/admin/sales">) {
  await requireStaff();
  const sp = await props.searchParams;
  const current = fiscalYearOf(new Date());
  const fy = Number(typeof sp.fy === "string" ? sp.fy : current) || current;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "event";
  const { events, orders } = await salesDataset(fy);
  const rows: SalesSummary[] = view === "event" ? byEvent(events, orders) : view === "school" ? bySchool(events, orders) : byMonth(orders);
  const total = totalOf(rows);

  return (
    <div className="space-y-5">
      <PageHeader
        title="売上"
        description={`${fy}年度（${fy}年4月〜${fy + 1}年3月）の行事の、支払われた注文。売上は返金を差し引いた額（税込）です。`}
      />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">年度</span>
          <select name="fy" defaultValue={String(fy)} className={selectClass}>
            {[current + 1, current, current - 1, current - 2, current - 3].map((y) => <option key={y} value={y}>{y}年度</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">集計の単位</span>
          <select name="view" defaultValue={view} className={selectClass}>
            {Object.entries(VIEWS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <Button type="submit" variant="outline">表示</Button>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="売上（返金後）" value={formatYen(total.revenue)} />
        <Stat label="注文" value={`${total.orders} 件`} note={`返金 ${formatYen(total.refunds)}`} />
        <Stat label="本数" value={`${total.units} 本`} />
        <Stat label="ネット注文の割合" value={pct(total.web, total.orders)} note={`代理注文 ${total.proxy} 件。9割を超えたら紙の受付を終える目安（17章）`} />
      </div>

      <Panel
        title={VIEWS[view]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><a href={`/api/admin/sales?fy=${fy}`}>会計ソフト用CSV</a></Button>
            <Button asChild size="sm" variant="outline"><a href={`/api/admin/sales?fy=${fy}&encoding=sjis`}>CSV（Shift_JIS）</a></Button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">この年度の支払われた注文はありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5">{view === "event" ? "行事" : view === "school" ? "学校・園" : "月"}</th>
                  <th className="text-right">注文</th>
                  <th className="text-right">うち代理</th>
                  <th className="text-right">本数</th>
                  <th className="text-right">売上（返金後）</th>
                  <th className="text-right">返金</th>
                  {view === "event" ? <th className="text-right">注文したお子さま／クラスの人数</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.label}-${i}`} className="border-t">
                    <td className="py-2">
                      <span className="font-bold">{r.label}</span>
                      {r.sub ? <span className="block text-xs text-muted-foreground">{r.sub}</span> : null}
                    </td>
                    <td className="text-right">{r.orders}</td>
                    <td className="text-right">{r.proxy}</td>
                    <td className="text-right">{r.units}</td>
                    <td className="text-right font-bold">{formatYen(r.revenue)}</td>
                    <td className="text-right">{r.refunds > 0 ? formatYen(r.refunds) : "—"}</td>
                    {view === "event" ? (
                      <td className="text-right">
                        {r.orderedChildren ?? 0}／{r.capacity ?? 0}人（{pct(r.orderedChildren ?? 0, r.capacity ?? 0)}）
                      </td>
                    ) : null}
                  </tr>
                ))}
                <tr className="border-t-2 font-bold">
                  <td className="py-2">合計</td>
                  <td className="text-right">{total.orders}</td>
                  <td className="text-right">{total.proxy}</td>
                  <td className="text-right">{total.units}</td>
                  <td className="text-right">{formatYen(total.revenue)}</td>
                  <td className="text-right">{total.refunds > 0 ? formatYen(total.refunds) : "—"}</td>
                  {view === "event" ? <td /> : null}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          「注文したお子さま」は、取り消していない明細があるお子さまの数です。「クラスの人数」は、学校・園の画面で登録した対象クラスの人数の合計です。
          支払い待ちの注文は含みません（<Link href="/admin/orders?status=pending" className="underline">支払い待ちの一覧</Link>）。
        </p>
      </Panel>
    </div>
  );
}
