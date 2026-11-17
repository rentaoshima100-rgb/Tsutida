import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireMember } from "@/lib/server/auth";
import { createUserClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { memberItemStatus, type FulfillmentStatus, type PaymentStatus } from "@/lib/domain/status";
import { formatJstDate } from "@/lib/domain/time";

export const metadata: Metadata = { title: "注文履歴" };

// M06 注文履歴（RLS で自分の注文だけを読む）
export default async function MypagePage() {
  await requireMember("/mypage");
  const supabase = await createUserClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("order_no, created_at, total, payment_status, payment_due_at, event:events(name, school:schools(name)), items:order_items(fulfillment_status, canceled_at)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!orders || orders.length === 0) {
    return (
      <div className="space-y-3 rounded-xl bg-surface p-5">
        <p>まだご注文はありません。</p>
        <Link href="/events" className="font-bold text-brand underline underline-offset-4">販売中の行事を見る</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">注文履歴</h1>
      <ul className="space-y-3">
        {orders.map((o) => {
          const statuses = [
            ...new Set(
              o.items.map(
                (i) =>
                  memberItemStatus({
                    paymentStatus: o.payment_status as PaymentStatus,
                    fulfillmentStatus: i.fulfillment_status as FulfillmentStatus | null,
                    canceledAt: i.canceled_at,
                    paymentDueAt: o.payment_due_at,
                  }).label,
              ),
            ),
          ];
          return (
            <li key={o.order_no}>
              <Link href={`/mypage/orders/${o.order_no}`} className="flex items-center gap-3 rounded-xl border border-border p-4 hover:border-brand">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">{formatJstDate(o.created_at)}　注文番号 {o.order_no}</p>
                  <p className="font-bold">{o.event?.school?.name}　{o.event?.name}</p>
                  <p className="text-[0.95rem]">{formatYen(o.total)}　{statuses.join("・")}</p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
