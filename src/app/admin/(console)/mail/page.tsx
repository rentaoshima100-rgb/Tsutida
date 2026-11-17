import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { placeholders } from "@/lib/server/mail/render";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJstCompact } from "@/lib/domain/time";
import { saveTemplate, sendAdminMessage } from "./actions";

export const metadata: Metadata = { title: "メール" };

const TEMPLATE_LABEL: Record<string, string> = {
  account_linked: "家族のアカウントがつながった", sale_started: "販売開始のお知らせ", deadline_d3: "締切3日前のお知らせ", deadline_d1: "締切前日のお知らせ",
  deadline_extended: "締切延長のお知らせ", late_order_open: "締切後の受付のお知らせ", order_completed: "注文完了（カード・PayPay）", payment_instructions: "お支払いのご案内",
  payment_due_reminder: "支払期限の前日", payment_received: "入金の確認", order_auto_canceled: "支払期限切れの取り消し", order_canceled: "キャンセル・返金の完了",
  event_canceled: "行事・商品の中止", shipped: "発送のお知らせ", delivered_to_school: "学校・園への納品", new_year_code: "新年度の登録コードの入力のお願い",
  admin_message: "個別のお知らせ", contact_received: "お問い合わせ（ツチダ映像あて）", staff_alert: "管理者・保守への知らせ",
};
const STATUS: Record<string, string> = { queued: "送信待ち", sent: "送信済み", delivered: "届いた", bounced: "届かなかった", complained: "迷惑メール報告", failed: "送れなかった" };
const TABS = [["templates", "文面"], ["history", "送信予定と履歴"], ["problems", "届かなかったメールと配信停止"], ["send", "個別のお知らせ"]] as const;

