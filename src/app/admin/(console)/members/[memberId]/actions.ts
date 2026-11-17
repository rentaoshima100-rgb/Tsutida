"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { createAdminClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/form";

export async function revokeMemberLink(memberId: string, linkId: string): Promise<FormState> {
  const staff = await requireStaff();
  const { data } = await createAdminClient()
    .from("member_children")
    .update({ revoked_at: new Date().toISOString(), revoked_by: staff.user_id })
    .eq("id", linkId)
    .eq("member_id", memberId)
    .is("revoked_at", null)
    .select("child_id, fiscal_year");
  if (!data?.length) return { message: "解除できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "member.link_revoke", targetType: "member", targetId: memberId, detail: data[0] });
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true, message: "つながりを解除しました" };
}

/** メールが届くようになったことを確かめたら、状態を戻す */
export async function resetEmailStatus(memberId: string): Promise<FormState> {
  const staff = await requireStaff();
  await createAdminClient().from("members").update({ email_status: "ok", email_status_at: null }).eq("id", memberId);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "member.consent", targetType: "member", targetId: memberId, detail: { email_status: "ok" } });
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true, message: "メールの状態を「届く」に戻しました" };
}
