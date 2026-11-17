import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { calcOrder, formatYen, KONBINI_MAX, KONBINI_MIN } from "@/lib/domain/pricing";
import { orderDeadline, orderWindow, paymentDue } from "@/lib/domain/deadlines";
import { isKana, tidyKana } from "@/lib/domain/kana";
import type { Json } from "@/lib/database.types";
import { getGateway } from "@/lib/server/payments";
import { writeAudit } from "@/lib/server/audit";
import { getSettings } from "@/lib/server/settings";
import { loadOrderById } from "./load";
import { sendOrderMail } from "./mail";

// 代理注文（6.4・10.3）：電話・紙の注文を管理者が作る。支払いはコンビニ払い・銀行振込（移行期間は現金も）

export const proxySchema = z.object({
  eventId: z.string().uuid(),
  classId: z.string().uuid("クラスを選んでください"),
  childName: z.string().min(1, "お子さまのお名前を入力してください").max(40),
  childKana: z.string().refine(isKana, "お子さまのふりがなを、ひらがなかカタカナで入力してください"),
  quantities: z.record(z.string(), z.number().int().min(0).max(20)),
  deliveryMethod: z.enum(["school", "mail"]),
  buyerName: z.string().min(1, "注文者のお名前を入力してください").max(40),
  buyerKana: z.string().max(60),
  buyerPhone: z.string().min(10, "注文者の電話番号を入力してください").max(20),
  buyerEmail: z.string().email("メールアドレスの形が正しくありません").or(z.literal("")),
  shipPostalCode: z.string().max(10),
  shipAddress: z.string().max(200),
  paymentMethod: z.enum(["konbini", "bank_transfer", "cash"]),
  memo: z.string().max(1000),
});
export type ProxyInput = z.infer<typeof proxySchema>;

