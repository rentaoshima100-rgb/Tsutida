"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/server/auth";
import { cartSchema, placeWebOrder, prepareWebOrder, type Cart } from "@/lib/server/orders/create";
import type { FormState } from "@/lib/form";

// M03 → M04 → Stripe。入力は短い間だけ httpOnly の cookie に置き、確定のときにもう一度計算し直す

const cookieName = (eventId: string) => `cart_${eventId.replace(/-/g, "")}`;

export async function readCart(eventId: string): Promise<Cart | null> {
  const raw = (await cookies()).get(cookieName(eventId))?.value;
  if (!raw) return null;
  try {
    const parsed = cartSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.eventId === eventId ? parsed.data : null;
  } catch {
    return null;
  }
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
  (await cookies()).set(cookieName(eventId), JSON.stringify(cart), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  redirect(`/events/${eventId}/order/confirm`);
}

export async function placeOrder(eventId: string, _prev: FormState): Promise<FormState> {
  const member = await requireMember(`/events/${eventId}/order/confirm`);
  const cart = await readCart(eventId);
  if (!cart) return { message: "時間がたったため、入力の内容が消えました。もう一度ご注文の内容を選んでください" };
  const result = await placeWebOrder(member, cart);
  if (!result.ok) return { message: result.error };
  (await cookies()).delete(cookieName(eventId));
  redirect(result.url);
}
