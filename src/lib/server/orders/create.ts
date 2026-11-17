import "server-only";
import { z } from "zod";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { calcOrder, KONBINI_MAX, KONBINI_MIN, type PricingResult } from "@/lib/domain/pricing";
import { orderDeadline, paymentDue } from "@/lib/domain/deadlines";
import type { Json } from "@/lib/database.types";
import { getGateway } from "@/lib/server/payments";
import type { OnlineMethod } from "@/lib/server/payments/types";
import type { MemberRow } from "@/lib/server/auth";
import { loadOrderContext, type EligibleChild, type OrderContext } from "./context";
import type { ProductRow } from "./load";

// 注文の作成（6.2）。ブラウザから送られた金額は使わず、必ずサーバーで計算し直す（9章）

export const cartSchema = z.object({
  eventId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        childId: z.string().uuid(),
        quantity: z.number().int().min(0).max(9),
      }),
    )
    .max(60),
  deliveryMethod: z.enum(["school", "mail"]),
  shipping: z
    .object({
      name: z.string().trim().max(60),
      postalCode: z.string().trim().max(10),
      address: z.string().trim().max(200),
      phone: z.string().trim().max(20),
    })
    .optional(),
  paymentMethod: z.enum(["card", "paypay", "konbini", "bank_transfer"]),
});

export type Cart = z.infer<typeof cartSchema>;

export type PreparedLine = {
  lineNo: number;
  product: ProductRow;
  child: EligibleChild;
  quantity: number;
  amount: number;
  unitPrices: number[];
};

export type PreparedOrder = {
  ctx: OrderContext;
  cart: Cart;
  lines: PreparedLine[];
  pricing: PricingResult;
  paymentDue: { days: number; dueAt: Date } | null;
};

export type PrepareResult = { ok: true; order: PreparedOrder } | { ok: false; error: string; field?: string };

const POSTAL = /^\d{3}-?\d{4}$/;
const PHONE = /^[0-9０-９+\-－ ()（）]{10,15}$/;

/** 注文の内容を確かめて金額を計算する（M03→M04、M04の確定） */
export async function prepareWebOrder(member: MemberRow, input: Cart, now = new Date()): Promise<PrepareResult> {
  const parsed = cartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力の内容を確かめてください" };
  const cart = parsed.data;

  const ctx = await loadOrderContext(member.id, cart.eventId, now);
  if (!ctx) return { ok: false, error: "この行事は注文できません" };
  if (!ctx.canOrder) return { ok: false, error: "この行事の受付は終わっています" };

  const seen = new Set<string>();
  const lines: Omit<PreparedLine, "amount" | "unitPrices">[] = [];
  for (const l of cart.lines) {
    if (l.quantity === 0) continue;
    const key = `${l.productId}:${l.childId}`;
    if (seen.has(key)) return { ok: false, error: "同じ商品とお子さまの組み合わせが重なっています" };
    seen.add(key);
    const child = ctx.children.find((c) => c.childId === l.childId);
    const product = ctx.products.find((p) => p.id === l.productId);
    if (!child || !product || product.status !== "on_sale" || !child.productIds.includes(product.id)) {
      return { ok: false, error: "注文できない商品が含まれています。もう一度お選びください" };
    }
    lines.push({ lineNo: lines.length + 1, product, child, quantity: l.quantity });
  }
  if (lines.length === 0) return { ok: false, error: "商品と枚数を選んでください", field: "lines" };

  if (!ctx.deliveryOptions.includes(cart.deliveryMethod)) {
    return { ok: false, error: "受け取り方法を選び直してください", field: "deliveryMethod" };
  }
  if (cart.deliveryMethod === "mail") {
    const s = cart.shipping;
    if (!s || !s.name) return { ok: false, error: "お届け先のお名前を入力してください", field: "shipping.name" };
    if (!POSTAL.test(s.postalCode.normalize("NFKC"))) {
      return { ok: false, error: "郵便番号を7桁で入力してください（例：910-0000）", field: "shipping.postalCode" };
    }
    if (!s.address) return { ok: false, error: "お届け先の住所を入力してください", field: "shipping.address" };
    if (!PHONE.test(s.phone)) return { ok: false, error: "電話番号を入力してください", field: "shipping.phone" };
  }

  if (!ctx.paymentMethods.includes(cart.paymentMethod)) {
    return { ok: false, error: "このお支払い方法は、いまは使えません", field: "paymentMethod" };
  }
  if (cart.paymentMethod === "bank_transfer" && ctx.hasPendingBankTransfer) {
    return {
      ok: false,
      error: "お支払い待ちの銀行振込のご注文があるため、銀行振込は選べません。ほかのお支払い方法をお選びください",
      field: "paymentMethod",
    };
  }

  const pricing = calcOrder({
    lines: lines.map((l) => ({ lineNo: l.lineNo, productId: l.product.id, quantity: l.quantity })),
    products: new Map(
      ctx.products.map((p) => [
        p.id,
        { id: p.id, kind: p.kind as "disc" | "data", price: p.price, secondPrice: p.second_price, latePrice: p.late_price },
      ]),
    ),
    isLate: ctx.isLate,
    deliveryMethod: cart.deliveryMethod,
    shippingFee: ctx.shippingFee,
  });
  if (pricing.total <= 0) return { ok: false, error: "合計金額が正しくありません" };
  if (cart.paymentMethod === "konbini" && (pricing.total < KONBINI_MIN || pricing.total > KONBINI_MAX)) {
    return { ok: false, error: "コンビニ払いは、合計120円以上30万円以下のときに使えます", field: "paymentMethod" };
  }

  const priced: PreparedLine[] = lines.map((l) => {
    const p = pricing.lines.find((x) => x.lineNo === l.lineNo)!;
    return { ...l, amount: p.amount, unitPrices: p.unitPrices };
  });
  const due =
    cart.paymentMethod === "konbini" || cart.paymentMethod === "bank_transfer"
      ? paymentDue(now, orderDeadline(ctx.event, ctx.isLate))
      : null;

  return { ok: true, order: { ctx, cart, lines: priced, pricing, paymentDue: due } };
}

