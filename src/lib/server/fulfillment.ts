import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/server/audit";
import { loadOrderById } from "@/lib/server/orders/load";
import { sendOrderMail } from "@/lib/server/orders/mail";

// 集計・制作（A10）、仕分け（A11）、発送（A12）

const PAID = ["paid", "partially_refunded"];

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  child_id: string;
  class_id: string;
  quantity: number;
  fulfillment_status: string | null;
  canceled_at: string | null;
  grade_label_snapshot: string;
  class_name_snapshot: string;
  product_name_snapshot: string;
  order: { order_no: string; payment_status: string; is_late: boolean; delivery_method: string; member_id: string | null };
  child: { full_name: string; full_name_kana: string };
  class: { grade_order: number };
};

async function eventItems(eventId: string): Promise<ItemRow[]> {
  const admin = createAdminClient();
  const out: ItemRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("order_items")
      .select(
        "id, order_id, product_id, child_id, class_id, quantity, fulfillment_status, canceled_at, grade_label_snapshot, class_name_snapshot, product_name_snapshot, order:orders!inner(order_no, payment_status, is_late, delivery_method, member_id, event_id), child:children!inner(full_name, full_name_kana), class:classes!inner(grade_order)",
      )
      .eq("order.event_id", eventId)
      .is("canceled_at", null)
      .in("order.payment_status", ["pending", "paid", "partially_refunded"])
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as ItemRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export type ProductionRow = {
  productId: string;
  name: string;
  accepted: number;
  inProduction: number;
  done: number;
  pending: number;
};

/** 行事・商品ごとの本数。確定までは支払い待ちを「見込み」として別に数える（8章） */
export async function productionSummary(eventId: string) {
  const items = await eventItems(eventId);
  const summarize = (late: boolean) => {
    const map = new Map<string, ProductionRow>();
    for (const i of items.filter((x) => x.order.is_late === late)) {
      const r = map.get(i.product_id) ?? { productId: i.product_id, name: i.product_name_snapshot, accepted: 0, inProduction: 0, done: 0, pending: 0 };
      if (i.order.payment_status === "pending") r.pending += i.quantity;
      else if (i.fulfillment_status === "accepted") r.accepted += i.quantity;
      else if (i.fulfillment_status === "in_production") r.inProduction += i.quantity;
      else if (i.fulfillment_status === "delivered" || i.fulfillment_status === "shipped") r.done += i.quantity;
      map.set(i.product_id, r);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  };
  return { normal: summarize(false), late: summarize(true) };
}

/** 本数の確定後に「制作中」へ一括で変える（A10） */
export async function markInProduction(staffId: string, eventId: string, late: boolean) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from("events").select("production_fixed_at, late_production_fixed_at").eq("id", eventId).single();
  if (!ev || !(late ? ev.late_production_fixed_at : ev.production_fixed_at)) throw new Error("本数が確定してから変えてください");
  const items = (await eventItems(eventId)).filter((i) => i.order.is_late === late && i.fulfillment_status === "accepted" && PAID.includes(i.order.payment_status));
  for (let i = 0; i < items.length; i += 200) {
    await admin.from("order_items").update({ fulfillment_status: "in_production" }).in("id", items.slice(i, i + 200).map((x) => x.id)).eq("fulfillment_status", "accepted");
  }
  await writeAudit({ actorId: staffId, actorType: "staff", action: "items.in_production", targetType: "event", targetId: eventId, detail: { late, items: items.length } });
  return items.length;
}

export type SortingChild = {
  childId: string;
  name: string;
  kana: string;
  lines: { product: string; quantity: number }[];
  orderNos: string[];
};
export type SortingClass = { classId: string; label: string; gradeOrder: number; children: SortingChild[] };

/**
 * 仕分けリスト（A11）：学校・園で受け取る分を、クラス別・名前順に。
 * 同じお子さまの分は、家族の別々の注文もまとめて1行にする（13章）
 */
export async function sortingData(eventId: string, statuses: string[] = ["accepted", "in_production"]): Promise<SortingClass[]> {
  const items = (await eventItems(eventId)).filter(
    (i) => i.order.delivery_method === "school" && PAID.includes(i.order.payment_status) && statuses.includes(i.fulfillment_status ?? ""),
  );
  const classes = new Map<string, SortingClass>();
  for (const i of items) {
    const c = classes.get(i.class_id) ?? { classId: i.class_id, label: `${i.grade_label_snapshot} ${i.class_name_snapshot}`, gradeOrder: i.class.grade_order, children: [] };
    let child = c.children.find((x) => x.childId === i.child_id);
    if (!child) {
      child = { childId: i.child_id, name: i.child.full_name, kana: i.child.full_name_kana, lines: [], orderNos: [] };
      c.children.push(child);
    }
    const line = child.lines.find((l) => l.product === i.product_name_snapshot);
    if (line) line.quantity += i.quantity;
    else child.lines.push({ product: i.product_name_snapshot, quantity: i.quantity });
    if (!child.orderNos.includes(i.order.order_no)) child.orderNos.push(i.order.order_no);
    classes.set(i.class_id, c);
  }
  const list = [...classes.values()].sort((a, b) => a.gradeOrder - b.gradeOrder || a.label.localeCompare(b.label, "ja"));
  for (const c of list) c.children.sort((a, b) => a.kana.localeCompare(b.kana, "ja"));
  return list;
}

/** 学校・園に届けた（in_production → delivered）。注文者に delivered_to_school を送る */
export async function markDelivered(staffId: string, eventId: string, classIds: string[]) {
  const admin = createAdminClient();
  const items = (await eventItems(eventId)).filter(
    (i) => i.order.delivery_method === "school" && i.fulfillment_status === "in_production" && (classIds.length === 0 || classIds.includes(i.class_id)),
  );
  const orderIds = new Set<string>();
  for (let i = 0; i < items.length; i += 200) {
    await admin.from("order_items").update({ fulfillment_status: "delivered" }).in("id", items.slice(i, i + 200).map((x) => x.id)).eq("fulfillment_status", "in_production");
  }
  for (const i of items) orderIds.add(i.order_id);
  for (const id of orderIds) {
    const order = await loadOrderById(id);
    if (order) await sendOrderMail("delivered_to_school", order, { dedupeKey: `delivered_to_school:${id}` });
  }
  await writeAudit({ actorId: staffId, actorType: "staff", action: "items.delivered", targetType: "event", targetId: eventId, detail: { classes: classIds, items: items.length } });
  return { items: items.length, orders: orderIds.size };
}

export type ShippingRow = {
  orderId: string;
  orderNo: string;
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  contents: string;
  isLate: boolean;
};

/** 発送する注文（郵送・制作中）。宛名ラベル・宛名CSV（A12） */
export async function shippingData(eventId: string, late?: boolean): Promise<ShippingRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("id, order_no, ship_name, ship_postal_code, ship_address, ship_phone, is_late, items:order_items(product_name_snapshot, quantity, fulfillment_status, canceled_at)")
    .eq("event_id", eventId)
    .eq("delivery_method", "mail")
    .in("payment_status", PAID)
    .order("order_no");
  if (error) throw error;
  return (data ?? [])
    .filter((o) => (late === undefined || o.is_late === late) && o.items.some((i) => !i.canceled_at && i.fulfillment_status === "in_production"))
    .map((o) => ({
      orderId: o.id,
      orderNo: o.order_no,
      name: o.ship_name ?? "",
      postalCode: o.ship_postal_code ?? "",
      address: o.ship_address ?? "",
      phone: o.ship_phone ?? "",
      contents: o.items.filter((i) => !i.canceled_at && i.fulfillment_status === "in_production").map((i) => `${i.product_name_snapshot}×${i.quantity}`).join("、"),
      isLate: o.is_late,
    }));
}

