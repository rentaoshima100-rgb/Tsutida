import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { calcOrder } from "@/lib/domain/pricing";
import { canMemberCancel } from "@/lib/domain/deadlines";
import { formatYen } from "@/lib/domain/pricing";
import { getGateway } from "@/lib/server/payments";
import { writeAudit } from "@/lib/server/audit";
import { activeItems, loadOrderById, type FullOrder, type FullOrderItem } from "./load";
import { itemLine, refundNote, sendOrderMail } from "./mail";

// キャンセルと差額の返金（9.5）・行事と商品の中止（9.6）

export type CancelResult = { ok: true; refundAmount: number } | { ok: false; error: string };

type Actor = { id: string | null; type: "member" | "staff" | "system" };

/** 取り消したあとの内容で計算し直す（注文時点の価格で計算する） */
export function recalcAfterCancel(order: FullOrder, cancelIds: Set<string>) {
  const remaining = activeItems(order).filter((i) => !cancelIds.has(i.id));
  const products = new Map(
    order.items.map((i) => [
      i.id,
      {
        id: i.id,
        kind: i.product.kind as "disc" | "data",
        price: i.price_snapshot,
        secondPrice: i.second_price_snapshot,
        latePrice: i.late_price_snapshot,
      },
    ]),
  );
  // 2枚目以降の価格は「同じ商品」で数えるので、明細の商品ごとに価格をまとめて渡す
  const byProduct = new Map<string, string>();
  for (const i of order.items) if (!byProduct.has(i.product_id)) byProduct.set(i.product_id, i.id);
  const pricing = calcOrder({
    lines: remaining.map((i) => ({ lineNo: i.line_no, productId: byProduct.get(i.product_id)!, quantity: i.quantity })),
    products,
    isLate: order.is_late,
    deliveryMethod: order.delivery_method as "school" | "mail",
    // 送料は注文のときの額（郵送でディスクが残れば同じ額、なければ0円）
    shippingFee: order.shipping_fee > 0 ? order.shipping_fee : 0,
  });
  return {
    remaining,
    lines: remaining.map((i) => ({ id: i.id, amount: pricing.lines.find((l) => l.lineNo === i.line_no)!.amount })),
    subtotal: pricing.subtotal,
    shippingFee: pricing.shippingFee,
    total: pricing.total,
  };
}

/**
 * 支払い済みの注文の明細を取り消して、差額を返金する（会員・管理者・中止の共通の処理）
 */
async function cancelPaidItems(params: {
  order: FullOrder;
  items: FullOrderItem[];
  reason: string;
  actor: Actor;
  mailTemplate: "order_canceled" | "event_canceled";
}): Promise<CancelResult> {
  const { order, items, reason, actor } = params;
  const admin = createAdminClient();
  const ids = new Set(items.map((i) => i.id));
  const re = recalcAfterCancel(order, ids);
  const method = order.payment_method === "cash" || !order.stripe_payment_intent_id ? "manual" : "stripe";

  const { data: refundId, error } = await admin.rpc("apply_paid_cancellation", {
    p_order_id: order.id,
    p_item_ids: [...ids],
    p_lines: re.lines,
    p_subtotal: re.subtotal,
    p_shipping_fee: re.shippingFee,
    p_expected_total: order.total,
    p_reason: reason,
    p_method: method,
    p_actor: actor.id as string,
  });
  if (error) {
    if (error.code === "40001") return { ok: false, error: "ほかの操作と重なりました。画面を読み込み直してください" };
    return { ok: false, error: "この明細は取り消せません" };
  }
  const refundAmount = order.total - re.total;

  if (method === "stripe") {
    try {
      const refund = await getGateway().createRefund({
        paymentIntentId: order.stripe_payment_intent_id!,
        amount: refundAmount,
        refundId: refundId as string,
        orderId: order.id,
      });
      await admin.from("refunds").update({ stripe_refund_id: refund.id, status: refund.status }).eq("id", refundId as string);
    } catch (e) {
      // 取り消しは済んでいる。返金だけ、管理画面からやり直す
      console.error("[refund] failed", e instanceof Error ? e.message : e);
      await admin
        .from("orders")
        .update({ needs_attention: "返金の処理に失敗しました。注文の詳細から返金をやり直してください" })
        .eq("id", order.id);
    }
  }

  await writeAudit({
    actorId: actor.id,
    actorType: actor.type,
    action: "order.cancel_items",
    targetType: "order",
    targetId: order.order_no,
    detail: {
      reason,
      items: items.map((i) => ({ id: i.id, line_no: i.line_no, amount: i.amount })),
      before_total: order.total,
      after_total: re.total,
      refund: refundAmount,
      method,
    },
  });

  const updated = await loadOrderById(order.id);
  if (updated) {
    await sendOrderMail(params.mailTemplate, updated, {
      dedupeKey: `${params.mailTemplate}:${order.id}:${refundId}`,
      vars: {
        canceled_lines: items.map((i) => itemLine(i)).join("\n"),
        refund_amount: formatYen(refundAmount),
        refund_note: refundNote(order.payment_method),
      },
    });
  }
  return { ok: true, refundAmount };
}

