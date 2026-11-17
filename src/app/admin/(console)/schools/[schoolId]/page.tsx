import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { fiscalYearOf } from "@/lib/domain/time";
import { saveClass, saveSchool } from "../actions";

export const metadata: Metadata = { title: "学校・園の詳細" };

// A02 学校・園の詳細：名前・種別・住所・メモ、年度ごとの学年・クラス名と人数
export default async function SchoolPage(props: PageProps<"/admin/schools/[schoolId]">) {
  await requireStaff();
  const { schoolId } = await props.params;
  const sp = await props.searchParams;
  const admin = createAdminClient();
  const { data: school } = await admin.from("schools").select("*").eq("id", schoolId).maybeSingle();
  if (!school) notFound();
  const current = fiscalYearOf(new Date());
  const year = Number(sp.year ?? current);
  const { data: classes } = await admin.from("classes").select("*").eq("school_id", schoolId).eq("fiscal_year", year).order("grade_order").order("name");
  return (
    <div className="space-y-5">
      <PageHeader title={school.name} actions={<Link href={`/admin/codes?school=${school.id}&year=${year}`} className="text-sm text-brand underline">登録コードを見る</Link>} />
      <Panel title="基本の情報">
        <ActionForm action={saveSchool.bind(null, school.id)} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">名前</span><input name="name" defaultValue={school.name} className={`${inputClass} w-full`} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">種別</span>
            <select name="kind" defaultValue={school.kind} className={`${selectClass} w-full`}><option value="preschool">幼稚園・保育園・こども園</option><option value="elementary">小学校</option></select>
          </label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">住所</span><input name="address" defaultValue={school.address ?? ""} className={`${inputClass} w-full`} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">メモ</span><input name="memo" defaultValue={school.memo ?? ""} className={`${inputClass} w-full`} /></label>
          <div><SubmitButton variant="outline">保存する</SubmitButton></div>
        </ActionForm>
      </Panel>
      <Panel
        title={`${year}年度の学年・クラス`}
        actions={
          <div className="flex gap-2 text-sm">
            {[year - 1, year + 1].map((y) => <Link key={y} href={`?year=${y}`} className="text-brand underline">{y}年度</Link>)}
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">学年</th><th>並び順</th><th>クラス名</th><th>人数（コードの発行数）</th><th /></tr></thead>
          <tbody>
            {(classes ?? []).map((c) => (
              <tr key={c.id} className="border-t">
                <td colSpan={5} className="py-1.5">
                  <ActionForm action={saveClass.bind(null, school.id, c.id)} className="grid grid-cols-[1fr_5rem_1fr_7rem_auto] items-center gap-2">
                    <input type="hidden" name="fiscalYear" value={year} />
                    <input name="gradeLabel" defaultValue={c.grade_label} className={inputClass} aria-label="学年" />
                    <input name="gradeOrder" type="number" defaultValue={c.grade_order} className={inputClass} aria-label="並び順" />
                    <input name="name" defaultValue={c.name} className={inputClass} aria-label="クラス名" />
                    <input name="capacity" type="number" defaultValue={c.capacity} className={inputClass} aria-label="人数" />
                    <SubmitButton size="sm" variant="outline">保存</SubmitButton>
                  </ActionForm>
                </td>
              </tr>
            ))}
            <tr className="border-t">
              <td colSpan={5} className="py-2">
                <ActionForm action={saveClass.bind(null, school.id, null)} className="grid grid-cols-[1fr_5rem_1fr_7rem_auto] items-center gap-2">
                  <input type="hidden" name="fiscalYear" value={year} />
                  <input name="gradeLabel" placeholder="例：年長" className={inputClass} aria-label="学年" />
                  <input name="gradeOrder" type="number" placeholder="3" className={inputClass} aria-label="並び順" />
                  <input name="name" placeholder="例：きりん組" className={inputClass} aria-label="クラス名" />
                  <input name="capacity" type="number" placeholder="20" className={inputClass} aria-label="人数" />
                  <SubmitButton size="sm">追加</SubmitButton>
                </ActionForm>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