/** 追跡番号の取り込み（CSV：注文番号, 追跡番号[, 配送会社]）。発送済みにして shipped を送る */
export async function importTracking(staffId: string, eventId: string, csv: string, defaultCarrier: string) {
  const admin = createAdminClient();
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result = { shipped: 0, skipped: [] as string[] };
  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    // 「注文番号,追跡番号[,配送会社]」か、宛名CSV（7列目が追跡番号）のどちらでも読む
    const [orderNo, trackingNo, carrier] = cols.length >= 7 ? [cols[0], cols[6], cols[7]] : cols;
    if (!/^T\d{7}$/.test(orderNo ?? "")) continue; // 見出しの行など
    const { data: order } = await admin.from("orders").select("id, event_id, delivery_method").eq("order_no", orderNo).maybeSingle();
    if (!order || order.event_id !== eventId || order.delivery_method !== "mail") {
      result.skipped.push(`${orderNo}（この行事の郵送の注文ではありません）`);
      continue;
    }
    const { data: moved } = await admin
      .from("order_items")
      .update({ fulfillment_status: "shipped" })
      .eq("order_id", order.id)
      .eq("fulfillment_status", "in_production")
      .is("canceled_at", null)
      .select("id");
    if (!moved || moved.length === 0) {
      result.skipped.push(`${orderNo}（制作中の明細がありません）`);
      continue;
    }
    await admin.from("shipments").insert({ order_id: order.id, kind: "original", tracking_no: trackingNo || null, carrier: carrier || defaultCarrier || null });
    const full = await loadOrderById(order.id);
    if (full) {
      await sendOrderMail("shipped", full, {
        dedupeKey: `shipped:${order.id}:${trackingNo ?? ""}`,
        vars: { tracking_no: trackingNo || "（なし）", carrier: carrier || defaultCarrier || "" },
      });
    }
    result.shipped++;
  }
  await writeAudit({ actorId: staffId, actorType: "staff", action: "items.shipped", targetType: "event", targetId: eventId, detail: result });
  return result;
}