/** 支払い待ちの注文を注文ごと取り消す（払込票の金額を変えられないため。9.5） */
async function cancelPendingOrder(params: {
  order: FullOrder;
  reason: string;
  actor: Actor;
  mailTemplate: "order_canceled" | "event_canceled";
}): Promise<CancelResult> {
  const { order, reason, actor } = params;
  if (order.stripe_payment_intent_id) {
    try {
      await getGateway().cancelPaymentIntent(order.stripe_payment_intent_id);
    } catch (e) {
      console.error("[cancel] payment intent", e instanceof Error ? e.message : e);
      return { ok: false, error: "お支払いの取り消しに失敗しました。時間をおいて、もう一度お試しください" };
    }
  }
  const { data: moved, error } = await createAdminClient().rpc("cancel_unpaid_order", {
    p_order_id: order.id,
    p_reason: reason,
  });
  if (error) throw error;
  if (!moved) return { ok: false, error: "このご注文は取り消せません" };
  await writeAudit({
    actorId: actor.id,
    actorType: actor.type,
    action: "order.cancel",
    targetType: "order",
    targetId: order.order_no,
    detail: { reason, payment_status: "pending" },
  });
  await sendOrderMail(params.mailTemplate, order, {
    dedupeKey: `${params.mailTemplate}:${order.id}:pending`,
    vars: {
      canceled_lines: activeItems(order).map((i) => itemLine(i)).join("\n"),
      refund_amount: formatYen(0),
      refund_note: "お支払い前のため、返金はありません。払込票・振込先は使えなくなります。",
    },
  });
  return { ok: true, refundAmount: 0 };
}

/** 会員の取り消し（M07）。締切まで（締切後の注文は受付期限まで） */
export async function memberCancel(memberId: string, orderId: string, itemIds: string[] | "all"): Promise<CancelResult> {
  const order = await loadOrderById(orderId);
  if (!order || order.member_id !== memberId) return { ok: false, error: "注文が見つかりません" };
  if (!canMemberCancel(order.event, order.is_late)) {
    return { ok: false, error: "締切を過ぎたため、取り消せません（受注生産のため）" };
  }
  const actor: Actor = { id: memberId, type: "member" };
  if (order.payment_status === "pending") {
    return cancelPendingOrder({ order, reason: "会員の取り消し", actor, mailTemplate: "order_canceled" });
  }
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { ok: false, error: "このご注文は取り消せません" };
  }
  const targets =
    itemIds === "all" ? activeItems(order) : activeItems(order).filter((i) => itemIds.includes(i.id));
  if (targets.length === 0 || targets.some((i) => i.fulfillment_status !== "accepted")) {
    return { ok: false, error: "取り消せる明細を選んでください" };
  }
  return cancelPaidItems({ order, items: targets, reason: "会員の取り消し", actor, mailTemplate: "order_canceled" });
}

