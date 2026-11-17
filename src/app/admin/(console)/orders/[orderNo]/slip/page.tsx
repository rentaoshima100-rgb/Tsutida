import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/print-button";
import { PaymentInstructions } from "@/components/orders/payment-instructions";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { activeItems, loadOrderByNo } from "@/lib/server/orders/load";
import type { PaymentDetails } from "@/lib/server/payments/types";
import { getSettings } from "@/lib/server/settings";
import { formatYen } from "@/lib/domain/pricing";
import { DELIVERY_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstCompact } from "@/lib/domain/time";

export const metadata: Metadata = { title: "払込票・振込先の印刷" };

// A09 のあと：注文者に渡す紙（コンビニ払いの払込票・銀行振込の振込先・現金の注文の控え）。10.3
export default async function SlipPage(props: PageProps<"/admin/orders/[orderNo]/slip">) {
  await requireStaff();
  const { orderNo } = await props.params;
  const order = await loadOrderByNo(orderNo);
  if (!order) notFound();
  const { business_info: biz } = await getSettings();
  const items = activeItems(order);
  const details = order.payment_details as PaymentDetails | null;
  const isCash = order.payment_method === "cash";
  const isPending = order.payment_status === "pending";
  const amountDue = Math.max(0, order.total - (order.amount_received ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Notice tone="success" className="flex-1">注文 {order.order_no} を作りました。この紙を印刷して、注文者に渡してください。</Notice>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Button asChild size="lg" variant="outline"><Link href={`/admin/orders/${order.order_no}`}>注文の詳細へ</Link></Button>
          <Button asChild size="lg" variant="outline"><Link href={`/admin/orders/new?event=${order.event_id}`}>続けて代理注文を作る</Link></Button>
        </div>
      </div>
      {!isPending ? (
        <Notice tone="warning" className="print:hidden">この注文は支払い待ちではありません（支払い済み・取り消し済みなど）。内容を確かめてから渡してください。</Notice>
      ) : null}

      <article className="mx-auto max-w-[180mm] space-y-5 rounded-xl border bg-white p-8 text-[0.95rem] leading-relaxed text-ink print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
          <div>
            <h1 className="text-2xl font-bold">{isCash ? "ご注文の控え" : "お支払いのご案内"}</h1>
            <p className="mt-1">{order.buyer_name ?? ""} 様</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">注文番号 {order.order_no}</p>
            <p>注文日 {formatJstCompact(order.created_at)}</p>
          </div>
        </header>

        <section>
          <h2 className="mb-1 font-bold">ご注文の内容</h2>
          <p>{order.event.school.name}　{order.event.name}</p>
          <table className="mt-2 w-full text-sm">
            <thead className="border-b text-left">
              <tr><th className="py-1">お子さま</th><th>商品</th><th className="text-right">枚数</th><th className="text-right">金額</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-1.5">{i.child.full_name}（{i.grade_label_snapshot} {i.class_name_snapshot}）</td>
                  <td>{i.product_name_snapshot}</td>
                  <td className="text-right">{i.quantity}</td>
                  <td className="text-right">{formatYen(i.amount)}</td>
                </tr>
              ))}
              {order.shipping_fee > 0 ? (
                <tr className="border-b"><td className="py-1.5" colSpan={3}>送料</td><td className="text-right">{formatYen(order.shipping_fee)}</td></tr>
              ) : null}
              <tr><td className="py-1.5 font-bold" colSpan={3}>合計（税込）</td><td className="text-right text-lg font-bold">{formatYen(order.total)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-sm">
            受け取り：{DELIVERY_METHOD_LABEL[order.delivery_method as "school" | "mail"]}
            {order.delivery_method === "mail" ? `（〒${order.ship_postal_code} ${order.ship_address}）` : ""}
          </p>
        </section>

        {isCash ? (
          <section className="space-y-1 rounded-xl border-2 border-ink p-5">
            <h2 className="text-lg font-bold">お支払い</h2>
            <p>代金 <span className="font-bold">{formatYen(order.total)}</span> は、現金でお支払いください。入金を確認したあと、制作に入ります。</p>
          </section>
        ) : (
          <PaymentInstructions method={order.payment_method} details={details} dueAt={order.payment_due_at} amountDue={amountDue} />
        )}

        <footer className="border-t pt-3 text-sm">
          <p className="font-bold">{biz.name}</p>
          <p>
            {biz.phone ? `電話 ${biz.phone}` : ""}
            {biz.hours ? `（${biz.hours}）` : ""}
            {biz.email ? `　メール ${biz.email}` : ""}
          </p>
          <p className="text-muted-foreground">お問い合わせのときは、注文番号をお伝えください。</p>
        </footer>
      </article>
    </div>
  );
}