export async function placeProxyOrder(staffId: string, input: ProxyInput): Promise<{ ok: true; orderNo: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("*").eq("id", input.eventId).eq("status", "published").maybeSingle();
  if (!event) return { ok: false, error: "公開中の行事を選んでください" };
  const { data: target } = await admin
    .from("event_targets")
    .select("class:classes!inner(id, grade_label, name)")
    .eq("event_id", event.id)
    .eq("class_id", input.classId)
    .maybeSingle();
  if (!target) return { ok: false, error: "この行事の対象のクラスを選んでください" };

  const window = orderWindow(event, new Date());
  if (window === "before_sale") return { ok: false, error: "この行事は、まだ販売が始まっていません" };
  if (window === "closed") return { ok: false, error: "この行事の受付は終わっています（締切後の受付もありません）" };
  const isLate = window === "late";
  const delivery = isLate ? "mail" : input.deliveryMethod;
  if (!isLate && event.delivery_method !== "either" && event.delivery_method !== delivery) {
    return { ok: false, error: `この行事の受け取り方法は「${event.delivery_method === "school" ? "学校・園" : "郵送"}」だけです` };
  }
  if (delivery === "mail" && (!input.shipPostalCode || !input.shipAddress)) return { ok: false, error: "郵送の場合は、郵便番号と住所を入力してください" };
  const settings = await getSettings();
  if (input.paymentMethod !== "cash" && !settings.payment_methods[input.paymentMethod]) {
    return { ok: false, error: "この支払い方法は、設定でオフになっています（A16 設定）" };
  }
  if (input.paymentMethod === "konbini" && !input.buyerEmail) {
    return { ok: false, error: "コンビニ払いには注文者のメールアドレスが必要です（Stripe の決まり）。ない場合は銀行振込か現金にしてください" };
  }

  const { data: products } = await admin.from("products").select("*, product_targets(class_id)").eq("event_id", event.id).eq("status", "on_sale").order("sort_order");
  const all = products ?? [];
  const usable = all.filter((p) => p.product_targets.length === 0 || p.product_targets.some((t) => t.class_id === input.classId));
  const notForClass = all.find((p) => (input.quantities[p.id] ?? 0) > 0 && !usable.includes(p));
  if (notForClass) return { ok: false, error: `「${notForClass.name}」は、このクラスでは買えません` };
  const lines = usable.filter((p) => (input.quantities[p.id] ?? 0) > 0).map((p, i) => ({ lineNo: i + 1, product: p, quantity: input.quantities[p.id] }));
  if (lines.length === 0) return { ok: false, error: "商品と枚数を入力してください" };
  const pricing = calcOrder({
    lines: lines.map((l) => ({ lineNo: l.lineNo, productId: l.product.id, quantity: l.quantity })),
    products: new Map(usable.map((p) => [p.id, { id: p.id, kind: p.kind as "disc" | "data", price: p.price, secondPrice: p.second_price, latePrice: p.late_price }])),
    isLate,
    deliveryMethod: delivery,
    shippingFee: event.shipping_fee ?? settings.default_shipping_fee,
  });
  if (input.paymentMethod === "konbini" && (pricing.total < KONBINI_MIN || pricing.total > KONBINI_MAX)) {
    return { ok: false, error: `コンビニ払いは ${formatYen(KONBINI_MIN)}〜${formatYen(KONBINI_MAX)} の注文だけです` };
  }

  const { data: childId, error: childError } = await admin.rpc("resolve_proxy_child", {
    p_class_id: input.classId,
    p_full_name: input.childName,
    p_full_name_kana: tidyKana(input.childKana),
  });
  if (childError || !childId) return { ok: false, error: "お子さまを登録できませんでした" };

  const due = input.paymentMethod === "cash" ? null : paymentDue(new Date(), orderDeadline(event, isLate));
  const { data: created, error } = await admin.rpc("create_order", {
    p_order: {
      event_id: event.id,
      member_id: null,
      channel: "proxy",
      is_late: isLate,
      delivery_method: delivery,
      ship_name: delivery === "mail" ? input.buyerName : null,
      ship_postal_code: delivery === "mail" ? input.shipPostalCode.normalize("NFKC") : null,
      ship_address: delivery === "mail" ? input.shipAddress : null,
      ship_phone: delivery === "mail" ? input.buyerPhone : null,
      buyer_name: input.buyerName,
      buyer_kana: input.buyerKana || null,
      buyer_phone: input.buyerPhone,
      buyer_email: input.buyerEmail || null,
      payment_method: input.paymentMethod,
      payment_status: input.paymentMethod === "cash" ? "pending" : "draft",
      subtotal: pricing.subtotal,
      shipping_fee: pricing.shippingFee,
      total: pricing.total,
      payment_due_at: due?.dueAt.toISOString() ?? null,
      created_by: staffId,
      memo: input.memo || null,
    } as unknown as Json,
    p_items: lines.map((l) => ({
      product_id: l.product.id,
      child_id: childId,
      class_id: input.classId,
      grade_label_snapshot: target.class.grade_label,
      class_name_snapshot: target.class.name,
      quantity: l.quantity,
      amount: pricing.lines.find((x) => x.lineNo === l.lineNo)!.amount,
    })) as unknown as Json,
  });
  if (error || !created?.[0]) return { ok: false, error: "注文を作れませんでした" };
  const { order_id: orderId, order_no: orderNo } = created[0];

  if (input.paymentMethod !== "cash") {
    try {
      const gateway = getGateway();
      // 銀行振込は注文ごとに Stripe の顧客を作る（振込先の口座が注文者ごとに分かれる。10.3）
      const customerId =
        input.paymentMethod === "bank_transfer"
          ? await gateway.ensureCustomer({ name: input.buyerName, email: input.buyerEmail || null, idempotencyKey: `customer:proxy:${orderId}` })
          : undefined;
      const pi = await gateway.createProxyPayment({
        orderId,
        orderNo,
        method: input.paymentMethod,
        amount: pricing.total,
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail || null,
        konbiniDays: due?.days,
        customerId,
      });
      await admin.rpc("mark_order_pending", { p_order_id: orderId, p_payment_intent_id: pi.paymentIntentId, p_details: pi.details as unknown as Json });
    } catch (e) {
      await admin.rpc("delete_draft_order", { p_order_id: orderId });
      return { ok: false, error: `払込票・振込先を発行できませんでした（${e instanceof Error ? e.message : "不明なエラー"}）` };
    }
    const order = await loadOrderById(orderId);
    if (order?.buyer_email) await sendOrderMail("payment_instructions", order, { dedupeKey: `payment_instructions:${orderId}` });
  }
  await writeAudit({
    actorId: staffId,
    actorType: "staff",
    action: "order.proxy_create",
    targetType: "order",
    targetId: orderNo,
    detail: { total: pricing.total, method: input.paymentMethod, window },
  });
  return { ok: true, orderNo };
}
