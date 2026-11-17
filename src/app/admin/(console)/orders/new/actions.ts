"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/auth";
import { placeProxyOrder, proxySchema } from "@/lib/server/orders/proxy";
import { str, type FormState } from "@/lib/form";

const TEXT_FIELDS = ["childName", "childKana", "buyerName", "buyerKana", "buyerPhone", "buyerEmail", "shipPostalCode", "shipAddress", "memo"] as const;

export async function createProxyOrder(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const quantities: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("qty:")) quantities[k.slice(4)] = Number(v) || 0;
  // 入力の誤りで戻すときに、入れた内容を消さない（電話を受けながら入力するため）
  const values = Object.fromEntries(TEXT_FIELDS.map((k) => [k, str(fd, k)]));
  const parsed = proxySchema.safeParse({
    eventId,
    classId: str(fd, "classId"),
    quantities,
    deliveryMethod: str(fd, "deliveryMethod") || "school",
    paymentMethod: str(fd, "paymentMethod"),
    ...values,
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message, values };
  const r = await placeProxyOrder(staff.user_id, parsed.data);
  if (!r.ok) return { message: r.error, values };
  redirect(`/admin/orders/${r.orderNo}/slip`);
}
