"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { markDelivered } from "@/lib/server/fulfillment";
import type { FormState } from "@/lib/form";

export async function deliver(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const classIds = fd.getAll("class").map(String);
  if (classIds.length === 0) return { message: "納品したクラスを選んでください" };
  const r = await markDelivered(staff.user_id, eventId, classIds);
  revalidatePath("/admin/sorting");
  return { ok: true, message: `${r.items} 件の明細を「納品済み」にし、${r.orders} 件の注文者にお知らせします` };
}
