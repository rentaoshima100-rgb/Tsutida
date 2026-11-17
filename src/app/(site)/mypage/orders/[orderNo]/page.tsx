import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderLines } from "@/components/orders/order-lines";
import { PaymentInstructions } from "@/components/orders/payment-instructions";
import { Notice } from "@/components/site/notice";
import { requireMember } from "@/lib/server/auth";
import { loadMemberOrder } from "@/lib/server/orders/load";
import type { PaymentDetails } from "@/lib/server/payments/types";
import { canMemberCancel, orderDeadline } from "@/lib/domain/deadlines";
import { formatYen } from "@/lib/domain/pricing";
import { DELIVERY_METHOD_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstDateTime } from "@/lib/domain/time";
import { CancelForm } from "./cancel-form";

export const metadata: Metadata = { title: "注文の詳細", robots: { index: false } };

const REFUND_STATUS = { pending: "返金の手続き中", succeeded: "返金済み", failed: "返金できませんでした（ツチダ映像からご連絡します）" } as const;

// M07 注文の詳細：明細・状態・追跡番号、締切前のキャンセル、領収書
export default async function OrderDetailPage(props: PageProps<"/mypage/orders/[orderNo]">) {
  const { orderNo } = await props.params;
  const member = await requireMember(`/mypage/orders/${orderNo}`);
  const order = await loadMemberOrder(member.id, orderNo);
  if (!order) notFound();

  const cancellable = canMemberCancel(order.event, order.is_late);
  const deadline = orderDeadline(order.event, order.is_late);
  const cancelItems = order.items.filter((i) => !i.canceled_at && i.fulfillment_status === "accepted");
  const paidLike = order.payment_status === "paid" || order.payment_status === "partially_refunded";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">注文番号 {order.order_no}　{formatJstDateTime(order.created_at)}</p>
        <h1 className="text-xl font-bold">{order.event.school.name}　{order.event.name}</h1>
      </div>

      {order.payment_status === "pending" ? (
        <PaymentInstructions
          method={order.payment_method}
          details={order.payment_details as PaymentDetails | null}
          dueAt={order.payment_due_at}
          amountDue={order.total - order.amount_received}
        />
      ) : null}
      {order.payment_status === "canceled" ? (
        <Notice tone="warning" title="このご注文は取り消されています">{order.cancel_reason ?? ""}</Notice>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">ご注文の内容</h2>
        <OrderLines order={order} />
      </section>

      <dl className="grid gap-y-2 rounded-xl bg-surface p-4 sm:grid-cols-[8rem_1fr]">
        <dt className="font-bold">お支払い方法</dt>
        <dd>{PAYMENT_METHOD_LABEL[order.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}</dd>
        <dt className="font-bold">受け取り方法</dt>
        <dd>
          {DELIVERY_METHOD_LABEL[order.delivery_method as "school" | "mail"]}
          {order.delivery_method === "mail" ? (
            <span className="block text-muted-foreground">
              {order.ship_name} 様　〒{order.ship_postal_code} {order.ship_address}
            </span>
          ) : null}
        </dd>
        <dt className="font-bold">お届けの時期</dt>
        <dd>{(order.is_late ? order.event.late_delivery_note : order.event.delivery_note) || "行事のページのお届け予定のとおり"}</dd>
        {order.shipments.length > 0 ? (
          <>
            <dt className="font-bold">発送</dt>
            <dd>
              {order.shipments.map((s) => (
                <span key={s.id} className="block">
                  {formatJstDateTime(s.shipped_at)}　{s.carrier ?? ""}　追跡番号 {s.tracking_no ?? "—"}
                  {s.kind === "exchange" ? "（交換品）" : ""}
                </span>
              ))}
            </dd>
          </>
        ) : null}
      </dl>

      {order.refunds.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">返金</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {order.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                <span>{formatJstDateTime(r.created_at)}　{REFUND_STATUS[r.status as keyof typeof REFUND_STATUS]}</span>
                <span className="font-bold">{formatYen(r.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {cancellable && order.payment_status === "pending" ? (
        <CancelForm orderNo={order.order_no} mode="order" items={[]} deadlineLabel={formatJstDateTime(deadline)} />
      ) : null}
      {cancellable && paidLike && cancelItems.length > 0 ? (
        <CancelForm
          orderNo={order.order_no}
          mode="items"
          deadlineLabel={formatJstDateTime(deadline)}
          items={cancelItems.map((i) => ({
            id: i.id,
            label: `${i.child.full_name}さん　${i.product_name_snapshot} × ${i.quantity}枚`,
          }))}
        />
      ) : null}
      {!cancellable && (order.payment_status === "pending" || paidLike) ? (
        <p className="text-[0.95rem] text-muted-foreground">締切を過ぎたため、このご注文は取り消せません（受注生産のため）。</p>
      ) : null}

      {paidLike && order.total > 0 ? (
        <section className="space-y-2 rounded-2xl border border-border p-5">
          <h2 className="text-lg font-bold">領収書</h2>
          <form action={`/mypage/orders/${order.order_no}/receipt`} method="get" target="_blank" className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-1.5">
              <span className="font-bold">宛名</span>
              <input name="name" defaultValue={member.full_name} maxLength={40} className="h-12 w-full rounded-xl border border-input px-3.5 text-base" />
            </label>
            <button type="submit" className="h-12 rounded-xl bg-brand px-5 font-bold text-white hover:bg-brand-strong">領収書（PDF）を開く</button>
          </form>
        </section>
      ) : null}

      <p>
        <Link href="/mypage" className="font-bold text-brand underline underline-offset-4">注文履歴に戻る</Link>
      </p>
    </div>
  );
}
