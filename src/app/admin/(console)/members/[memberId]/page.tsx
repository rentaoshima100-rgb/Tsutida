import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, PaymentBadge } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { formatJstCompact } from "@/lib/domain/time";
import { resetEmailStatus, revokeMemberLink } from "./actions";

export const metadata: Metadata = { title: "会員の詳細" };

const SOURCE: Record<string, string> = { signup: "会員登録", settings: "会員情報の画面", unsubscribe_link: "配信停止のリンク", complaint: "迷惑メール報告", withdrawal: "退会", admin: "管理者" };

// A13 会員の詳細：登録内容・つながっているお子さま・注文履歴、つながりの解除
export default async function MemberPage(props: PageProps<"/admin/members/[memberId]">) {
  await requireStaff();
  const { memberId } = await props.params;
  const admin = createAdminClient();
  const { data: m } = await admin.from("members").select("*").eq("id", memberId).maybeSingle();
  if (!m) notFound();
  const [{ data: links }, { data: orders }, { data: consents }, { data: mails }] = await Promise.all([
    admin.from("member_children").select("id, fiscal_year, linked_at, revoked_at, child:children!inner(id, full_name, full_name_kana)").eq("member_id", memberId).order("fiscal_year", { ascending: false }),
    admin.from("orders").select("order_no, created_at, total, payment_status, event:events!inner(name)").eq("member_id", memberId).neq("payment_status", "draft").order("created_at", { ascending: false }),
    admin.from("marketing_consents").select("*").eq("member_id", memberId).order("created_at"),
    admin.from("email_messages").select("id, subject, status, queued_at, error").eq("member_id", memberId).order("queued_at", { ascending: false }).limit(30),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title={m.full_name} description={`${m.full_name_kana}　登録 ${formatJstCompact(m.created_at)}${m.withdrawn_at ? `　退会 ${formatJstCompact(m.withdrawn_at)}` : ""}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="登録内容">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">メール</dt><dd>{m.email}{m.email_status !== "ok" ? <span className="ml-2 font-bold text-danger">{m.email_status === "bounced" ? "届かない" : "迷惑メール報告"}（{m.email_status_at ? formatJstCompact(m.email_status_at) : ""}）</span> : null}</dd>
            <dt className="text-muted-foreground">電話</dt><dd>{m.phone}</dd>
            <dt className="text-muted-foreground">住所</dt><dd>{m.postal_code ? `〒${m.postal_code} ` : ""}{m.address}</dd>
            <dt className="text-muted-foreground">お知らせ</dt><dd>{m.marketing_opt_in ? "受け取る" : "止めている"}</dd>
          </dl>
          {m.email_status !== "ok" ? (
            <ActionForm action={resetEmailStatus.bind(null, m.id)} confirm="メールが届くようになったことを確かめましたか？" className="mt-3"><SubmitButton size="sm" variant="outline">メールの状態を「届く」に戻す</SubmitButton></ActionForm>
          ) : null}
          {(consents ?? []).length > 0 ? (
            <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              {consents!.map((c) => <li key={c.id}>{formatJstCompact(c.created_at)}　{c.action === "grant" ? "同意" : "取り消し"}（{SOURCE[c.source] ?? c.source}{c.wording_version ? `・${c.wording_version}` : ""}）</li>)}
            </ul>
          ) : null}
        </Panel>
        <Panel title="つながっているお子さま">
          <ul className="space-y-2 text-sm">
            {(links ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span className={l.revoked_at ? "text-muted-foreground line-through" : ""}>{l.fiscal_year}年度　{l.child.full_name}（{l.child.full_name_kana}）</span>
                {!l.revoked_at ? (
                  <ActionForm action={revokeMemberLink.bind(null, m.id, l.id)} confirm={`${l.child.full_name} さんとのつながりを解除します。よろしいですか？`}><button className="text-xs text-danger underline">解除</button></ActionForm>
                ) : <span className="text-xs text-muted-foreground">解除済み</span>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="注文">
        <table className="w-full text-sm">
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.order_no} className="border-t first:border-t-0">
                <td className="py-2"><Link href={`/admin/orders/${o.order_no}`} className="font-mono text-brand underline">{o.order_no}</Link></td>
                <td>{formatJstCompact(o.created_at)}</td>
                <td>{o.event.name}</td>
                <td className="text-right">{formatYen(o.total)}</td>
                <td className="pl-3"><PaymentBadge status={o.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {(orders ?? []).length === 0 ? <p className="text-sm text-muted-foreground">注文はありません。</p> : null}
      </Panel>
      <Panel title="送ったメール（新しい30通）">
        <ul className="space-y-1 text-sm">
          {(mails ?? []).map((x) => <li key={x.id}><span className="text-muted-foreground">{formatJstCompact(x.queued_at)}</span>　{x.subject}　<span className="font-bold">{x.status}</span>{x.error ? <span className="text-danger">　{x.error}</span> : null}</li>)}
        </ul>
      </Panel>
    </div>
  );
}
