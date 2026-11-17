import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCode } from "@/lib/domain/codes";
import { fiscalYearOf } from "@/lib/domain/time";
import { getSettings } from "@/lib/server/settings";
import { issue, reissue, revoke, revokeLink } from "./actions";

export const metadata: Metadata = { title: "登録コード" };

const STATUS = { unused: "未使用", active: "使用中", revoked: "無効" } as const;
const PURPOSE = { normal: "", spare: "予備", review: "審査用" } as const;

// A03 登録コード：クラスごとに人数分を発行、カードPDF、使用状況、再発行・無効化、つながりの解除、予備コード
export default async function CodesPage(props: PageProps<"/admin/codes">) {
  await requireStaff();
  const sp = await props.searchParams;
  const admin = createAdminClient();
  const settings = await getSettings();
  const year = Number(sp.year ?? fiscalYearOf(new Date()));
  const { data: schools } = await admin.from("schools").select("id, name").order("name");
  const schoolId = typeof sp.school === "string" ? sp.school : (schools?.[0]?.id ?? "");
  const { data: classes } = schoolId
    ? await admin.from("classes").select("id, grade_label, name, grade_order, capacity").eq("school_id", schoolId).eq("fiscal_year", year).order("grade_order").order("name")
    : { data: [] };
  const classId = typeof sp.class === "string" ? sp.class : (classes?.[0]?.id ?? "");
  const klass = (classes ?? []).find((c) => c.id === classId);

  const { data: codes } = classId
    ? await admin.from("registration_codes").select("id, code, serial_no, status, purpose, issued_at, child:children(id, full_name, full_name_kana)").eq("class_id", classId).order("serial_no")
    : { data: [] };
  const childIds = (codes ?? []).map((c) => c.child?.id).filter((v): v is string => Boolean(v));
  const { data: links } = childIds.length
    ? await admin.from("member_children").select("id, child_id, linked_at, member:members(id, full_name, email)").in("child_id", childIds).eq("fiscal_year", year).is("revoked_at", null)
    : { data: [] };

  const normalCount = (codes ?? []).filter((c) => c.purpose === "normal" && c.status !== "revoked").length;
  const suggested = Math.max(0, (klass?.capacity ?? 0) - normalCount);

  return (
    <div className="space-y-5">
      <PageHeader title="登録コード" description="カードにお子さまの名前は印字しません。コードを無効にしても、すでにつながった会員はそのままです。" />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">学校・園</span>
          <select name="school" defaultValue={schoolId} className={selectClass}>{(schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">年度</span><input name="year" type="number" defaultValue={year} className={`${inputClass} w-24`} /></label>
        <Button type="submit" variant="outline">表示</Button>
      </form>
      {(classes ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">この年度のクラスがありません。<Link href={`/admin/schools/${schoolId}?year=${year}`} className="text-brand underline">学校・園の画面</Link>でクラスを作ってください。</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(classes ?? []).map((c) => (
            <Link key={c.id} href={`?school=${schoolId}&year=${year}&class=${c.id}`} className={`rounded-lg border px-3 py-1.5 text-sm ${c.id === classId ? "border-brand bg-brand text-white" : "bg-white"}`}>
              {c.grade_label} {c.name}
            </Link>
          ))}
        </div>
      )}

      {klass ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="発行する">
              <ActionForm action={issue.bind(null, klass.id)} className="flex flex-wrap items-end gap-2 text-sm">
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">枚数</span><input name="count" type="number" min={1} max={300} defaultValue={suggested || 1} className={`${inputClass} w-24`} /></label>
                <label className="space-y-1"><span className="block text-xs text-muted-foreground">種類</span>
                  <select name="purpose" className={selectClass}><option value="normal">通常</option><option value="spare">予備（転入・紛失用）</option><option value="review">審査用</option></select>
                </label>
                <SubmitButton>発行する</SubmitButton>
              </ActionForm>
              <p className="mt-2 text-xs text-muted-foreground">クラスの人数 {klass.capacity}人／発行済み（通常）{normalCount}件</p>
            </Panel>
            <Panel title="カードを印刷する（A4・10枚ずつ）">
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><a href={`/api/admin/codes/cards?classId=${klass.id}`} target="_blank" rel="noopener">このクラスの全部</a></Button>
                <Button asChild variant="outline"><a href={`/api/admin/codes/cards?classId=${klass.id}&unused=1`} target="_blank" rel="noopener">未使用だけ</a></Button>
              </div>
            </Panel>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">No.</th><th>コード</th><th>状態</th><th>お子さま</th><th>つながっている会員（{year}年度・上限{settings.max_accounts_per_child}）</th><th className="px-3" /></tr></thead>
              <tbody>
                {(codes ?? []).map((c) => {
                  const ls = (links ?? []).filter((l) => l.child_id === c.child?.id);
                  return (
                    <tr key={c.id} className="border-t align-top">
                      <td className="px-3 py-2">{String(c.serial_no).padStart(6, "0")}</td>
                      <td className="font-mono">{formatCode(c.code)}{PURPOSE[c.purpose as keyof typeof PURPOSE] ? <span className="ml-1 rounded bg-surface px-1 text-xs">{PURPOSE[c.purpose as keyof typeof PURPOSE]}</span> : null}</td>
                      <td>{STATUS[c.status as keyof typeof STATUS]}</td>
                      <td>{c.child ? <>{c.child.full_name}<span className="block text-xs text-muted-foreground">{c.child.full_name_kana}</span></> : "—"}</td>
                      <td>
                        {c.status === "revoked" ? null : ls.map((l) => (
                          <div key={l.id} className="flex items-center gap-2">
                            <Link href={`/admin/members/${l.member?.id}`} className="text-brand underline">{l.member?.full_name}</Link>
                            <ActionForm action={revokeLink.bind(null, l.id)} confirm={`${l.member?.full_name} さんのつながりを解除します。よろしいですか？`}>
                              <button className="text-xs text-danger underline">解除</button>
                            </ActionForm>
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        {c.status !== "revoked" ? (
                          <div className="flex flex-wrap gap-1">
                            <a href={`/api/admin/codes/cards?id=${c.id}`} target="_blank" rel="noopener" className="text-xs text-brand underline">印刷</a>
                            <ActionForm action={reissue.bind(null, c.id)} confirm="このコードを無効にし、同じお子さまの新しいコードを発行します（紛失のとき）。よろしいですか？"><button className="text-xs text-brand underline">再発行</button></ActionForm>
                            <ActionForm action={revoke.bind(null, c.id)} confirm="このコードを無効にします。よろしいですか？"><button className="text-xs text-danger underline">無効にする</button></ActionForm>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(codes ?? []).length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">まだ発行していません。</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
