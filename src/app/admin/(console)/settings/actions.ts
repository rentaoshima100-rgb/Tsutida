"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { settingsSchema, type SettingKey } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";
import type { Json } from "@/lib/database.types";

// A16 設定。値は検証してから保存し、変更は監査ログに残す

const PUBLIC_KEYS = new Set<string>([
  "default_shipping_fee", "payment_methods", "business_info", "snapsnap_url", "consent_wording", "playback_note",
  "page_top", "page_guide", "page_products", "page_faq", "legal_tokushoho", "legal_terms", "legal_privacy", "legal_cancel",
]);

async function save(staffId: string, entries: [string, unknown][]): Promise<FormState> {
  const admin = createAdminClient();
  for (const [key, value] of entries) {
    const field = settingsSchema.shape[key as SettingKey];
    if (field) {
      const parsed = field.safeParse(value);
      if (!parsed.success) return { message: `「${key}」の値が正しくありません` };
    }
    const { error } = await admin
      .from("settings")
      .upsert({ key, value: value as NonNullable<Json>, is_public: PUBLIC_KEYS.has(key), updated_by: staffId, updated_at: new Date().toISOString() });
    if (error) return { message: "保存できませんでした" };
  }
  await writeAudit({ actorId: staffId, actorType: "staff", action: "settings.update", targetType: "settings", targetId: entries.map(([k]) => k).join(","), detail: Object.fromEntries(entries) });
  revalidatePath("/", "layout");
  return { ok: true, message: "保存しました" };
}

export async function saveBusiness(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  return save(staff.user_id, [
    ["business_info", {
      name: str(fd, "name"), representative: str(fd, "representative"), postal_code: str(fd, "postal_code"), address: str(fd, "address"),
      phone: str(fd, "phone"), email: str(fd, "email"), hours: str(fd, "hours"), url: str(fd, "url"),
    }],
    ["contact_inbox", str(fd, "contact_inbox")],
    ["maintainer_email", str(fd, "maintainer_email")],
    ["mail_sender", { from_name: str(fd, "from_name"), from_address: str(fd, "from_address"), reply_to: str(fd, "reply_to") }],
    ["snapsnap_url", str(fd, "snapsnap_url")],
  ]);
}

export async function saveOrdering(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const fee = Number(str(fd, "default_shipping_fee"));
  const max = Number(str(fd, "max_accounts_per_child"));
  if (!Number.isInteger(fee) || fee < 0) return { message: "送料は0以上の整数で入力してください" };
  if (!Number.isInteger(max) || max < 1 || max > 10) return { message: "つなげるアカウント数は1〜10にしてください" };
  return save(staff.user_id, [
    ["default_shipping_fee", fee],
    ["payment_methods", { card: fd.get("card") === "on", paypay: fd.get("paypay") === "on", konbini: fd.get("konbini") === "on", bank_transfer: fd.get("bank_transfer") === "on" }],
    ["max_accounts_per_child", max],
    ["delivery_note_default", str(fd, "delivery_note_default")],
    ["late_delivery_note_default", str(fd, "late_delivery_note_default")],
    ["receipt", { proviso: str(fd, "proviso") || "DVD・Blu-ray代として" }],
    ["consent_wording", { version: str(fd, "consent_version") || "v1", label: str(fd, "consent_label") }],
    ["playback_note", str(fd, "playback_note")],
  ]);
}

/** FAQ は「Q: 質問」「A: 答え」の行で書く */
function parseFaq(text: string) {
  const items: { q: string; a: string }[] = [];
  let cur: { q: string; a: string } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^Q[:：]/i.test(line)) {
      if (cur) items.push(cur);
      cur = { q: line.replace(/^Q[:：]\s*/i, ""), a: "" };
    } else if (/^A[:：]/i.test(line) && cur) {
      cur.a = line.replace(/^A[:：]\s*/i, "");
    } else if (line && cur) {
      cur.a += (cur.a ? "\n" : "") + line;
    }
  }
  if (cur) items.push(cur);
  return items.filter((i) => i.q && i.a);
}

export async function savePages(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  return save(staff.user_id, [
    ["page_top", { lead: str(fd, "top_lead"), why_login: str(fd, "top_why_login"), notice: str(fd, "top_notice") }],
    ["page_guide", String(fd.get("page_guide") ?? "")],
    ["page_products", String(fd.get("page_products") ?? "")],
    ["page_faq", parseFaq(String(fd.get("page_faq") ?? ""))],
    ["legal_tokushoho", String(fd.get("legal_tokushoho") ?? "")],
    ["legal_terms", String(fd.get("legal_terms") ?? "")],
    ["legal_privacy", String(fd.get("legal_privacy") ?? "")],
    ["legal_cancel", String(fd.get("legal_cancel") ?? "")],
  ]);
}

const staffSchema = z.object({
  email: z.string().email("メールアドレスを正しく入力してください"),
  name: z.string().min(1, "名前を入力してください").max(40),
  role: z.enum(["admin", "maintainer"]),
});

/** 管理者の追加。パスワードは本人が /admin/login の「パスワードを設定する」（確認番号）で決める */
export async function addStaff(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = staffSchema.safeParse({ email: str(fd, "email").toLowerCase(), name: str(fd, "name"), role: str(fd, "role") });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({ email: parsed.data.email, email_confirm: true, user_metadata: { signup_kind: "staff" } });
  if (error || !created.user) return { message: "このメールアドレスでは作れません（会員として登録済みなど）" };
  const { error: staffError } = await admin.from("staff").insert({ user_id: created.user.id, name: parsed.data.name, email: parsed.data.email, role: parsed.data.role });
  if (staffError) return { message: "管理者を追加できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "staff.create", targetType: "staff", targetId: created.user.id, detail: parsed.data });
  revalidatePath("/admin/settings");
  return { ok: true, message: `追加しました。${parsed.data.email} の方に、/admin/login の「パスワードを設定する」からパスワードを決めてもらってください` };
}

export async function setStaffActive(userId: string, active: boolean): Promise<FormState> {
  const staff = await requireStaff();
  if (userId === staff.user_id && !active) return { message: "自分のアカウントは止められません" };
  const admin = createAdminClient();
  await admin.from("staff").update({ active }).eq("user_id", userId);
  // 止めた管理者はログインもできなくする（画面の側でも毎回 staff.active を確かめている）
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "staff.update", targetType: "staff", targetId: userId, detail: { active } });
  revalidatePath("/admin/settings");
  return { ok: true, message: active ? "使えるようにしました" : "止めました" };
}
