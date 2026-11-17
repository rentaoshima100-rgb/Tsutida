import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderLines } from "@/components/orders/order-lines";
import { PaymentInstructions } from "@/components/orders/payment-instructions";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/server/auth";
import { loadOrderByNo } from "@/lib/server/orders/load";
import type { PaymentDetails } from "@/lib/server/payments/types";

export const metadata: Metadata = { title: "ご注文ありがとうございます", robots: { index: false } };

// M05 注文完了。状態は Webhook で進むので、まだ反映されていなければ数秒ごとに読み直す
export default async function CompletePage(props: PageProps<"/orders/[orderNo]/complete">) {
  const { orderNo } = await props.params;
  const member = await requireMember(`/orders/${orderNo}/complete`);
  const order = await loadOrderByNo(orderNo);
  if (!order || order.member_id !== member.id) notFound();

  if (order.payment_status === "draft") {
    return (
      <div className="space-y-4">
        <meta httpEquiv="refresh" content="3" />
        <h1 className="text-2xl font-bold">お支払いを確認しています</h1>
        <p>このままお待ちください。数秒で画面が切り替わります。</p>
        <p className="text-sm text-muted-foreground">注文番号：{order.order_no}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ご注文ありがとうございます</h1>
      <div className="rounded-2xl bg-cap-soft p-5">
        <p className="text-sm">注文番号</p>
        <p className="font-mono text-2xl font-bold tracking-wider">{order.order_no}</p>
        <p className="mt-2 text-[0.95rem]">{order.event.school.name}　{order.event.name}</p>
      </div>
      {order.payment_status === "pending" ? (
        <PaymentInstructions
          method={order.payment_method}
          details={order.payment_details as PaymentDetails | null}
          dueAt={order.payment_due_at}
          amountDue={order.total - order.amount_received}
        />
      ) : order.payment_status === "paid" ? (
        <Notice tone="success" title="お支払いが完了しました">ご注文の内容をメールでもお送りしました。</Notice>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">ご注文の内容</h2>
        <OrderLines order={order} />
      </section>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="xl"><Link href={`/mypage/orders/${order.order_no}`}>注文の詳細を見る</Link></Button>
        <Button asChild size="xl" variant="outline"><Link href="/events">行事の一覧に戻る</Link></Button>
      </div>
    </div>
  );
}
