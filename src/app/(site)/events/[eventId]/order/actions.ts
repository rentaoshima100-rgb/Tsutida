"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/server/auth";
import { cartSchema, placeWebOrder, prepareWebOrder, type Cart } from "@/lib/server/orders/create";
import { createAdminClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";

// M03 → M04 → Stripe。入力は短い間だけ httpOnly の cookie に置き、確定のときにもう一度計算し直す。
// 決済の画面から「戻る」で帰ってきたときに選び直さなくて済むよう、確定のあとも cookie は残し、
// どの注文に使ったか（placedOrderNo）を書き足す。その注文が成立していたら、入力は使い終わったものとして扱う

const cookieName = (eventId: string) => `cart_${eventId.replace(/-/g, "")}`;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60,
  path: "/",
} as const;

export async function readCart(eventId: string): Promise<Cart | null> {
  const raw = (await cookies()).get(cookieName(eventId))?.value;
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = cartSchema.safeParse(json);
  if (!parsed.success || parsed.data.eventId !== eventId) return null;
  const placedOrderNo = (json as { placedOrderNo?: unknown }).placedOrderNo;
  if (typeof placedOrderNo === "string" && /^T\d+$/.test(placedOrderNo)) {
    // 途中でやめた注文（draft）は消えるか draft のまま。支払い待ち・支払い済みになっていたら、この入力はもう使わない
    const { data: placed } = await createAdminClient()
      .from("orders")
      .select("payment_status")
      .eq("order_no", placedOrderNo)
      .maybeSingle();
    if (placed && placed.payment_status !== "draft") return null;
  }
  return parsed.data;
}

export async function reviewOrder(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember(`/events/${eventId}/order`);
  let cart: Cart;
  try {
    cart = cartSchema.parse({ ...JSON.parse(String(fd.get("cart") ?? "{}")), eventId });
  } catch {
    return { message: "入力の内容を確かめてください" };
  }
  const prepared = await prepareWebOrder(member, cart);
  if (!prepared.ok) return { message: prepared.error, errors: prepared.field ? { [prepared.field]: prepared.error } : undefined };
  (await cookies()).set(cookieName(eventId), JSON.stringify(cart), cookieOptions);
  redirect(`/events/${eventId}/order/confirm`);
}

export async function placeOrder(eventId: string, _prev: FormState): Promise<FormState> {
  const member = await requireMember(`/events/${eventId}/order/confirm`);
  const cart = await readCart(eventId);
  if (!cart) return { message: "時間がたったため、入力の内容が消えました。もう一度ご注文の内容を選んでください" };
  const result = await placeWebOrder(member, cart);
  if (!result.ok) return { message: result.error };
  (await cookies()).set(cookieName(eventId), JSON.stringify({ ...cart, placedOrderNo: result.orderNo }), cookieOptions);
  redirect(result.url);
}
