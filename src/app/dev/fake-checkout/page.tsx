import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { formatYen } from "@/lib/domain/pricing";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/domain/status";
import { createAdminClient } from "@/lib/supabase/server";
import { fakeAbandon, fakeExpire, fakeIssueVoucher, fakePay, fakeReceive } from "./actions";

export const dynamic = "force-dynamic";

// 開発用の擬似決済の画面（Stripe Checkout の代わり）。本番では出ない
export default async function FakeCheckoutPage(props: PageProps<"/dev/fake-checkout">) {
  if (env().PAYMENT_GATEWAY !== "fake") notFound();
  const sp = await props.searchParams;
  const sessionId = String(sp.session ?? "");
  const orderId = sessionId.replace(/^fake_cs_/, "");
  if (!/^[0-9a-f-]{36}$/.test(orderId)) notFound();
  const { data: order } = await createAdminClient()
    .from("orders")
    .select("order_no, total, payment_method, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) notFound();
  const success = String(sp.success ?? "/events");
  const cancel = String(sp.cancel ?? "/events");
  const deferred = order.payment_method === "konbini" || order.payment_method === "bank_transfer";

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm font-bold">開発用の擬似決済です（Stripe の代わり）</p>
      <h1 className="text-2xl font-bold">お支払い</h1>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
        <dt className="font-bold">注文番号</dt>
        <dd>{order.order_no}</dd>
        <dt className="font-bold">金額</dt>
        <dd>{formatYen(order.total)}</dd>
        <dt className="font-bold">支払い方法</dt>
        <dd>{PAYMENT_METHOD_LABEL[order.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}</dd>
        <dt className="font-bold">状態</dt>
        <dd>{PAYMENT_STATUS_LABEL[order.payment_status as keyof typeof PAYMENT_STATUS_LABEL]}</dd>
      </dl>
      {order.payment_status === "draft" ? (
        <div className="flex flex-col gap-3">
          {deferred ? (
            <form action={fakeIssueVoucher.bind(null, orderId, sessionId, success)}>
              <Button size="xl" className="w-full">{order.payment_method === "konbini" ? "払込票を発行する" : "振込先を発行する"}</Button>
            </form>
          ) : (
            <form action={fakePay.bind(null, orderId, sessionId, success)}>
              <Button size="xl" className="w-full">支払う</Button>
            </form>
          )}
          <a href={cancel} className="text-center font-bold text-brand underline">戻る（決済をやめる）</a>
          <form action={fakeAbandon.bind(null, orderId, sessionId)}>
            <Button variant="outline" size="xl" className="w-full">決済画面の期限切れを起こす</Button>
          </form>
        </div>
      ) : order.payment_status === "pending" ? (
        <div className="flex flex-col gap-3">
          <form action={fakeReceive.bind(null, orderId)}>
            <Button size="xl" className="w-full">入金があったことにする</Button>
          </form>
          <form action={fakeExpire.bind(null, orderId)}>
            <Button variant="outline" size="xl" className="w-full">支払期限切れ（失効）を起こす</Button>
          </form>
        </div>
      ) : (
        <p>この注文の擬似決済は終わっています。</p>
      )}
    </main>
  );
}
