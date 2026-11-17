import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, inputClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJstCompact } from "@/lib/domain/time";

export const metadata: Metadata = { title: "会員" };

const EMAIL_STATUS = { ok: "", bounced: "届かない（宛先不明など）", complained: "迷惑メール報告" } as const;

// A13 会員：検索と閲覧、メールが届いていない会員の一覧
export default async function MembersPage(props: PageProps<"/admin/members">) {
  await requireStaff();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const bad = sp.email === "bad";
  const admin = createAdminClient();
  let query = admin.from("members").select("id, full_name, full_name_kana, email, phone, email_status, marketing_opt_in, withdrawn_at, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(200);
  if (bad) query = query.neq("email_status", "ok").is("withdrawn_at", null);
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, "")}%`;
    query = query.or(`full_name.ilike.${like},full_name_kana.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  const { data: members, count } = await query;
  return (
    <div className="space-y-4">
      <PageHeader title={bad ? "メールが届いていない会員" : "会員"} description={`${count ?? 0} 人${bad ? "。登録時の電話番号で連絡できます" : ""}`} />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">名前・ふりがな・メール・電話</span><input name="q" defaultValue={q} className={`${inputClass} w-72`} /></label>
        {bad ? <input type="hidden" name="email" value="bad" /> : null}
        <Button type="submit" variant="outline">検索</Button>
        <Link href={bad ? "/admin/members" : "/admin/members?email=bad"} className="px-2 text-brand underline">{bad ? "すべての会員" : "メールが届いていない会員"}</Link>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">名前</th><th>メール</th><th>電話</th><th>お知らせ</th><th className="px-3">登録日</th></tr></thead>
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.id} className="border-t">
                <td className="px-3 py-2"><Link href={`/admin/members/${m.id}`} className="font-bold text-brand underline">{m.full_name}</Link><span className="block text-xs text-muted-foreground">{m.full_name_kana}</span></td>
                <td>{m.email}{m.email_status !== "ok" ? <span className="block text-xs font-bold text-danger">{EMAIL_STATUS[m.email_status as keyof typeof EMAIL_STATUS]}</span> : null}{m.withdrawn_at ? <span className="block text-xs text-muted-foreground">退会済み</span> : null}</td>
                <td>{m.phone}</td>
                <td>{m.marketing_opt_in ? "受け取る" : "止めている"}</td>
                <td className="px-3">{formatJstCompact(m.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
