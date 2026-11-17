import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/site/notice";
import { requireMember } from "@/lib/server/auth";
import { prepareWebOrder } from "@/lib/server/orders/create";
import { formatYen } from "@/lib/domain/pricing";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstDateTime } from "@/lib/domain/time";
import { orderDeadline } from "@/lib/domain/deadlines";
import { readCart } from "../actions";
import { PlaceOrderForm } from "./place-order-form";

export const metadata: Metadata = { title: "ご注文内容の確認", robots: { index: false } };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 sm:grid-cols-[9rem_1fr]">
      <dt className="font-bold">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// M04 最終確認。数量・価格（送料込みの総額）・支払いの時期と方法・お届けの時期・申込みの期限・
// キャンセルと返品の条件をここに出す（特商法12条の6）
export default async function ConfirmPage(props: PageProps<"/events/[eventId]/order/confirm">) {
  const { eventId } = await props.params;
  const member = await requireMember(`/events/${eventId}/order/confirm`);
  const cart = await readCart(eventId);
  if (!cart) redirect(`/events/${eventId}/order`);
  const prepared = await prepareWebOrder(member, cart);
  if (!prepared.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">ご注文内容の確認</h1>
        <Notice tone="error">{prepared.error}</Notice>
        <Link href={`/events/${eventId}/order`} className="font-bold text-brand underline underline-offset-4">ご注文の内容を選び直す</Link>
      </div>
    );
  }
  const p = prepared.order;
  const e = p.ctx.event;
  const deadline = orderDeadline(e, p.ctx.isLate);
  const deliveryNote = p.ctx.isLate ? e.late_delivery_note : e.delivery_note;
  const isDeferred = p.cart.paymentMethod === "konbini" || p.cart.paymentMethod === "bank_transfer";
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold text-muted-foreground">{e.school.name}　{e.name}</p>
        <h1 className="text-2xl font-bold">ご注文内容の確認</h1>
      </div>
      <p>内容を確かめて、いちばん下の「注文を確定して支払う」を押してください。</p>

      <section aria-labelledby="lines" className="space-y-2">
        <h2 id="lines" className="text-lg font-bold">ご注文の内容</h2>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {p.lines.map((l) => (
            <li key={l.lineNo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span>
                <span className="block font-bold">{l.child.fullName}さん（{l.child.gradeLabel} {l.child.className}）</span>
                <span className="text-[0.95rem]">{l.product.name} × {l.quantity}枚</span>
                <span className="block text-sm text-muted-foreground">単価 {l.unitPrices.map(formatYen).join("・")}</span>
              </span>
              <span className="font-bold">{formatYen(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between px-4 py-3">
            <span>送料</span>
            <span>{formatYen(p.pricing.shippingFee)}</span>
          </li>
          <li className="flex justify-between bg-surface px-4 py-4 text-lg font-bold">
            <span>合計（税込）</span>
            <span>{formatYen(p.pricing.total)}</span>
          </li>
        </ul>
      </section>

      <dl>
        <Row label="受け取り方法">
          {p.cart.deliveryMethod === "school" ? (
            "学校・園でお受け取り"
          ) : (
            <>
              ご自宅へ郵送
              <span className="block text-muted-foreground">
                {p.cart.shipping?.name} 様　〒{p.cart.shipping?.postalCode} {p.cart.shipping?.address}　{p.cart.shipping?.phone}
              </span>
            </>
          )}
        </Row>
        <Row label="お支払い方法">{PAYMENT_METHOD_LABEL[p.cart.paymentMethod]}</Row>
        <Row label="お支払いの時期">
          {isDeferred && p.paymentDue
            ? `${formatJstDateTime(p.paymentDue.dueAt)}までにお支払いください。期限を過ぎると、ご注文は自動で取り消されます`
            : "ご注文の確定のときにお支払いいただきます"}
        </Row>
        <Row label="お届けの時期">{deliveryNote || "行事のページのお届け予定のとおり"}</Row>
        <Row label="申込みの期限">{formatJstDateTime(deadline)}</Row>
        <Row label="キャンセル・返品">
          {formatJstDateTime(deadline)}まで、マイページから取り消せます。受注生産のため、締切を過ぎると取り消せず、お客様のご都合による返品もお受けできません。
          <Link href="/legal/cancel" target="_blank" className="block font-bold text-brand underline underline-offset-4">キャンセル・交換について</Link>
        </Row>
      </dl>

      {isDeferred ? (
        <Notice tone="info">
          次の画面で、{p.cart.paymentMethod === "konbini" ? "コンビニの払込票" : "振込先"}が表示されます。同じ内容をメールでもお送りします。
        </Notice>
      ) : null}

      <PlaceOrderForm eventId={eventId} />
      <p className="text-center">
        <Link href={`/events/${eventId}/order`} className="font-bold text-brand underline underline-offset-4">内容を変える</Link>
      </p>
    </div>
  );
}
