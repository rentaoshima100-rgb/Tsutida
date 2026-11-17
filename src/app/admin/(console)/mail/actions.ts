"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { enqueueMails } from "@/lib/server/mail/queue";
import { placeholders } from "@/lib/server/mail/render";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// A14 メール

export async function saveTemplate(key: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const subject = str(fd, "subject");
  const body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n");
  if (!subject || !body.trim()) return { message: "件名と本文を入力してください" };
  const admin = createAdminClient();
  const { data: before } = await admin.from("email_templates").select("subject, body").eq("key", key).single();
  // 元の文面になかった差し込みを足すと、値がなくて送れなくなるので知らせる
  const known = new Set([...placeholders(before?.subject ?? ""), ...placeholders(before?.body ?? ""), "site_url", "mypage_url", "children_url", "contact_url", "business_name", "business_phone", "business_email"]);
  const unknown = [...placeholders(subject), ...placeholders(body)].filter((p) => !known.has(p));
  if (unknown.length) return { message: `使えない差し込みがあります：${unknown.map((u) => `{{${u}}}`).join("、")}` };
  await admin.from("email_templates").update({ subject, body, updated_by: staff.user_id, updated_at: new Date().toISOString() }).eq("key", key);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "template.update", targetType: "email_template", targetId: key, detail: { before, after: { subject, body } } });
  revalidatePath("/admin/mail");
  return { ok: true, message: "文面を保存しました" };
}

/** 個別のお知らせ（admin_message）：行事の対象の会員、またはメールアドレスで選んだ会員に送る */
export async function sendAdminMessage(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const subject = str(fd, "subject");
  const message = String(fd.get("message") ?? "").trim();
  if (!subject || !message) return { message: "件名と本文を入力してください" };
  const admin = createAdminClient();
  const eventId = str(fd, "eventId");
  const emails = str(fd, "emails").split(/[\s,、]+/).map((e) => e.toLowerCase()).filter(Boolean);
  let recipients: { id: string; email: string; full_name: string }[] = [];
  if (eventId) {
    const { data, error } = await admin.rpc("event_audience", { p_event_id: eventId, p_unordered_only: false });
    if (error) return { message: "宛先を読めませんでした" };
    recipients = (data ?? []).map((r) => ({ id: r.member_id, email: r.email, full_name: r.full_name }));
  } else if (emails.length) {
    const { data } = await admin.from("members").select("id, email, full_name").in("email", emails).is("withdrawn_at", null);
    recipients = data ?? [];
  }
  if (recipients.length === 0) return { message: "宛先がいません（行事を選ぶか、会員のメールアドレスを入力してください）" };
  if (fd.get("confirm") !== "on") return { message: `${recipients.length} 人に送ります。確認の欄にチェックを入れてから、もう一度押してください` };
  const batch = randomUUID();
  const r = await enqueueMails(
    "admin_message",
    recipients.map((m) => ({ to: m.email, memberId: m.id, dedupeKey: `admin_message:${batch}:${m.id}`, vars: { subject, message, member_name: m.full_name } })),
  );
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "mail.admin_message", targetType: eventId ? "event" : "members", targetId: eventId || emails.join(","), detail: { subject, recipients: recipients.length, queued: r.queued } });
  revalidatePath("/admin/mail");
  return { ok: true, message: `${r.queued} 通を送信の予定に入れました（5分ごとに送ります）` };
}
