import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { FulfillmentBadge, PageHeader, Panel, PaymentBadge, inputClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Textarea } from "@/components/ui/textarea";
import { requireStaff } from "@/lib/server/auth";
import { loadOrderByNo } from "@/lib/server/orders/load";
import type { PaymentDetails } from "@/lib/server/payments/types";
import { createAdminClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { DELIVERY_METHOD_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstCompact } from "@/lib/domain/time";
import { cancelItems, clearAttention, confirmCash, markRefundManual, recordExchange, retryRefundAction, saveMemo } from "./actions";

export const metadata: Metadata = { title: "注文の詳細" };

const REFUND_STATUS = { pending: "処理中", succeeded: "返金済み", failed: "失敗" } as const;
const MAIL_STATUS: Record<string, string> = { queued: "送信待ち", sent: "送信済み", delivered: "届いた", bounced: "届かなかった", complained: "迷惑メール報告", failed: "送れなかった" };

// A08 注文の詳細：明細ごとの取り消し・返金、交換対応の記録、メモ、現金の入金確認
export default async function AdminOrderPage(props: PageProps<"/admin/orders/[orderNo]">) {
  await requireStaff();
  const { orderNo } = await props.params;
  const order = await loadOrderByNo(orderNo);
  if (!order) notFound();
  const { data: mails } = await createAdminClient()
    .from("email_messages")
    .select("id, template_key, subject, status, queued_at, sent_at, error")
    .eq("order_id", order.id)
    .order("queued_at");
  const details = order.payment_details as PaymentDetails | null;
  const active = order.items.filter((i) => !i.canceled_at);
  const cancellable = active.filter((i) => ["accepted", "in_production", "provided"].includes(i.fulfillment_status ?? ""));
  const isPaid = order.payment_status === "paid" || order.payment_status === "partially_refunded";
  const stripeBase = "https://dashboard.stripe.com";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`注文 ${order.order_no}`}
        description={<>{order.event.school.name}　<Link href={`/admin/events/${order.event_id}`} className="underline">{order.event.name}</Link>　{formatJstCompact(order.created_at)}{order.channel === "proxy" ? "（代理注文）" : ""}</>}
        actions={<PaymentBadge status={order.payment_status} />}
      />
      {order.needs_attention ? (
        <Notice tone="warning" title="要対応">
          <p>{order.needs_attention}</p>
          <ActionForm action={clearAttention.bind(null, order.order_no)} className="mt-2">
            <SubmitButton size="sm" variant="outline">対応済みにする</SubmitButton>
          </ActionForm>
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="注文者とお届け">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">注文者</dt>
            <dd>
              {order.member ? (
                <Link href={`/admin/members/${order.member.id}`} className="font-bold text-brand underline">{order.member.full_name}</Link>
              ) : (
                <span className="font-bold">{order.buyer_name}（{order.buyer_kana}）</span>
              )}
              <span className="block text-muted-foreground">{order.member?.email ?? order.buyer_email ?? "メールなし"}　{order.member?.phone ?? order.buyer_phone ?? ""}</span>
            </dd>
            <dt className="text-muted-foreground">受け取り</dt>
            <dd>{DELIVERY_METHOD_LABEL[order.delivery_method as "school" | "mail"]}{order.is_late ? "（締切後の注文）" : ""}</dd>
            {order.delivery_method === "mail" ? (
              <>
                <dt className="text-muted-foreground">お届け先</dt>
                <dd>{order.ship_name} 様<br />〒{order.ship_postal_code} {order.ship_address}<br />{order.ship_phone}</dd>
              </>
            ) : null}
          </dl>
        </Panel>
        <Panel title="支払い">
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">方法</dt>
            <dd>{PAYMENT_METHOD_LABEL[order.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}</dd>
            <dt className="text-muted-foreground">合計</dt>
            <dd className="font-bold">{formatYen(order.total)}{order.paid_amount !== null && order.paid_amount !== order.total ? `（支払われた額 ${formatYen(order.paid_amount)}）` : ""}</dd>
            {order.payment_due_at ? (<><dt className="text-muted-foreground">支払い期限</dt><dd>{formatJstCompact(order.payment_due_at)}</dd></>) : null}
            {order.paid_at ? (<><dt className="text-muted-foreground">支払い日時</dt><dd>{formatJstCompact(order.paid_at)}</dd></>) : null}
            {order.payment_method === "bank_transfer" && order.payment_status === "pending" ? (<><dt className="text-muted-foreground">入金済み</dt><dd>{formatYen(order.amount_received)}（残り {formatYen(order.total - order.amount_received)}）</dd></>) : null}
            {details?.kind === "konbini" && details.hostedVoucherUrl ? (<><dt className="text-muted-foreground">払込票</dt><dd><a href={details.hostedVoucherUrl} target="_blank" rel="noopener" className="text-brand underline">開く</a></dd></>) : null}
            {order.stripe_payment_intent_id ? (<><dt className="text-muted-foreground">Stripe</dt><dd><a href={`${stripeBase}/payments/${order.stripe_payment_intent_id}`} target="_blank" rel="noopener" className="font-mono text-xs text-brand underline">{order.stripe_payment_intent_id}</a></dd></>) : null}
            {order.canceled_at ? (<><dt className="text-muted-foreground">取り消し</dt><dd>{formatJstCompact(order.canceled_at)}　{order.cancel_reason}</dd></>) : null}
          </dl>
          {order.payment_method === "cash" && order.payment_status === "pending" ? (
            <ActionForm action={confirmCash.bind(null, order.order_no)} confirm={`現金 ${formatYen(order.total)} の入金を記録します。よろしいですか？`} className="mt-3">
              <SubmitButton>現金の入金を記録する</SubmitButton>
            </ActionForm>
          ) : null}
          {order.channel === "proxy" && order.payment_status === "pending" ? (
            <Link href={`/admin/orders/${order.order_no}/slip`} className="mt-3 inline-block text-sm font-bold text-brand underline">
              {order.payment_method === "cash" ? "注文の控えを印刷する" : "払込票・振込先を印刷する"}
            </Link>
          ) : null}
        </Panel>
      </div>

      <Panel title="明細">
        <ActionForm action={cancelItems.bind(null, order.order_no)} confirm="選んだ明細を取り消して、差額を返金します。よろしいですか？" className="space-y-3">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="w-8"></th><th className="py-1.5">お子さま</th><th>学年・クラス（注文時）</th><th>商品</th><th className="text-right">枚数</th><th className="text-right">金額</th><th className="pl-3">お届け</th></tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-t align-top">
                  <td className="py-2">{cancellable.some((c) => c.id === i.id) && isPaid ? <input type="checkbox" name="item" value={i.id} className="size-4" aria-label={`${i.child.full_name}の${i.product_name_snapshot}を取り消す`} /> : null}</td>
                  <td className="py-2">{i.child.full_name}<span className="block text-xs text-muted-foreground">{i.child.full_name_kana}</span></td>
                  <td>{i.grade_label_snapshot} {i.class_name_snapshot}</td>
                  <td>{i.product_name_snapshot}{i.exchange_note ? <span className="block text-xs text-warn">交換：{i.exchange_note}{i.exchange_shipped_at ? `（${formatJstCompact(i.exchange_shipped_at)} 発送）` : ""}</span> : null}</td>
                  <td className="text-right">{i.quantity}</td>
                  <td className="text-right">{i.canceled_at ? <span className="text-muted-foreground line-through">{formatYen(i.canceled_amount ?? 0)}</span> : formatYen(i.amount)}</td>
                  <td className="pl-3"><FulfillmentBadge status={i.canceled_at && !i.fulfillment_status ? "canceled" : i.fulfillment_status} /></td>
                </tr>
              ))}
              <tr className="border-t"><td colSpan={5} className="py-2 text-right">送料</td><td className="text-right">{formatYen(order.shipping_fee)}</td><td /></tr>
              <tr className="border-t font-bold"><td colSpan={5} className="py-2 text-right">合計</td><td className="text-right">{formatYen(order.total)}</td><td /></tr>
            </tbody>
          </table>
          {(isPaid && cancellable.length > 0) || order.payment_status === "pending" ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-surface p-3">
              <label className="flex-1 space-y-1 text-sm"><span className="block text-xs text-muted-foreground">取り消しの理由（記録に残ります）</span><input name="reason" className={`${inputClass} w-full`} placeholder="例：お客様からの電話" /></label>
              {order.payment_status === "pending" ? (
                <><input type="hidden" name="all" value="1" /><SubmitButton variant="destructive">注文ごと取り消す</SubmitButton></>
              ) : (
                <SubmitButton variant="destructive">選んだ明細を取り消して返金する</SubmitButton>
              )}
            </div>
          ) : null}
        </ActionForm>
      </Panel>

      {order.refunds.length > 0 ? (
        <Panel title="返金">
          <table className="w-full text-sm">
            <tbody>
              {order.refunds.map((r) => (
                <tr key={r.id} className="border-t first:border-t-0">
                  <td className="py-2">{formatJstCompact(r.created_at)}</td>
                  <td>{formatYen(r.amount)}</td>
                  <td>{r.method === "manual" ? "Stripe 以外" : "Stripe"}</td>
                  <td>{REFUND_STATUS[r.status as keyof typeof REFUND_STATUS]}{r.failure_reason ? `（${r.failure_reason}）` : ""}</td>
                  <td>{r.reason}</td>
                  <td className="text-right">
                    {r.method === "stripe" && !r.stripe_refund_id ? (
                      <ActionForm action={retryRefundAction.bind(null, order.order_no, r.id)}><SubmitButton size="sm" variant="outline">返金をやり直す</SubmitButton></ActionForm>
                    ) : null}
                    {r.status === "failed" ? (
                      <ActionForm action={markRefundManual.bind(null, order.order_no, r.id)} confirm="Stripe 以外の方法（現金・振込）で返金したことを記録します"><SubmitButton size="sm" variant="outline">別の方法で返金した</SubmitButton></ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="交換対応の記録">
          <ActionForm action={recordExchange.bind(null, order.order_no)} className="space-y-2 text-sm">
            <select name="itemId" className={`${inputClass} w-full`} defaultValue="">
              <option value="" disabled>明細を選ぶ</option>
              {active.map((i) => <option key={i.id} value={i.id}>{i.child.full_name}　{i.product_name_snapshot}</option>)}
            </select>
            <input name="note" placeholder="内容（例：再生できないため交換）" className={`${inputClass} w-full`} />
            <div className="flex gap-2">
              <label className="flex-1 space-y-1"><span className="block text-xs text-muted-foreground">交換品の発送日</span><input type="date" name="shippedOn" className={`${inputClass} w-full`} /></label>
              <label className="flex-1 space-y-1"><span className="block text-xs text-muted-foreground">追跡番号</span><input name="trackingNo" className={`${inputClass} w-full`} /></label>
            </div>
            <SubmitButton variant="outline">記録する</SubmitButton>
          </ActionForm>
        </Panel>
        <Panel title="メモ">
          <ActionForm action={saveMemo.bind(null, order.order_no)} className="space-y-2">
            <Textarea name="memo" rows={4} defaultValue={order.memo ?? ""} />
            <SubmitButton variant="outline">保存する</SubmitButton>
          </ActionForm>
        </Panel>
      </div>

      <Panel title="送ったメール">
        {(mails ?? []).length === 0 ? <p className="text-sm text-muted-foreground">まだありません。</p> : (
          <ul className="space-y-1 text-sm">
            {mails!.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-x-3">
                <span className="text-muted-foreground">{formatJstCompact(m.queued_at)}</span>
                <span>{m.subject}</span>
                <span className="font-bold">{MAIL_STATUS[m.status] ?? m.status}</span>
                {m.error ? <span className="text-danger">{m.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