/** 管理者の取り消し（A08）。いつでも。支払い待ちは注文ごと */
export async function staffCancel(staffId: string, orderId: string, itemIds: string[] | "all", reason: string): Promise<CancelResult> {
  const order = await loadOrderById(orderId);
  if (!order) return { ok: false, error: "注文が見つかりません" };
  const actor: Actor = { id: staffId, type: "staff" };
  if (order.payment_status === "pending") {
    return cancelPendingOrder({ order, reason, actor, mailTemplate: "order_canceled" });
  }
  if (order.payment_status !== "paid" && order.payment_status !== "partially_refunded") {
    return { ok: false, error: "この注文は取り消せません" };
  }
  const targets = itemIds === "all" ? activeItems(order) : activeItems(order).filter((i) => itemIds.includes(i.id));
  const cancellable = targets.filter((i) => ["accepted", "in_production", "provided"].includes(i.fulfillment_status ?? ""));
  if (cancellable.length === 0 || cancellable.length !== targets.length) {
    return { ok: false, error: "納品・発送が済んだ明細は取り消せません（交換は「交換対応」で記録してください）" };
  }
  return cancelPaidItems({ order, items: cancellable, reason, actor, mailTemplate: "order_canceled" });
}

/** 失敗した返金をやり直す（A08） */
export async function retryRefund(staffId: string, refundRowId: string) {
  const admin = createAdminClient();
  const { data: refund } = await admin.from("refunds").select("*").eq("id", refundRowId).maybeSingle();
  if (!refund || refund.method !== "stripe" || refund.stripe_refund_id) return { ok: false as const, error: "やり直せる返金ではありません" };
  const order = await loadOrderById(refund.order_id);
  if (!order?.stripe_payment_intent_id) return { ok: false as const, error: "支払いの記録がありません" };
  const res = await getGateway().createRefund({
    paymentIntentId: order.stripe_payment_intent_id,
    amount: refund.amount,
    refundId: refund.id,
    orderId: order.id,
  });
  await admin.from("refunds").update({ stripe_refund_id: res.id, status: res.status }).eq("id", refund.id);
  await admin.from("orders").update({ needs_attention: null }).eq("id", order.id);
  await writeAudit({
    actorId: staffId,
    actorType: "staff",
    action: "order.refund_retry",
    targetType: "order",
    targetId: order.order_no,
    detail: { refund_id: refund.id, amount: refund.amount },
  });
  return { ok: true as const };
}

/**
 * 行事・商品の中止（9.6）：取り消し以外の明細をすべて取り消し、支払い済みは返金、
 * 支払い待ちは注文ごと取り消して、event_canceled を送る
 */
export async function cancelEventOrProduct(staffId: string, params: { eventId: string; productId?: string; reason: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  if (params.productId) {
    await admin
      .from("products")
      .update({ status: "canceled", canceled_at: now })
      .eq("id", params.productId)
      .eq("event_id", params.eventId);
  } else {
    await admin.from("events").update({ status: "canceled", canceled_at: now }).eq("id", params.eventId);
  }

  const { data: orders } = await admin
    .from("orders")
    .select("id, payment_status, stripe_checkout_session_id")
    .eq("event_id", params.eventId)
    .in("payment_status", ["draft", "pending", "paid", "partially_refunded"]);

  const actor: Actor = { id: staffId, type: "staff" };
  const results = { canceled: 0, refunded: 0, failed: [] as string[] };
  for (const o of orders ?? []) {
    if (o.payment_status === "draft") {
      if (o.stripe_checkout_session_id) await getGateway().expireCheckoutSession(o.stripe_checkout_session_id).catch(() => {});
      await admin.rpc("delete_draft_order", { p_order_id: o.id });
      continue;
    }
    const order = await loadOrderById(o.id);
    if (!order) continue;
    const affected = activeItems(order).filter((i) => !params.productId || i.product_id === params.productId);
    if (affected.length === 0) continue;
    const res =
      order.payment_status === "pending"
        ? await cancelPendingOrder({ order, reason: params.reason, actor, mailTemplate: "event_canceled" })
        : await cancelPaidItems({
            order,
            items: affected.filter((i) => ["accepted", "in_production", "provided"].includes(i.fulfillment_status ?? "")),
            reason: params.reason,
            actor,
            mailTemplate: "event_canceled",
          });
    if (res.ok) {
      results.canceled++;
      if (res.refundAmount > 0) results.refunded++;
    } else {
      results.failed.push(order.order_no);
    }
  }
  await writeAudit({
    actorId: staffId,
    actorType: "staff",
    action: params.productId ? "product.cancel" : "event.cancel",
    targetType: params.productId ? "product" : "event",
    targetId: params.productId ?? params.eventId,
    detail: { reason: params.reason, ...results },
  });
  return results;
}