function orderPayload(p: PreparedOrder, extra: Record<string, unknown>) {
  const ship = p.cart.deliveryMethod === "mail" ? p.cart.shipping : undefined;
  return {
    event_id: p.ctx.event.id,
    is_late: p.ctx.isLate,
    delivery_method: p.cart.deliveryMethod,
    ship_name: ship?.name ?? null,
    ship_postal_code: ship ? ship.postalCode.normalize("NFKC") : null,
    ship_address: ship?.address ?? null,
    ship_phone: ship?.phone ?? null,
    payment_method: p.cart.paymentMethod,
    subtotal: p.pricing.subtotal,
    shipping_fee: p.pricing.shippingFee,
    total: p.pricing.total,
    payment_due_at: p.paymentDue?.dueAt.toISOString() ?? null,
    ...extra,
  };
}

function itemsPayload(p: PreparedOrder) {
  return p.lines.map((l) => ({
    product_id: l.product.id,
    child_id: l.child.childId,
    class_id: l.child.classId,
    grade_label_snapshot: l.child.gradeLabel,
    class_name_snapshot: l.child.className,
    quantity: l.quantity,
    amount: l.amount,
  }));
}

/** 決済画面に出す明細（お子さまの名前は渡さない：14章） */
export function checkoutLineItems(p: { lines: { product: { name: string }; quantity: number; amount: number }[]; shippingFee: number }) {
  const items = p.lines.map((l) => ({ name: `${l.product.name}（${l.quantity}枚）`, amount: l.amount }));
  if (p.shippingFee > 0) items.push({ name: "送料", amount: p.shippingFee });
  return items;
}

/**
 * 「注文を確定して支払う」（M04）：draft の注文を作り、Stripe Checkout の URL を返す。
 * 同じ会員の途中でやめた注文（draft）は、先に片づける
 */
export async function placeWebOrder(member: MemberRow, cart: Cart): Promise<{ ok: true; url: string; orderNo: string } | { ok: false; error: string }> {
  const prepared = await prepareWebOrder(member, cart);
  if (!prepared.ok) return prepared;
  const p = prepared.order;
  const admin = createAdminClient();
  const gateway = getGateway();

  const { data: drafts } = await admin
    .from("orders")
    .select("id, stripe_checkout_session_id")
    .eq("member_id", member.id)
    .eq("payment_status", "draft");
  for (const d of drafts ?? []) {
    if (d.stripe_checkout_session_id) await gateway.expireCheckoutSession(d.stripe_checkout_session_id).catch(() => {});
    await admin.rpc("delete_draft_order", { p_order_id: d.id });
  }

  let customerId: string | undefined;
  if (p.cart.paymentMethod === "bank_transfer") {
    customerId = await gateway.ensureCustomer({
      existingId: member.stripe_customer_id,
      name: member.full_name,
      email: member.email,
      memberId: member.id,
    });
    if (customerId !== member.stripe_customer_id) {
      await admin.from("members").update({ stripe_customer_id: customerId }).eq("id", member.id);
    }
  }

  const { data: created, error } = await admin.rpc("create_order", {
    p_order: orderPayload(p, { member_id: member.id, channel: "web", payment_status: "draft" }) as unknown as Json,
    p_items: itemsPayload(p) as unknown as Json,
  });
  if (error || !created?.[0]) {
    if (error?.message.includes("pending_bank_transfer_exists")) {
      return { ok: false, error: "お支払い待ちの銀行振込のご注文があるため、銀行振込は選べません" };
    }
    throw error ?? new Error("create_order returned nothing");
  }
  const { order_id: orderId, order_no: orderNo } = created[0];

  try {
    const session = await gateway.createCheckoutSession({
      orderId,
      orderNo,
      method: p.cart.paymentMethod as OnlineMethod,
      lineItems: checkoutLineItems({ lines: p.lines, shippingFee: p.pricing.shippingFee }),
      customerEmail: member.email,
      customerId,
      konbiniDays: p.paymentDue?.days,
      successUrl: appUrl("/payment/return?session_id={CHECKOUT_SESSION_ID}"),
      cancelUrl: appUrl(`/events/${p.ctx.event.id}/order/confirm`),
    });
    await admin.from("orders").update({ stripe_checkout_session_id: session.sessionId }).eq("id", orderId);
    return { ok: true, url: session.url, orderNo };
  } catch (e) {
    await admin.rpc("delete_draft_order", { p_order_id: orderId });
    console.error("[checkout] failed to create session", e instanceof Error ? e.message : e);
    return { ok: false, error: "決済の画面を開けませんでした。時間をおいて、もう一度お試しください" };
  }
}
