import { Ban, CircleCheck, Hourglass, PackageCheck } from "lucide-react";
import { formatYen } from "@/lib/domain/pricing";
import { memberItemStatus, type FulfillmentStatus, type PaymentStatus } from "@/lib/domain/status";
import type { FullOrder } from "@/lib/server/orders/load";

const ICON = { waiting: Hourglass, progress: CircleCheck, done: PackageCheck, canceled: Ban } as const;

/** 明細と状態（色だけに頼らず、アイコンと文字で状態を出す） */
export function OrderLines({ order, showStatus = true }: { order: FullOrder; showStatus?: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {order.items.map((i) => {
        const status = memberItemStatus({
          paymentStatus: order.payment_status as PaymentStatus,
          fulfillmentStatus: i.fulfillment_status as FulfillmentStatus | null,
          canceledAt: i.canceled_at,
          paymentDueAt: order.payment_due_at,
        });
        const Icon = ICON[status.tone];
        return (
          <li key={i.id} className="space-y-1 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className={i.canceled_at ? "text-muted-foreground line-through" : "font-bold"}>
                {i.child.full_name}さん（{i.grade_label_snapshot} {i.class_name_snapshot}）
              </span>
              <span className={i.canceled_at ? "text-muted-foreground" : "font-bold"}>
                {formatYen(i.canceled_at ? (i.canceled_amount ?? 0) : i.amount)}
              </span>
            </div>
            <p className="text-[0.95rem]">{i.product_name_snapshot} × {i.quantity}枚</p>
            {showStatus ? (
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Icon className="size-4" aria-hidden />
                {status.label}
              </p>
            ) : null}
          </li>
        );
      })}
      <li className="flex justify-between px-4 py-3">
        <span>送料</span>
        <span>{formatYen(order.shipping_fee)}</span>
      </li>
      <li className="flex justify-between bg-surface px-4 py-3 text-lg font-bold">
        <span>合計（税込）</span>
        <span>{formatYen(order.total)}</span>
      </li>
    </ul>
  );
}