// A14 メール：テンプレートの編集、送信予定と送信履歴、届かなかったメールと配信停止の状況、個別のお知らせ
export default async function MailPage(props: PageProps<"/admin/mail">) {
  await requireStaff();
  const sp = await props.searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "templates";
  const admin = createAdminClient();

  return (
    <div className="space-y-4">
      <PageHeader title="メール" description="お知らせ（販売開始・締切前など）は、同意した会員にだけ、配信停止のリンクと送信者の名称・住所を付けて送ります（末尾は自動で付きます）" />
      <nav className="flex flex-wrap gap-1.5 text-sm">
        {TABS.map(([k, label]) => <Link key={k} href={`?tab=${k}`} className={`rounded-lg border px-3 py-1.5 ${tab === k ? "border-brand bg-brand text-white" : "bg-white"}`}>{label}</Link>)}
      </nav>

      {tab === "templates" ? await (async () => {
        const { data: templates } = await admin.from("email_templates").select("*").order("key");
        const key = typeof sp.key === "string" ? sp.key : "";
        const t = (templates ?? []).find((x) => x.key === key);
        return (
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <ul className="space-y-1 text-sm">
              {(templates ?? []).map((x) => (
                <li key={x.key}><Link href={`?tab=templates&key=${x.key}`} className={`block rounded-md px-2 py-1.5 ${x.key === key ? "bg-brand text-white" : "hover:bg-accent"}`}>{TEMPLATE_LABEL[x.key] ?? x.key}{x.is_marketing ? <span className="ml-1 text-xs opacity-80">（お知らせ）</span> : null}</Link></li>
              ))}
            </ul>
            {t ? (
              <Panel title={TEMPLATE_LABEL[t.key] ?? t.key}>
                <ActionForm action={saveTemplate.bind(null, t.key)} className="space-y-3 text-sm">
                  <label className="block space-y-1"><span className="text-xs text-muted-foreground">件名</span><input name="subject" defaultValue={t.subject} className={`${inputClass} w-full`} /></label>
                  <label className="block space-y-1"><span className="text-xs text-muted-foreground">本文（末尾の連絡先と配信停止のリンクは自動で付きます）</span><textarea name="body" defaultValue={t.body} rows={18} className="w-full rounded-md border border-input bg-white p-2.5 font-mono text-xs leading-relaxed" /></label>
                  <p className="text-xs text-muted-foreground">使える差し込み：{[...new Set([...placeholders(t.subject), ...placeholders(t.body)])].map((p) => `{{${p}}}`).join("　")}</p>
                  <SubmitButton>保存する</SubmitButton>
                </ActionForm>
              </Panel>
            ) : <p className="text-sm text-muted-foreground">左から文面を選んでください。</p>}
          </div>
        );
      })() : null}

      {tab === "history" ? await (async () => {
        const status = typeof sp.status === "string" ? sp.status : "";
        let q = admin.from("email_messages").select("id, template_key, to_email, subject, status, queued_at, sent_at, error").order("queued_at", { ascending: false }).limit(200);
        if (status) q = q.eq("status", status);
        const { data: mails } = await q;
        return (
          <>
            <form className="flex items-end gap-2 text-sm"><input type="hidden" name="tab" value="history" />
              <select name="status" defaultValue={status} className={selectClass}><option value="">すべて</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <SubmitButton variant="outline" size="sm">絞り込む</SubmitButton>
            </form>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-surface text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">日時</th><th>種類</th><th>宛先</th><th>件名</th><th className="px-3">状態</th></tr></thead>
                <tbody>
                  {(mails ?? []).map((m) => (
                    <tr key={m.id} className="border-t align-top">
                      <td className="whitespace-nowrap px-3 py-2">{formatJstCompact(m.sent_at ?? m.queued_at)}</td>
                      <td>{TEMPLATE_LABEL[m.template_key] ?? m.template_key}</td>
                      <td>{m.to_email}</td>
                      <td>{m.subject}</td>
                      <td className="px-3">{STATUS[m.status] ?? m.status}{m.error ? <span className="block text-xs text-danger">{m.error}</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })() : null}

      {tab === "problems" ? await (async () => {
        const [{ data: bad }, { data: revoked }] = await Promise.all([
          admin.from("members").select("id, full_name, email, phone, email_status, email_status_at").neq("email_status", "ok").is("withdrawn_at", null).order("email_status_at", { ascending: false }).limit(200),
          admin.from("marketing_consents").select("created_at, source, member:members!inner(id, full_name, email)").eq("action", "revoke").order("created_at", { ascending: false }).limit(100),
        ]);
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="メールが届いていない会員">
              <ul className="space-y-1.5 text-sm">
                {(bad ?? []).map((m) => <li key={m.id}><Link href={`/admin/members/${m.id}`} className="text-brand underline">{m.full_name}</Link>　{m.email}　<span className="text-danger">{m.email_status === "bounced" ? "届かない" : "迷惑メール報告"}</span>　{m.phone}</li>)}
                {(bad ?? []).length === 0 ? <li className="text-muted-foreground">ありません</li> : null}
              </ul>
            </Panel>
            <Panel title="お知らせを止めた会員（新しい順）">
              <ul className="space-y-1.5 text-sm">
                {(revoked ?? []).map((r, i) => <li key={i}>{formatJstCompact(r.created_at)}　<Link href={`/admin/members/${r.member.id}`} className="text-brand underline">{r.member.full_name}</Link>（{r.source === "unsubscribe_link" ? "配信停止のリンク" : r.source === "complaint" ? "迷惑メール報告" : r.source === "withdrawal" ? "退会" : "会員情報の画面"}）</li>)}
              </ul>
            </Panel>
          </div>
        );
      })() : null}

      {tab === "send" ? await (async () => {
        const { data: events } = await admin.from("events").select("id, name, school:schools!inner(name)").eq("status", "published").order("deadline_at", { ascending: false }).limit(100);
        return (
          <Panel title="個別のお知らせを送る">
            <ActionForm action={sendAdminMessage} className="space-y-3 text-sm">
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">宛先：行事の対象の会員（お知らせに同意した会員）</span>
                <select name="eventId" className={`${selectClass} w-full`} defaultValue=""><option value="">選ばない</option>{(events ?? []).map((e) => <option key={e.id} value={e.id}>{e.school.name}　{e.name}</option>)}</select>
              </label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">または、会員のメールアドレス（複数は改行か「,」で区切る）</span><textarea name="emails" rows={3} className="w-full rounded-md border border-input bg-white p-2 text-sm" /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">件名</span><input name="subject" className={`${inputClass} w-full`} /></label>
              <label className="block space-y-1"><span className="text-xs text-muted-foreground">本文（「○○ 様」と末尾の連絡先は自動で付きます）</span><textarea name="message" rows={8} className="w-full rounded-md border border-input bg-white p-2 text-sm" /></label>
              <label className="flex items-center gap-2"><input type="checkbox" name="confirm" className="size-4" />宛先と内容を確認しました</label>
              <SubmitButton>送る</SubmitButton>
            </ActionForm>
          </Panel>
        );
      })() : null}
    </div>
  );
}
