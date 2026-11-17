"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import { getMember } from "@/lib/server/auth";
import { enqueueMail } from "@/lib/server/mail/queue";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

const schema = z.object({
  name: z.string().min(1, "お名前を入力してください").max(60),
  email: z.string().email("メールアドレスを正しく入力してください").max(254),
  message: z.string().min(5, "お問い合わせの内容を入力してください").max(4000),
  orderNo: z.string().max(10).optional(),
});

// G07 お問い合わせ：ツチダ映像の受信アドレスにメールで届ける（DBには内容を残さない。案）
export async function sendContact(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { name: str(fd, "name"), email: str(fd, "email"), message: str(fd, "message"), orderNo: str(fd, "orderNo") };
  // ロボット対策の見えない欄
  if (str(fd, "website")) return { ok: true, message: "送信しました" };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }
  const settings = await getSettings();
  if (!settings.contact_inbox) return { message: "ただいまお問い合わせを受け付けられません。お電話でご連絡ください", values };

  const member = await getMember();
  let orderLabel = "（選択なし）";
  if (member && parsed.data.orderNo) {
    const { data } = await createAdminClient()
      .from("orders")
      .select("order_no, event:events!inner(name)")
      .eq("order_no", parsed.data.orderNo)
      .eq("member_id", member.id)
      .maybeSingle();
    if (data) orderLabel = `${data.order_no}（${data.event.name}）`;
  }
  const digest = createHash("sha256").update(`${parsed.data.email}\n${parsed.data.message}`).digest("hex").slice(0, 16);
  await enqueueMail("contact_received", {
    to: settings.contact_inbox,
    dedupeKey: `contact:${digest}`,
    vars: {
      contact_name: parsed.data.name,
      contact_email: parsed.data.email,
      member_label: member ? `${member.full_name}（${member.email}）` : "ログインなし",
      order_label: orderLabel,
      message: parsed.data.message,
    },
  });
  return { ok: true, message: "お問い合わせを受け付けました。内容を確認して、ご連絡します" };
}
