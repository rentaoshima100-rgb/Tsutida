"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { retryRefund, staffCancel } from "@/lib/server/orders/cancel";
import { loadOrderByNo } from "@/lib/server/orders/load";
import { sendOrderMail } from "@/lib/server/orders/mail";
import { createAdminClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { str, type FormState } from "@/lib/form";

// A08 注文の詳細の操作。どれも監査ログに残す（14章）

function done(orderNo: string, message: string): FormState {
  revalidatePath(`/admin/orders/${orderNo}`);
  return { ok: true, message };
}

export async function cancelItems(orderNo: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const order = await loadOrderByNo(orderNo);
  if (!order) return { message: "注文が見つかりません" };
  const reason = str(fd, "reason");
  if (!reason) return { message: "取り消しの理由を入力してください" };
  const all = fd.get("all") === "1";
  const ids = fd.getAll("item").map(String);
  if (!all && ids.length === 0) return { message: "取り消す明細を選んでください" };
  const r = await staffCancel(staff.user_id, order.id, all ? "all" : ids, reason);
  if (!r.ok) return { message: r.error };
  return done(orderNo, r.refundAmount > 0 ? `取り消しました。${formatYen(r.refundAmount)}を返金します` : "取り消しました");
}

/** 現金の入金確認（代理注文。6.4） */
export async function confirmCash(orderNo: string): Promise<FormState> {
  const staff = await requireStaff();
  const order = await loadOrderByNo(orderNo);
  if (!order || order.payment_method !== "cash" || order.payment_status !== "pending") return { message: "この注文は現金の支払い待ちではありません" };
  const { data: moved, error } = await createAdminClient().rpc("mark_order_paid", { p_order_id: order.id, p_from: ["pending"] });
  if (error || !moved) return { message: "入金を記録できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "order.paid_cash", targetType: "order", targetId: orderNo, detail: { total: order.total } });
  const updated = await loadOrderByNo(orderNo);
  if (updated) await sendOrderMail("payment_received", updated, { dedupeKey: `payment_received:${order.id}` });
  return done(orderNo, "入金を記録しました");
}

export async function saveMemo(orderNo: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const memo = str(fd, "memo").slice(0, 2000);
  const { error } = await createAdminClient().from("orders").update({ memo: memo || null }).eq("order_no", orderNo);
  if (error) return { message: "保存できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "order.memo", targetType: "order", targetId: orderNo });
  return done(orderNo, "メモを保存しました");
}

export async function clearAttention(orderNo: string): Promise<FormState> {
  const staff = await requireStaff();
  const admin = createAdminClient();
  const { data } = await admin.from("orders").select("needs_attention").eq("order_no", orderNo).single();
  await admin.from("orders").update({ needs_attention: null }).eq("order_no", orderNo);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "order.attention_clear", targetType: "order", targetId: orderNo, detail: { was: data?.needs_attention } });
  return done(orderNo, "要対応を解除しました");
}

/** 交換対応の記録（状態は変えず、exchange_note・exchange_shipped_at と shipments に残す。8章） */
export async function recordExchange(orderNo: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const order = await loadOrderByNo(orderNo);
  if (!order) return { message: "注文が見つかりません" };
  const itemId = str(fd, "itemId");
  const note = str(fd, "note");
  const shippedOn = str(fd, "shippedOn");
  const trackingNo = str(fd, "trackingNo");
  if (!order.items.some((i) => i.id === itemId)) return { message: "明細を選んでください" };
  if (!note) return { message: "交換の内容を入力してください" };
  const admin = createAdminClient();
  const shippedAt = shippedOn ? new Date(`${shippedOn}T12:00:00+09:00`).toISOString() : null;
  await admin.from("order_items").update({ exchange_note: note, exchange_shipped_at: shippedAt }).eq("id", itemId);
  if (shippedAt) {
    await admin.from("shipments").insert({ order_id: order.id, kind: "exchange", shipped_at: shippedAt, tracking_no: trackingNo || null });
  }
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "order.exchange", targetType: "order", targetId: orderNo, detail: { item_id: itemId, note, shipped_on: shippedOn, tracking_no: trackingNo } });
  return done(orderNo, "交換対応を記録しました");
}

export async function retryRefundAction(orderNo: string, refundId: string): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const r = await retryRefund(staff.user_id, refundId);
    if (!r.ok) return { message: r.error };
  } catch (e) {
    return { message: `返金できませんでした：${e instanceof Error ? e.message : String(e)}` };
  }
  return done(orderNo, "返金をやり直しました");
}

/** Stripe 以外の方法で返金した（返金の失敗のあと、現金や振込で返した）ことを記録する */
export async function markRefundManual(orderNo: string, refundId: string): Promise<FormState> {
  const staff = await requireStaff();
  await createAdminClient().from("refunds").update({ status: "succeeded", method: "manual", failure_reason: "Stripe 以外の方法で返金" }).eq("id", refundId);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "order.refund_retry", targetType: "order", targetId: orderNo, detail: { refund_id: refundId, manual: true } });
  return done(orderNo, "別の方法で返金したことを記録しました");
}
