import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { alertStaff } from "@/lib/server/alerts";
import { loadOrderById } from "@/lib/server/orders/load";
import { sendOrderMail } from "@/lib/server/orders/mail";
import { writeAudit } from "@/lib/server/audit";
import type { Json } from "@/lib/database.types";
import type { PaymentEvent } from "./types";

// 決済の通知を DB に反映する（10.2）。状態はどれも条件付きで進め、何回呼ばれても結果は同じ。
// 戻り先のページ（G13）では状態を変えない。

async function flagAttention(orderId: string, reason: string) {
  await createAdminClient().from("orders").update({ needs_attention: reason }).eq("id", orderId);
}

export async function processPaymentEvent(ev: PaymentEvent): Promise<string> {
  const admin = createAdminClient();

  switch (ev.type) {
    case "ignored":
      return `ignored: ${ev.reason}`;

    case "checkout.paid": {
      const { data: moved, error } = await admin.rpc("mark_order_paid", {
        p_order_id: ev.orderId,
        p_from: ["draft", "pending"],
        p_payment_intent_id: ev.paymentIntentId ?? undefined,
      });
      if (error) throw error;
      const order = await loadOrderById(ev.orderId);
      if (!order) {
        await alertStaff({
          to: "both",
          title: "注文が見つからない支払いがありました",
          body: `Checkout ${ev.sessionId} の支払いが完了しましたが、注文（${ev.orderId}）が見つかりません。Stripe の管理画面で確認してください。`,
          key: `orphan:${ev.sessionId}`,
        });
        return "order not found";
      }
      if (moved) {
        await sendOrderMail("order_completed", order, { dedupeKey: `order_completed:${order.id}` });
        return "paid";
      }
      if (order.payment_status === "canceled") {
        await flagAttention(order.id, "取り消したあとに支払いがありました。返金が必要か確認してください");
        await alertStaff({
          to: "both",
          title: `取り消した注文に支払いがありました（${order.order_no}）`,
          body: `注文番号 ${order.order_no} は取り消し済みですが、支払いの通知が届きました。管理画面の注文の詳細で確認してください。`,
          key: `paid_after_cancel:${order.id}`,
        });
      }
      return `no change (${order.payment_status})`;
    }

    case "checkout.awaiting_payment": {
      const { data: moved, error } = await admin.rpc("mark_order_pending", {
        p_order_id: ev.orderId,
        p_payment_intent_id: ev.paymentIntentId ?? "",
        p_details: (ev.details ?? null) as Json,
      });
      if (error) throw error;
      if (!moved) return "no change";
      const order = await loadOrderById(ev.orderId);
      if (order) await sendOrderMail("payment_instructions", order, { dedupeKey: `payment_instructions:${order.id}` });
      return "pending";
    }

    case "checkout.expired": {
      const { error } = await admin.rpc("delete_draft_order", { p_order_id: ev.orderId });
      if (error) throw error;
      return "draft deleted";
    }

    case "payment.succeeded": {
      const { data: moved, error } = await admin.rpc("mark_order_paid", {
        p_order_id: ev.orderId,
        p_from: ["pending", "draft"],
        p_payment_intent_id: ev.paymentIntentId ?? undefined,
      });
      if (error) throw error;
      const order = await loadOrderById(ev.orderId);
      if (!order) return "order not found";
      if (moved) {
        await sendOrderMail("payment_received", order, { dedupeKey: `payment_received:${order.id}` });
        return "paid";
      }
      if (order.payment_status === "canceled") {
        // 取り消したあとの入金は、状態を自動で戻さず「要対応」にする（10.2）
        await flagAttention(order.id, "取り消したあとに入金がありました。返金するか、注文を受け付けるかを決めてください");
        await alertStaff({
          to: "both",
          title: `取り消した注文に入金がありました（${order.order_no}）`,
          body: `注文番号 ${order.order_no} は取り消し済みですが、入金の通知が届きました。管理画面の注文の詳細で対応してください。`,
          key: `paid_after_cancel:${order.id}`,
        });
      }
      return `no change (${order.payment_status})`;
    }

    case "payment.failed": {
      const { data: moved, error } = await admin.rpc("cancel_unpaid_order", {
        p_order_id: ev.orderId,
        p_reason: "支払期限切れ",
      });
      if (error) throw error;
      if (!moved) return "no change";
      const order = await loadOrderById(ev.orderId);
      if (order) {
        await sendOrderMail("order_auto_canceled", order, { dedupeKey: `order_auto_canceled:${order.id}` });
        await writeAudit({
          actorId: null,
          actorType: "system",
          action: "order.cancel",
          targetType: "order",
          targetId: order.order_no,
          detail: { reason: "支払期限切れ（決済代行からの通知）" },
        });
      }
      return "canceled";
    }

    case "payment.partially_funded": {
      const { error } = await admin
        .from("orders")
        .update({ amount_received: ev.amountReceived })
        .eq("id", ev.orderId)
        .eq("payment_status", "pending");
      if (error) throw error;
      return "partially funded";
    }

    case "refund.updated": {
      let query = admin.from("refunds").update({
        status: ev.status,
        failure_reason: ev.failureReason,
        stripe_refund_id: ev.stripeRefundId,
      });
      query = ev.refundId ? query.eq("id", ev.refundId) : query.eq("stripe_refund_id", ev.stripeRefundId);
      const { data, error } = await query.select("order_id").maybeSingle();
      if (error) throw error;
      if (data && ev.status === "failed") {
        await flagAttention(data.order_id, "返金に失敗しました。Stripe 以外の方法で返金してください");
        const order = await loadOrderById(data.order_id);
        await alertStaff({
          to: "both",
          title: `返金に失敗しました（${order?.order_no ?? data.order_id}）`,
          body: `返金に失敗しました（理由：${ev.failureReason ?? "不明"}）。お客様に連絡し、別の方法で返金してください。`,
          key: `refund_failed:${ev.stripeRefundId}`,
        });
      }
      return `refund ${ev.status}`;
    }

    case "dispute.created": {
      if (ev.paymentIntentId) {
        const { data } = await admin
          .from("orders")
          .select("id, order_no")
          .eq("stripe_payment_intent_id", ev.paymentIntentId)
          .maybeSingle();
        if (data) await flagAttention(data.id, "カードの支払いに異議の申し立て（チャージバック）がありました");
        await alertStaff({
          to: "both",
          title: `チャージバックの申し立てがありました${data ? `（${data.order_no}）` : ""}`,
          body: `カードの持ち主から支払いへの異議の申し立てがありました（理由：${ev.reason}）。Stripe の管理画面で期限までに対応してください。`,
          key: `dispute:${ev.paymentIntentId}`,
        });
      }
      return "dispute";
    }
  }
}
