import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, selectClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { AUDIT_ACTION_LABEL } from "@/lib/server/audit";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJstCompact } from "@/lib/domain/time";

export const metadata: Metadata = { title: "操作の記録" };

// A17 操作の記録：誰がいつ何をしたか（注文の状態・返金・コードの再発行・つながりの解除・設定）
export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireStaff();
  const sp = await props.searchParams;
  const action = typeof sp.action === "string" ? sp.action : "";
  const page = Number(sp.page ?? 1);
  const admin = createAdminClient();
  let q = admin.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 100, page * 100 - 1);
  if (action) q = q.eq("action", action);
  const [{ data: logs, count }, { data: staff }] = await Promise.all([q, admin.from("staff").select("user_id, name")]);
  const memberIds = [...new Set((logs ?? []).filter((l) => l.actor_type === "member" && l.actor_id).map((l) => l.actor_id!))];
  const { data: members } = memberIds.length ? await admin.from("members").select("id, full_name").in("id", memberIds) : { data: [] };
  const actorName = (l: { actor_id: string | null; actor_type: string }) =>
    l.actor_type === "system" ? "自動処理" : l.actor_type === "member" ? `会員 ${members?.find((m) => m.id === l.actor_id)?.full_name ?? ""}` : (staff?.find((s) => s.user_id === l.actor_id)?.name ?? "管理者");
  const link = (t: string | null, id: string | null) => {
    if (!t || !id) return id;
    if (t === "order") return <Link href={`/admin/orders/${id}`} className="text-brand underline">{id}</Link>;
    if (t === "event") return <Link href={`/admin/events/${id}`} className="text-brand underline">行事</Link>;
    if (t === "member") return <Link href={`/admin/members/${id}`} className="text-brand underline">会員</Link>;
    return <span className="font-mono text-xs">{id.slice(0, 36)}</span>;
  };
  return (
    <div className="space-y-4">
      <PageHeader title="操作の記録" description={`${count ?? 0} 件（消したり書き換えたりできない記録です）`} />
      <form className="flex items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">操作</span>
          <select name="action" defaultValue={action} className={selectClass}><option value="">すべて</option>{Object.entries(AUDIT_ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <Button type="submit" variant="outline">絞り込む</Button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">日時</th><th>だれが</th><th>操作</th><th>対象</th><th className="px-3">内容</th></tr></thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{formatJstCompact(l.created_at)}</td>
                <td>{actorName(l)}</td>
                <td>{AUDIT_ACTION_LABEL[l.action] ?? l.action}</td>
                <td>{link(l.target_type, l.target_id)}</td>
                <td className="px-3 py-2">
                  <details><summary className="cursor-pointer text-xs text-muted-foreground">くわしく</summary><pre className="mt-1 min-w-64 max-w-xl overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(l.detail, null, 2)}</pre></details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link href={`?action=${action}&page=${page - 1}`} className="underline">新しい100件</Link> : <span />}
        {(count ?? 0) > page * 100 ? <Link href={`?action=${action}&page=${page + 1}`} className="underline">古い100件</Link> : null}
      </div>
    </div>
  );
}
