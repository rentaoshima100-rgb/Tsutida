import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PaymentBadge, inputClass, selectClass } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/domain/status";
import { formatJstCompact } from "@/lib/domain/time";

export const metadata: Metadata = { title: "注文一覧" };

const PAGE = 100;

// A07 注文一覧：行事・学校・園・クラス・状態・支払い方法で絞り込み、名前・メール・注文番号で検索
export default async function OrdersPage(props: PageProps<"/admin/orders">) {
  await requireStaff();
  const sp = await props.searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = { event: get("event"), school: get("school"), klass: get("class"), status: get("status"), method: get("method"), channel: get("channel"), q: get("q").trim(), page: Number(get("page") || 1) };
  const admin = createAdminClient();

  const [{ data: schools }, { data: events }] = await Promise.all([
    admin.from("schools").select("id, name").order("name"),
    admin.from("events").select("id, name, school_id, fiscal_year").order("sale_starts_at", { ascending: false }).limit(200),
  ]);
  const { data: classes } = f.event
    ? await admin.from("event_targets").select("class:classes!inner(id, grade_label, name, grade_order)").eq("event_id", f.event)
    : { data: [] };

  let query = admin
    .from("orders")
    .select(
      "id, order_no, created_at, total, payment_status, payment_method, channel, is_late, delivery_method, needs_attention, buyer_name, event:events!inner(id, name, school_id, school:schools!inner(name)), member:members(full_name, email), items:order_items(child:children(full_name), class_id)",
      { count: "exact" },
    )
    .neq("payment_status", "draft")
    .order("created_at", { ascending: false })
    .range((f.page - 1) * PAGE, f.page * PAGE - 1);
  if (f.event) query = query.eq("event_id", f.event);
  if (f.school) query = query.eq("event.school_id", f.school);
  if (f.status) query = query.eq("payment_status", f.status);
  if (f.method) query = query.eq("payment_method", f.method);
  if (f.channel === "web" || f.channel === "proxy") query = query.eq("channel", f.channel);
  if (f.q) {
    if (/^T\d{7}$/i.test(f.q)) query = query.eq("order_no", f.q.toUpperCase());
    else {
      const like = `%${f.q.replace(/[%_,()]/g, "")}%`;
      const [{ data: members }, { data: kids }] = await Promise.all([
        admin.from("members").select("id").or(`full_name.ilike.${like},full_name_kana.ilike.${like},email.ilike.${like}`).limit(200),
        admin.from("children").select("id").or(`full_name.ilike.${like},full_name_kana.ilike.${like}`).limit(200),
      ]);
      const { data: kidOrders } = kids && kids.length > 0
        ? await admin.from("order_items").select("order_id").in("child_id", kids.map((k) => k.id)).limit(1000)
        : { data: [] };
      const ids = [...new Set((kidOrders ?? []).map((o) => o.order_id))];
      const ors = [`buyer_name.ilike.${like}`, `buyer_email.ilike.${like}`];
      if (members && members.length > 0) ors.push(`member_id.in.(${members.map((m) => m.id).join(",")})`);
      if (ids.length > 0) ors.push(`id.in.(${ids.join(",")})`);
      query = query.or(ors.join(","));
    }
  }
  const { data: orders, count } = await query;
  const rows = (orders ?? []).filter((o) => !f.klass || o.items.some((i) => i.class_id === f.klass));
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k === "klass" ? "class" : k, String(v)])), ...patch }).filter(([, v]) => v && v !== "0"));
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="注文一覧"
        description={`${count ?? 0} 件`}
        actions={<Button asChild size="lg"><Link href="/admin/orders/new">代理注文を作る</Link></Button>}
      />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">検索（名前・メール・注文番号）</span><input name="q" defaultValue={f.q} className={`${inputClass} w-56`} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">学校・園</span>
          <select name="school" defaultValue={f.school} className={selectClass}><option value="">すべて</option>{(schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">行事</span>
          <select name="event" defaultValue={f.event} className={`${selectClass} max-w-64`}><option value="">すべて</option>{(events ?? []).filter((e) => !f.school || e.school_id === f.school).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </label>
        {f.event ? (
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">クラス</span>
            <select name="class" defaultValue={f.klass} className={selectClass}><option value="">すべて</option>{(classes ?? []).map((c) => c.class).sort((a, b) => a.grade_order - b.grade_order).map((c) => <option key={c.id} value={c.id}>{c.grade_label} {c.name}</option>)}</select>
          </label>
        ) : null}
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">支払いの状態</span>
          <select name="status" defaultValue={f.status} className={selectClass}><option value="">すべて</option>{Object.entries(PAYMENT_STATUS_LABEL).filter(([k]) => k !== "draft").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">支払い方法</span>
          <select name="method" defaultValue={f.method} className={selectClass}><option value="">すべて</option>{Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted-foreground">注文の経路</span>
          <select name="channel" defaultValue={f.channel} className={selectClass}><option value="">すべて</option><option value="web">ネット</option><option value="proxy">代理注文（電話・紙）</option></select>
        </label>
        <Button type="submit" variant="outline">絞り込む</Button>
        <Link href="/admin/orders" className="px-2 text-muted-foreground underline">条件を消す</Link>
      </form>

      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">注文番号</th><th>注文日時</th><th>行事</th><th>注文者</th><th>お子さま</th><th>支払い</th><th className="text-right">合計</th><th className="px-3">状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <Link href={`/admin/orders/${o.order_no}`} className="font-mono font-bold text-brand underline">{o.order_no}</Link>
                  {o.needs_attention ? <span className="ml-1 rounded bg-warn-soft px-1 text-xs font-bold text-warn">要対応</span> : null}
                  {o.channel === "proxy" ? <span className="ml-1 rounded bg-surface px-1 text-xs">代理</span> : null}
                  {o.is_late ? <span className="ml-1 rounded bg-surface px-1 text-xs">締切後</span> : null}
                </td>
                <td className="whitespace-nowrap py-2">{formatJstCompact(o.created_at)}</td>
                <td className="py-2">{o.event.school.name}<br />{o.event.name}</td>
                <td className="py-2">{o.member?.full_name ?? o.buyer_name}</td>
                <td className="py-2">{[...new Set(o.items.map((i) => i.child?.full_name))].join("、")}</td>
                <td className="py-2">{PAYMENT_METHOD_LABEL[o.payment_method as keyof typeof PAYMENT_METHOD_LABEL]}<br /><span className="text-xs text-muted-foreground">{o.delivery_method === "mail" ? "郵送" : "学校・園"}</span></td>
                <td className="py-2 text-right">{formatYen(o.total)}</td>
                <td className="px-3 py-2"><PaymentBadge status={o.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">条件に合う注文はありません。</p> : null}
      </div>
      <div className="flex justify-between text-sm">
        {f.page > 1 ? <Link href={qs({ page: String(f.page - 1) })} className="underline">前の{PAGE}件</Link> : <span />}
        {(count ?? 0) > f.page * PAGE ? <Link href={qs({ page: String(f.page + 1) })} className="underline">次の{PAGE}件</Link> : null}
      </div>
    </div>
  );
}
