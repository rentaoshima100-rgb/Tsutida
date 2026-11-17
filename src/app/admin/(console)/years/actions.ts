"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { issueCodes } from "@/lib/server/codes";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// A04 年度の切り替え（6.3）

export async function copyClasses(schoolId: string, toYear: number): Promise<FormState> {
  const staff = await requireStaff();
  const { data, error } = await createAdminClient().rpc("copy_classes", { p_school_id: schoolId, p_from_year: toYear - 1, p_to_year: toYear });
  if (error) return { message: "コピーできませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "year.copy_classes", targetType: "school", targetId: schoolId, detail: { to_year: toYear, count: data } });
  revalidatePath("/admin/years");
  return { ok: true, message: `${data} クラスを作りました。人数を確かめてから、コードを発行してください` };
}

export async function issueForYear(schoolId: string, year: number): Promise<FormState> {
  const staff = await requireStaff();
  const admin = createAdminClient();
  const { data: classes } = await admin.from("classes").select("id, capacity").eq("school_id", schoolId).eq("fiscal_year", year);
  let total = 0;
  for (const c of classes ?? []) {
    const { count } = await admin.from("registration_codes").select("id", { count: "exact", head: true }).eq("class_id", c.id).eq("purpose", "normal").neq("status", "revoked");
    const need = c.capacity - (count ?? 0);
    if (need > 0) total += await issueCodes(c.id, need, "normal");
  }
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "code.issue", targetType: "school", targetId: schoolId, detail: { year, count: total } });
  revalidatePath("/admin/years");
  return { ok: true, message: total > 0 ? `${total} 件のコードを発行しました` : "発行が必要なクラスはありません（人数分を発行済みです）" };
}

export async function saveNewYearDate(_prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const date = str(fd, "date");
  if (!/^\d{2}-\d{2}$/.test(date)) return { message: "「04-10」の形で入力してください" };
  await createAdminClient().from("settings").upsert({ key: "new_year_mail_date", value: date, is_public: false, updated_by: staff.user_id });
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "settings.update", targetType: "settings", targetId: "new_year_mail_date", detail: { value: date } });
  revalidatePath("/admin/years");
  return { ok: true, message: "保存しました" };
}
