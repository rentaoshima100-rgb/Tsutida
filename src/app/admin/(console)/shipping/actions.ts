"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { importTracking } from "@/lib/server/fulfillment";
import { str, type FormState } from "@/lib/form";

export async function importTrackingCsv(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const file = fd.get("file");
  let text = str(fd, "text");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { message: "ファイルが大きすぎます（2MBまで）" };
    const buf = Buffer.from(await file.arrayBuffer());
    // Shift_JIS の CSV にも対応する
    const utf8 = buf.toString("utf8");
    if (utf8.includes("�")) {
      const iconv = await import("iconv-lite");
      text = iconv.default.decode(buf, "Shift_JIS");
    } else text = utf8;
  }
  if (!text.trim()) return { message: "CSV を選ぶか、貼り付けてください" };
  const r = await importTracking(staff.user_id, eventId, text, str(fd, "carrier"));
  revalidatePath("/admin/shipping");
  return {
    ok: r.skipped.length === 0,
    message: `${r.shipped} 件を「発送済み」にし、注文者にお知らせします。${r.skipped.length ? `取り込めなかった行：${r.skipped.join("、")}` : ""}`,
  };
}
