"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { markInProduction } from "@/lib/server/fulfillment";
import type { FormState } from "@/lib/form";

export async function toInProduction(eventId: string, late: boolean): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const n = await markInProduction(staff.user_id, eventId, late);
    revalidatePath("/admin/production");
    return { ok: true, message: `${n} 件の明細を「制作中」にしました` };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "変更できませんでした" };
  }
}
