"use server";

import { revalidatePath } from "next/cache";
import { normalizeCode } from "@/lib/domain/codes";
import { isKana, tidyKana } from "@/lib/domain/kana";
import { requireMember } from "@/lib/server/auth";
import { notifyAccountLinked, requestIpHash } from "@/lib/server/children";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

const MESSAGES: Record<string, string> = {
  already_linked: "このお子さまは、すでに登録されています。",
  needs_name: "お子さまのお名前とふりがなを入力してください。",
  invalid: "コードが見つかりません。カードの文字をもう一度確かめてください。",
  revoked: "このコードは使えなくなっています（再発行されています）。新しいカードのコードを入力してください。",
  name_mismatch:
    "ふりがなが、このコードのお子さまと一致しません。ご家族が先に登録したときと同じ、お子さまのふりがなを入力してください。",
  already_enrolled: "選んだお子さまには、この年度の別のコードがすでに登録されています。",
  child_not_linked: "お子さまを選び直してください。",
  member_not_found: "会員の情報が見つかりません。ログインし直してください。",
};

// M08 登録コードの入力
export async function registerChildCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const member = await requireMember("/mypage/children");
  const values = {
    code: str(fd, "code"),
    fullName: str(fd, "fullName"),
    fullNameKana: str(fd, "fullNameKana"),
    target: str(fd, "target"),
  };
  const code = normalizeCode(values.code);
  if (!code) return { errors: { code: "コードは12文字です（ハイフンは入れなくても大丈夫です）" }, values };

  const admin = createAdminClient();
  let kana = values.fullNameKana;
  let targetChildId: string | null = null;
  if (values.target && values.target !== "new") {
    // 新年度のコード：選んだお子さまのふりがなで照合する
    const { data: link } = await admin
      .from("member_children")
      .select("child:children!inner(id, full_name_kana)")
      .eq("member_id", member.id)
      .eq("child_id", values.target)
      .is("revoked_at", null)
      .limit(1)
      .maybeSingle();
    if (!link) return { message: MESSAGES.child_not_linked, values };
    targetChildId = link.child.id;
    kana = link.child.full_name_kana;
  } else {
    if (!values.fullName) return { errors: { fullName: "お子さまのお名前を入力してください" }, values };
    if (!isKana(values.fullNameKana)) {
      return { errors: { fullNameKana: "ふりがなは、ひらがなかカタカナで入力してください" }, values };
    }
  }

  const settings = await getSettings();
  const { data: result, error } = await admin.rpc("register_code", {
    p_member_id: member.id,
    p_code: code,
    p_full_name: values.fullName || "",
    p_full_name_kana: tidyKana(kana),
    p_target_child_id: targetChildId as string,
    p_ip_hash: (await requestIpHash()) as string,
    p_max_accounts: settings.max_accounts_per_child,
    p_max_failures: settings.code_attempt_limit.max_failures,
    p_window: `${settings.code_attempt_limit.window_minutes} minutes`,
  });
  if (error) {
    console.error("[register_code]", error.message);
    return { message: "登録できませんでした。時間をおいて、もう一度お試しください", values };
  }
  const r = result as { result: string; child_id?: string; fiscal_year?: number; notify_member_ids?: string[] };
  if (r.result === "linked") {
    await notifyAccountLinked({
      childId: r.child_id!,
      fiscalYear: r.fiscal_year!,
      newMemberId: member.id,
      notifyMemberIds: r.notify_member_ids ?? [],
    });
    revalidatePath("/mypage/children");
    revalidatePath("/events");
    return { ok: true, message: "お子さまを登録しました。対象の行事が「販売中の行事」に表示されます。" };
  }
  if (r.result === "limit_reached") {
    return {
      message: `このお子さまにつなげられるアカウントの数（${settings.max_accounts_per_child}つ）に達しています。お問い合わせください。`,
      values,
    };
  }
  if (r.result === "locked") {
    return {
      message: `入力の間違いが続いたため、${settings.code_attempt_limit.window_minutes}分ほど入力できません。時間をおいてお試しください。`,
      values,
    };
  }
  return { message: MESSAGES[r.result] ?? "登録できませんでした", values, ok: r.result === "already_linked" ? true : undefined };
}
