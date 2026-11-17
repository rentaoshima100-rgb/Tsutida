import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/server/auth";
import { loadOrderContext } from "@/lib/server/orders/context";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { readCart } from "./actions";
import { OrderForm, type OrderFormProps } from "./order-form";

export const metadata: Metadata = { title: "注文手続き", robots: { index: false } };

const NOTES = {
  card: "ご注文のときにお支払いが完了します（Apple Pay・Google Pay も使えます）",
  paypay: "PayPayアプリで承認すると、お支払いが完了します",
  konbini: "ファミリーマート・ローソン・ミニストップ・セイコーマートで、期限までに現金でお支払いください（セブン-イレブンでは払えません）",
  bank_transfer: "ご注文ごとにお知らせする振込先へ、期限までにお振り込みください（振込手数料はお客様のご負担です）",
} as const;

// M03 注文手続き
export default async function OrderPage(props: PageProps<"/events/[eventId]/order">) {
  const { eventId } = await props.params;
  const member = await requireMember(`/events/${eventId}/order`);
  const ctx = await loadOrderContext(member.id, eventId);
  if (!ctx) notFound();
  if (!ctx.canOrder) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">注文手続き</h1>
        <p>この行事の受付は終わっています。</p>
        <Link href={`/events/${eventId}`} className="font-bold text-brand underline underline-offset-4">行事のページに戻る</Link>
      </div>
    );
  }
  const saved = await readCart(eventId);
  const quantities: Record<string, number> = {};
  for (const l of saved?.lines ?? []) quantities[`${l.productId}:${l.childId}`] = l.quantity;
  const form: OrderFormProps = {
    eventId,
    isLate: ctx.isLate,
    children: ctx.children.map((c) => ({ childId: c.childId, label: `${c.fullName}さん（${c.gradeLabel} ${c.className}）`, productIds: c.productIds })),
    products: ctx.products
      .filter((p) => p.status === "on_sale")
      .map((p) => ({ id: p.id, name: p.name, kind: p.kind as "disc" | "data", price: p.price, secondPrice: p.second_price, latePrice: p.late_price })),
    deliveryOptions: ctx.deliveryOptions,
    shippingFee: ctx.shippingFee,
    paymentMethods: ctx.paymentMethods.map((m) => ({
      method: m,
      label: PAYMENT_METHOD_LABEL[m],
      note: NOTES[m],
      disabledReason:
        m === "bank_transfer" && ctx.hasPendingBankTransfer
          ? "お支払い待ちの銀行振込のご注文があるため、いまは選べません"
          : null,
    })),
    initial: {
      quantities,
      deliveryMethod: saved && ctx.deliveryOptions.includes(saved.deliveryMethod) ? saved.deliveryMethod : ctx.deliveryOptions[0],
      shipping: saved?.shipping ?? {
        name: member.full_name,
        postalCode: member.postal_code ?? "",
        address: member.address ?? "",
        phone: member.phone ?? "",
      },
      paymentMethod: saved?.paymentMethod ?? ctx.paymentMethods.find((m) => !(m === "bank_transfer" && ctx.hasPendingBankTransfer)) ?? "",
    },
  };
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-muted-foreground">{ctx.event.school.name}　{ctx.event.name}</p>
        <h1 className="text-2xl font-bold">注文手続き</h1>
      </div>
      <OrderForm {...form} />
    </div>
  );
}
