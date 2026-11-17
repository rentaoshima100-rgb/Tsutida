import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { SCHOOL_KIND_LABEL } from "@/lib/domain/status";
import { fiscalYearOf } from "@/lib/domain/time";
import { saveSchool } from "./actions";

export const metadata: Metadata = { title: "学校・園" };

// A02 学校・園の一覧と登録
export default async function SchoolsPage() {
  await requireStaff();
  const admin = createAdminClient();
  const fy = fiscalYearOf(new Date());
  const [{ data: schools }, { data: classes }] = await Promise.all([
    admin.from("schools").select("*").order("name"),
    admin.from("classes").select("school_id, capacity").eq("fiscal_year", fy),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="学校・園" description={`クラスと人数は ${fy}年度 の値です`} />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">名前</th><th>種別</th><th className="text-right">クラス</th><th className="px-3 text-right">人数</th></tr></thead>
          <tbody>
            {(schools ?? []).map((s) => {
              const cs = (classes ?? []).filter((c) => c.school_id === s.id);
              return (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2"><Link href={`/admin/schools/${s.id}`} className="font-bold text-brand underline">{s.name}</Link></td>
                  <td>{SCHOOL_KIND_LABEL[s.kind as "preschool" | "elementary"]}</td>
                  <td className="text-right">{cs.length}</td>
                  <td className="px-3 text-right">{cs.reduce((n, c) => n + c.capacity, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Panel title="学校・園を登録する">
        <ActionForm action={saveSchool.bind(null, null)} className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">名前</span><input name="name" className={`${inputClass} w-full`} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">種別</span>
            <select name="kind" className={`${selectClass} w-full`}><option value="preschool">幼稚園・保育園・こども園</option><option value="elementary">小学校</option></select>
          </label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">住所</span><input name="address" className={`${inputClass} w-full`} /></label>
          <label className="space-y-1 sm:col-span-2"><span className="block text-xs text-muted-foreground">メモ</span><input name="memo" className={`${inputClass} w-full`} /></label>
          <div><SubmitButton>登録する</SubmitButton></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
