"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/server/auth";
import { memberCancel } from "@/lib/server/orders/cancel";
import { loadMemberOrder } from "@/lib/server/orders/load";
import { formatYen } from "@/lib/domain/pricing";
import type { FormState } from "@/lib/form";

// M07 締切前のキャンセル（明細ごと。支払い待ちは注文ごと）
export async function cancelOrderItems(orderNo: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember(`/mypage/orders/${orderNo}`);
  const order = await loadMemberOrder(member.id, orderNo);
  if (!order) return { message: "注文が見つかりません" };
  const all = fd.get("all") === "1";
  const itemIds = fd.getAll("item").map(String);
  if (!all && itemIds.length === 0) return { message: "取り消す明細を選んでください" };
  const result = await memberCancel(member.id, order.id, all ? "all" : itemIds);
  revalidatePath(`/mypage/orders/${orderNo}`);
  revalidatePath("/mypage");
  if (!result.ok) return { message: result.error };
  return {
    ok: true,
    message:
      result.refundAmount > 0
        ? `取り消しました。${formatYen(result.refundAmount)}を返金します（くわしくはメールでお知らせします）。`
        : "ご注文を取り消しました。",
  };
}
