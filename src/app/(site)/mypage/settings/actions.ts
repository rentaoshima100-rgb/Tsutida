"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isKana, tidyKana } from "@/lib/domain/kana";
import { requireMember } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { setMarketingConsent } from "@/lib/server/members";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// M09 会員情報・設定

const profileSchema = z.object({
  fullName: z.string().min(1, "お名前を入力してください").max(40),
  fullNameKana: z.string().refine(isKana, "ふりがなは、ひらがなかカタカナで入力してください"),
  phone: z.string().regex(/^[0-9０-９+\-－ ()（）]{10,15}$/, "電話番号を入力してください"),
  postalCode: z.string().regex(/^(\d{3}-?\d{4})?$/, "郵便番号は7桁で入力してください"),
  address: z.string().max(200),
});

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/settings");
  const values = {
    fullName: str(fd, "fullName"),
    fullNameKana: str(fd, "fullNameKana"),
    phone: str(fd, "phone").normalize("NFKC"),
    postalCode: str(fd, "postalCode").normalize("NFKC"),
    address: str(fd, "address"),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values };
  }
  const { error } = await createAdminClient()
    .from("members")
    .update({
      full_name: parsed.data.fullName,
      full_name_kana: tidyKana(parsed.data.fullNameKana),
      phone: parsed.data.phone,
      postal_code: parsed.data.postalCode || null,
      address: parsed.data.address || null,
    })
    .eq("id", member.id);
  if (error) return { message: "保存できませんでした", values };
  revalidatePath("/mypage", "layout");
  return { ok: true, message: "会員情報を保存しました", values };
}

const EMAIL_COOKIE = "pending_new_email";

export async function requestEmailChange(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireMember("/mypage/settings");
  const email = str(fd, "email").toLowerCase();
  if (!z.string().email().safeParse(email).success) return { errors: { email: "メールアドレスを正しく入力してください" }, values: { email } };
  const supabase = await createUserClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { message: "このメールアドレスには変更できません。別のアドレスをお試しください", values: { email } };
  (await cookies()).set(EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", maxAge: 3600, path: "/" });
  return { ok: true, values: { email } };
}

export async function confirmEmailChange(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/settings");
  const jar = await cookies();
  const email = jar.get(EMAIL_COOKIE)?.value;
  if (!email) return { message: "時間がたったため、手続きが切れました。もう一度新しいメールアドレスを入力してください" };
  const token = str(fd, "token").normalize("NFKC").replace(/\D/g, "");
  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email_change" });
  if (error) return { ok: true, errors: { token: "番号が違うか、有効期限（1時間）が過ぎています" }, values: { email } };
  await createAdminClient().from("members").update({ email, email_status: "ok", email_status_at: null }).eq("id", member.id);
  jar.delete(EMAIL_COOKIE);
  revalidatePath("/mypage", "layout");
  return { ok: true, message: "メールアドレスを変更しました", values: { email, done: "1" } };
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/settings");
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (next.length < 8) return { errors: { next: "パスワードは8文字以上にしてください" } };
  const supabase = await createUserClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: member.email, password: current });
  if (signInError) return { errors: { current: "いまのパスワードが違います" } };
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { errors: { next: "このパスワードは使えません。別のものにしてください" } };
  return { ok: true, message: "パスワードを変更しました" };
}

export async function updateConsent(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/settings");
  const optIn = fd.get("marketing") === "on";
  const settings = await getSettings();
  await setMarketingConsent({ memberId: member.id, optIn, source: "settings", wordingVersion: settings.consent_wording.version });
  revalidatePath("/mypage/settings");
  return { ok: true, message: optIn ? "お知らせを受け取る設定にしました" : "お知らせを止めました（ご注文に関するメールは届きます）" };
}

/** 退会（仮の扱い：ログインを止め、お知らせの同意を取り消し、withdrawn_at を入れる。14章） */
export async function withdraw(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/settings");
  if (fd.get("confirm") !== "on") return { message: "確認の欄にチェックを入れてください" };
  const admin = createAdminClient();
  const { data: open } = await admin
    .from("orders")
    .select("id, payment_status, items:order_items(fulfillment_status, canceled_at)")
    .eq("member_id", member.id)
    .in("payment_status", ["pending", "paid", "partially_refunded"]);
  const hasOpen = (open ?? []).some(
    (o) =>
      o.payment_status === "pending" ||
      o.items.some((i) => !i.canceled_at && (i.fulfillment_status === "accepted" || i.fulfillment_status === "in_production")),
  );
  if (hasOpen) return { message: "お支払い待ち、またはお届け前のご注文があるため、いまは退会できません。お届けのあとに手続きしてください" };

  await setMarketingConsent({ memberId: member.id, optIn: false, source: "withdrawal" });
  await admin.from("members").update({ withdrawn_at: new Date().toISOString() }).eq("id", member.id);
  await admin.auth.admin.updateUserById(member.id, { ban_duration: "876000h" });
  await writeAudit({ actorId: member.id, actorType: "member", action: "member.withdraw", targetType: "member", targetId: member.id });
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/?withdrawn=1");
}
