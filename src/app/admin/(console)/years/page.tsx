import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { fiscalYearOf } from "@/lib/domain/time";
import { copyClasses, issueForYear, saveNewYearDate } from "./actions";

export const metadata: Metadata = { title: "年度の切り替え" };

// A04 年度の切り替え：前年のクラスをコピー、新しいコードの発行、入力のお願いメールの日付
export default async function YearsPage(props: PageProps<"/admin/years">) {
  await requireStaff();
  const sp = await props.searchParams;
  const current = fiscalYearOf(new Date());
  const year = Number(sp.year ?? current + 1);
  const admin = createAdminClient();
  const settings = await getSettings();
  const [{ data: schools }, { data: classes }, { data: marker }] = await Promise.all([
    admin.from("schools").select("id, name").order("name"),
    admin.from("classes").select("id, school_id, fiscal_year, capacity").in("fiscal_year", [year - 1, year]),
    admin.from("settings").select("value").eq("key", "new_year_mail_sent_year").maybeSingle(),
  ]);
  const classIds = (classes ?? []).filter((c) => c.fiscal_year === year).map((c) => c.id);
  const { data: codes } = classIds.length
    ? await admin.from("registration_codes").select("class_id").in("class_id", classIds).eq("purpose", "normal").neq("status", "revoked")
    : { data: [] };

  return (
    <div className="space-y-5">
      <PageHeader
        title="年度の切り替え"
        description="毎年4月：前年のクラスをコピー → 人数を確かめる → 人数分のコードを発行・印刷 → 学校・園で配る → 設定した日に入力のお願いメールが届く"
        actions={<div className="flex gap-2 text-sm">{[year - 1, year + 1].map((y) => <Link key={y} href={`?year=${y}`} className="text-brand underline">{y}年度</Link>)}</div>}
      />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">学校・園</th><th className="text-right">{year - 1}年度のクラス</th><th className="text-right">{year}年度のクラス</th><th className="text-right">人数</th><th className="text-right">発行済みのコード</th><th className="px-3" /></tr></thead>
          <tbody>
            {(schools ?? []).map((s) => {
              const prev = (classes ?? []).filter((c) => c.school_id === s.id && c.fiscal_year === year - 1);
              const next = (classes ?? []).filter((c) => c.school_id === s.id && c.fiscal_year === year);
              const cap = next.reduce((n, c) => n + c.capacity, 0);
              const issued = (codes ?? []).filter((c) => next.some((n) => n.id === c.class_id)).length;
              return (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2"><Link href={`/admin/schools/${s.id}?year=${year}`} className="font-bold text-brand underline">{s.name}</Link></td>
                  <td className="text-right">{prev.length}</td>
                  <td className="text-right">{next.length}</td>
                  <td className="text-right">{cap}</td>
                  <td className="text-right">{issued}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      {prev.length > 0 ? (
                        <ActionForm action={copyClasses.bind(null, s.id, year)}><SubmitButton size="sm" variant="outline">前年のクラスをコピー</SubmitButton></ActionForm>
                      ) : null}
                      {next.length > 0 && issued < cap ? (
                        <ActionForm action={issueForYear.bind(null, s.id, year)} confirm={`${s.name} の ${year}年度のクラスに、人数分のコードを発行します。よろしいですか？`}><SubmitButton size="sm">人数分のコードを発行</SubmitButton></ActionForm>
                      ) : null}
                      {issued > 0 ? <Link href={`/admin/codes?school=${s.id}&year=${year}`} className="self-center text-xs text-brand underline">印刷へ</Link> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Panel title="新年度の入力のお願いメール">
        <ActionForm action={saveNewYearDate} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">毎年この日に全会員へ送る（月-日）</span><input name="date" defaultValue={settings.new_year_mail_date} className={`${inputClass} w-28`} /></label>
          <SubmitButton variant="outline">保存する</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-muted-foreground">
          {marker ? `${String(marker.value)}年度の分は送信済みです。` : "まだ送っていません。"}文面は「メール」の画面の「新年度の登録コードの入力のお願い」で編集できます。
        </p>
      </Panel>
    </div>
  );
}
