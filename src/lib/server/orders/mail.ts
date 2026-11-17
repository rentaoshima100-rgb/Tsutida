import "server-only";
import { appUrl } from "@/lib/env";
import { formatYen } from "@/lib/domain/pricing";
import { DELIVERY_METHOD_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstDateTime } from "@/lib/domain/time";
import { enqueueMail, type MailVars } from "@/lib/server/mail/queue";
import type { PaymentDetails } from "@/lib/server/payments/types";
import { activeItems, buyerOf, type FullOrder, type FullOrderItem } from "./load";

// 注文のメール（11章）の差し込み

export function itemLine(i: FullOrderItem, amount = i.amount): string {
  return `・${i.child.full_name}さん（${i.grade_label_snapshot} ${i.class_name_snapshot}）${i.product_name_snapshot} × ${i.quantity}枚　${formatYen(amount)}`;
}

export function paymentInstructionsText(details: PaymentDetails | null, method: string): string {
  if (!details) {
    return method === "konbini"
      ? "払込票は、ご注文の画面のあとに表示されたページ（Stripe）でご確認ください。"
      : "振込先は、ご注文の画面のあとに表示されたページ（Stripe）でご確認ください。";
  }
  if (details.kind === "konbini") {
    const lines = ["お支払いいただけるコンビニ：ファミリーマート・ローソン・ミニストップ・セイコーマート（セブン-イレブンでは払えません）"];
    for (const s of details.stores) {
      lines.push(`・${s.store}　お支払い番号：${s.paymentCode}${s.confirmationNumber ? `　確認番号：${s.confirmationNumber}` : ""}`);
    }
    if (details.hostedVoucherUrl) lines.push(`払込票：${details.hostedVoucherUrl}`);
    return lines.join("\n");
  }
  const b = details.bank;
  const lines = ["次の口座へお振り込みください（振込手数料はお客様のご負担です）。"];
  if (b) {
    lines.push(
      `銀行：${b.bankName ?? ""}　支店：${b.branchName ?? ""}`,
      `口座：${b.accountType === "toza" ? "当座" : "普通"} ${b.accountNumber ?? ""}`,
      `名義：${b.accountHolderName ?? ""}`,
    );
  }
  if (details.hostedInstructionsUrl) lines.push(`振込先の案内：${details.hostedInstructionsUrl}`);
  lines.push("この振込先は、あなた専用です。ほかの方にお知らせしないでください。");
  return lines.join("\n");
}

export function refundNote(method: string): string {
  switch (method) {
    case "card":
      return "お支払いに使ったクレジットカードに返金します。カード会社によっては、明細に反映されるまでお時間がかかります。";
    case "paypay":
      return "お支払いに使ったPayPayに返金します。";
    case "konbini":
    case "bank_transfer":
      return "決済代行会社（Stripe）から、返金先の口座を入力していただくメールをお送りします。入力後にお振り込みします。";
    case "cash":
      return "ツチダ映像から直接ご返金します。";
    default:
      return "";
  }
}

/** 注文のメールの共通の差し込み */
export function orderVars(order: FullOrder): MailVars {
  const buyer = buyerOf(order);
  const items = activeItems(order);
  const deliveryNote = order.is_late ? order.event.late_delivery_note : order.event.delivery_note;
  const details = order.payment_details as PaymentDetails | null;
  return {
    buyer_name: buyer.name,
    order_no: order.order_no,
    school_name: order.event.school.name,
    event_name: order.event.name,
    order_lines: items.length > 0 ? items.map((i) => itemLine(i)).join("\n") : "（なし）",
    shipping_fee: formatYen(order.shipping_fee),
    total: formatYen(order.total),
    payment_method: PAYMENT_METHOD_LABEL[order.payment_method as keyof typeof PAYMENT_METHOD_LABEL],
    payment_due: order.payment_due_at ? formatJstDateTime(order.payment_due_at) : "",
    payment_instructions: paymentInstructionsText(details, order.payment_method),
    paid_at: order.paid_at ? formatJstDateTime(order.paid_at) : "",
    paid_amount: order.paid_amount !== null ? formatYen(order.paid_amount) : formatYen(order.total),
    amount_due: formatYen(Math.max(0, order.total - (order.amount_received ?? 0))),
    delivery: DELIVERY_METHOD_LABEL[order.delivery_method as "school" | "mail"],
    delivery_note: deliveryNote || "行事のページに記載のとおり",
    ship_name: order.ship_name ?? "",
    order_url: order.member_id ? appUrl(`/mypage/orders/${order.order_no}`) : appUrl("/"),
    event_url: appUrl(`/events/${order.event_id}`),
  };
}

/** 注文者にメールを送る（代理注文でメールのない注文者には送らない） */
export async function sendOrderMail(
  templateKey: string,
  order: FullOrder,
  opts: { dedupeKey: string; vars?: MailVars },
) {
  const buyer = buyerOf(order);
  if (!buyer.email) return null;
  return enqueueMail(templateKey, {
    to: buyer.email,
    memberId: order.member_id,
    orderId: order.id,
    eventId: order.event_id,
    dedupeKey: opts.dedupeKey,
    vars: { ...orderVars(order), ...(opts.vars ?? {}) },
  });
}
