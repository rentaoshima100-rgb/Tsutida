"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { createAdminClient } from "@/lib/supabase/server";
import { str, type FormState } from "@/lib/form";

// A02 学校・園と、年度ごとの学年・クラス

const schoolSchema = z.object({
  name: z.string().min(1, "名前を入力してください").max(60),
  kind: z.enum(["preschool", "elementary"]),
  address: z.string().max(200),
  memo: z.string().max(2000),
});

export async function saveSchool(schoolId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = schoolSchema.safeParse({ name: str(fd, "name"), kind: str(fd, "kind"), address: str(fd, "address"), memo: str(fd, "memo") });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const admin = createAdminClient();
  const row = { name: parsed.data.name, kind: parsed.data.kind, address: parsed.data.address || null, memo: parsed.data.memo || null };
  if (schoolId) {
    const { error } = await admin.from("schools").update(row).eq("id", schoolId);
    if (error) return { message: "保存できませんでした" };
    await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "school.update", targetType: "school", targetId: schoolId, detail: row });
    revalidatePath(`/admin/schools/${schoolId}`);
    return { ok: true, message: "保存しました" };
  }
  const { data, error } = await admin.from("schools").insert(row).select("id").single();
  if (error) return { message: "登録できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "school.create", targetType: "school", targetId: data.id, detail: row });
  revalidatePath("/admin/schools");
  return { ok: true, message: `「${row.name}」を登録しました` };
}

const classSchema = z.object({
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  gradeLabel: z.string().min(1, "学年を入力してください").max(20),
  gradeOrder: z.coerce.number().int().min(0).max(20),
  name: z.string().min(1, "クラス名を入力してください").max(20),
  capacity: z.coerce.number().int().min(0).max(300),
});

export async function saveClass(schoolId: string, classId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = classSchema.safeParse({
    fiscalYear: str(fd, "fiscalYear"),
    gradeLabel: str(fd, "gradeLabel"),
    gradeOrder: str(fd, "gradeOrder") || "0",
    name: str(fd, "name"),
    capacity: str(fd, "capacity") || "0",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const row = {
    school_id: schoolId,
    fiscal_year: parsed.data.fiscalYear,
    grade_label: parsed.data.gradeLabel,
    grade_order: parsed.data.gradeOrder,
    name: parsed.data.name,
    capacity: parsed.data.capacity,
  };
  const admin = createAdminClient();
  const { error } = classId ? await admin.from("classes").update(row).eq("id", classId) : await admin.from("classes").insert(row);
  if (error) return { message: error.code === "23505" ? "同じ年度・学年・クラス名のクラスがあります" : "保存できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "class.save", targetType: "school", targetId: schoolId, detail: row });
  revalidatePath(`/admin/schools/${schoolId}`);
  return { ok: true, message: "保存しました" };
}
