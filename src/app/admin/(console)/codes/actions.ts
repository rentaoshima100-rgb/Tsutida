"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { issueCodes, reissueCode } from "@/lib/server/codes";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// A03 登録コード：発行・再発行・無効化・つながりの解除

export async function issue(classId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const count = Number(str(fd, "count"));
  const purpose = (str(fd, "purpose") || "normal") as "normal" | "spare" | "review";
  try {
    const n = await issueCodes(classId, count, purpose);
    await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "code.issue", targetType: "class", targetId: classId, detail: { count: n, purpose } });
    revalidatePath("/admin/codes");
    return { ok: true, message: `${n} 件のコードを発行しました` };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "発行できませんでした" };
  }
}

export async function reissue(codeId: string): Promise<FormState> {
  const staff = await requireStaff();
  try {
    const newId = await reissueCode(codeId);
    await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "code.reissue", targetType: "code", targetId: codeId, detail: { new_code_id: newId } });
    revalidatePath("/admin/codes");
    return { ok: true, message: "再発行しました。新しいカードを印刷してお渡しください" };
  } catch {
    return { message: "再発行できませんでした" };
  }
}

export async function revoke(codeId: string): Promise<FormState> {
  const staff = await requireStaff();
  const { data, error } = await createAdminClient()
    .from("registration_codes")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", codeId)
    .neq("status", "revoked")
    .select("id");
  if (error || !data?.length) return { message: "無効にできませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "code.revoke", targetType: "code", targetId: codeId });
  revalidatePath("/admin/codes");
  return { ok: true, message: "無効にしました。すでにつながっている会員はそのままです" };
}

export async function revokeLink(linkId: string): Promise<FormState> {
  const staff = await requireStaff();
  const { data, error } = await createAdminClient()
    .from("member_children")
    .update({ revoked_at: new Date().toISOString(), revoked_by: staff.user_id })
    .eq("id", linkId)
    .is("revoked_at", null)
    .select("member_id, child_id, fiscal_year");
  if (error || !data?.length) return { message: "解除できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "link.revoke", targetType: "member_child", targetId: linkId, detail: data[0] });
  revalidatePath("/admin/codes");
  revalidatePath("/admin/members");
  return { ok: true, message: "つながりを解除しました" };
}
