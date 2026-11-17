import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/site/notice";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { addDays, formatJstCompact, jstAt, jstDate } from "@/lib/domain/time";
import { orderWindow } from "@/lib/domain/deadlines";

export const metadata: Metadata = { title: "ダッシュボード" };

// A01 ダッシュボード：販売中の行事、今日の注文数、支払い待ち、締切が近い行事、メールが届いていない会員、要対応
export default async function DashboardPage() {
  await requireStaff();
  const admin = createAdminClient();
  const now = new Date();
  const todayStart = jstAt(jstDate(now), 0).toISOString();
  const weekLater = jstAt(addDays(jstDate(now), 7), 0).toISOString();

  const [events, todayOrders, pending, bounced, attention, refundsStuck] = await Promise.all([
    admin
      .from("events")
      .select("id, name, sale_starts_at, deadline_at, late_enabled, late_until, school:schools!inner(name)")
      .eq("status", "published")
      .lte("sale_starts_at", now.toISOString())
      .order("deadline_at"),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart)
      .in("payment_status", ["pending", "paid", "partially_refunded"]),
    admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "pending"),
    admin.from("members").select("id", { count: "exact", head: true }).neq("email_status", "ok").is("withdrawn_at", null),
    admin
      .from("orders")
      .select("order_no, needs_attention, updated_at")
      .not("needs_attention", "is", null)
      .order("updated_at", { ascending: false })
      .limit(20),
    admin.from("refunds").select("id", { count: "exact", head: true }).or("status.eq.failed,and(method.eq.stripe,stripe_refund_id.is.null)"),
  ]);

  const selling = (events.data ?? []).filter((e) => {
    const w = orderWindow(e, now);
    return w === "open" || w === "late";
  });
  const soon = selling.filter((e) => e.deadline_at <= weekLater && new Date(e.deadline_at) > now);

  // 販売中の行事ごとの注文の数
  const counts = new Map<string, { paid: number; pending: number }>();
  if (selling.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select("event_id, payment_status")
      .in("event_id", selling.map((e) => e.id))
      .in("payment_status", ["pending", "paid", "partially_refunded"]);
    for (const o of orders ?? []) {
      const c = counts.get(o.event_id) ?? { paid: 0, pending: 0 };
      if (o.payment_status === "pending") c.pending++;
      else c.paid++;
      counts.set(o.event_id, c);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="ダッシュボード" description={`${formatJstCompact(now)} 時点`} />

      {(attention.data ?? []).length > 0 ? (
        <Notice tone="warning" title={`要対応の注文が ${attention.data!.length} 件あります`}>
          <ul className="mt-1 space-y-0.5">
            {attention.data!.map((o) => (
              <li key={o.order_no}>
                <Link href={`/admin/orders/${o.order_no}`} className="font-bold underline">{o.order_no}</Link>：{o.needs_attention}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {(refundsStuck.count ?? 0) > 0 ? (
        <Notice tone="error" title={`返金が終わっていないものが ${refundsStuck.count} 件あります`}>
          注文の詳細の「返金」の欄から、やり直すか、別の方法で返金してください。
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="販売中の行事" value={`${selling.length} 件`} href="/admin/events" />
        <Stat label="今日の注文" value={`${todayOrders.count ?? 0} 件`} href="/admin/orders" />
        <Stat label="支払い待ち" value={`${pending.count ?? 0} 件`} href="/admin/orders?status=pending" />
        <Stat label="メールが届いていない会員" value={`${bounced.count ?? 0} 人`} href="/admin/members?email=bad" />
      </div>

      <Panel title="販売中の行事">
        {selling.length === 0 ? (
          <p className="text-sm text-muted-foreground">販売中の行事はありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-1.5">学校・園</th><th>行事</th><th>締切</th><th className="text-right">支払い済み</th><th className="text-right">支払い待ち</th></tr>
            </thead>
            <tbody>
              {selling.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{e.school.name}</td>
                  <td><Link href={`/admin/events/${e.id}`} className="font-bold text-brand underline">{e.name}</Link></td>
                  <td>
                    {formatJstCompact(e.deadline_at)}
                    {soon.some((s) => s.id === e.id) ? <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-xs font-bold text-warn">締切が近い</span> : null}
                    {orderWindow(e, now) === "late" ? <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs font-bold">締切後の受付中</span> : null}
                  </td>
                  <td className="text-right">{counts.get(e.id)?.paid ?? 0}</td>
                  <td className="text-right">{counts.get(e.id)?.pending ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
