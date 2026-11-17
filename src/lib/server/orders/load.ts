import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type OrderRow = Tables["orders"]["Row"];
export type OrderItemRow = Tables["order_items"]["Row"];
export type EventRow = Tables["events"]["Row"];
export type SchoolRow = Tables["schools"]["Row"];
export type ProductRow = Tables["products"]["Row"];
export type RefundRow = Tables["refunds"]["Row"];
export type ShipmentRow = Tables["shipments"]["Row"];

export type FullOrderItem = OrderItemRow & {
  product: Pick<ProductRow, "id" | "kind" | "media" | "name" | "status">;
  child: { id: string; full_name: string; full_name_kana: string };
};

export type FullOrder = OrderRow & {
  event: EventRow & { school: SchoolRow };
  items: FullOrderItem[];
  refunds: RefundRow[];
  shipments: ShipmentRow[];
  member: { id: string; email: string; full_name: string; full_name_kana: string; phone: string | null } | null;
};

const SELECT = `
  *,
  event:events!inner(*, school:schools!inner(*)),
  items:order_items(*, product:products!inner(id, kind, media, name, status), child:children!inner(id, full_name, full_name_kana)),
  refunds(*),
  shipments(*),
  member:members(id, email, full_name, full_name_kana, phone)
`;

function normalize(row: unknown): FullOrder {
  const o = row as FullOrder;
  o.items = [...(o.items ?? [])].sort((a, b) => a.line_no - b.line_no);
  o.refunds = [...(o.refunds ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  o.shipments = [...(o.shipments ?? [])].sort((a, b) => a.shipped_at.localeCompare(b.shipped_at));
  return o;
}

/** 注文を明細・行事・返金・発送ごと読む（サーバーの処理用。権限は呼ぶ側で確かめる） */
export async function loadOrderById(orderId: string): Promise<FullOrder | null> {
  const { data, error } = await createAdminClient().from("orders").select(SELECT).eq("id", orderId).maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

export async function loadOrderByNo(orderNo: string): Promise<FullOrder | null> {
  if (!/^T\d{7}$/.test(orderNo)) return null;
  const { data, error } = await createAdminClient().from("orders").select(SELECT).eq("order_no", orderNo).maybeSingle();
  if (error) throw error;
  return data ? normalize(data) : null;
}

/** 会員の注文（持ち主でなければ null。4章：持ち主かどうかはサーバーで確かめる） */
export async function loadMemberOrder(memberId: string, orderNo: string): Promise<FullOrder | null> {
  const order = await loadOrderByNo(orderNo);
  if (!order || order.member_id !== memberId || order.payment_status === "draft") return null;
  return order;
}

export function activeItems(order: FullOrder): FullOrderItem[] {
  return order.items.filter((i) => !i.canceled_at);
}

/** 注文者の宛名とメール（会員の注文は会員、代理注文は注文者の欄） */
export function buyerOf(order: FullOrder): { name: string; email: string | null } {
  if (order.member) return { name: order.member.full_name, email: order.member.email };
  return { name: order.buyer_name ?? "", email: order.buyer_email };
}
