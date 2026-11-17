import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel, selectClass } from "@/components/admin/ui";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { orderWindow } from "@/lib/domain/deadlines";
import { formatJstCompact } from "@/lib/domain/time";
import { createProxyOrder } from "./actions";
import { ProxyOrderForm } from "./proxy-form";

export const metadata: Metadata = { title: "代理注文" };

// A09 代理注文：電話・紙の注文を作る（6.4）。受付中（締切後の受付を含む）の行事だけを選べる
export default async function ProxyOrderPage(props: PageProps<"/admin/orders/new">) {
  await requireStaff();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : "";
  const admin = createAdminClient();
  const now = new Date();

  const { data: events } = await admin
    .from("events")
    .select("id, name, sale_starts_at, deadline_at, late_enabled, late_until, school:schools!inner(name)")
    .eq("status", "published")
    .order("deadline_at");
  const selling = (events ?? []).filter((e) => {
    const w = orderWindow(e, now);
    return w === "open" || w === "late";
  });
  const picked = selling.find((e) => e.id === eventId) ?? null;

  let form: React.ReactNode = null;
  if (picked) {
    const [{ data: event }, { data: targets }, { data: products }, settings] = await Promise.all([
      admin.from("events").select("*").eq("id", picked.id).single(),
      admin.from("event_targets").select("class:classes!inner(id, grade_label, grade_order, name)").eq("event_id", picked.id),
      admin.from("products").select("id, name, kind, price, second_price, late_price, sort_order, product_targets(class_id)").eq("event_id", picked.id).eq("status", "on_sale").order("sort_order"),
      getSettings(),
    ]);
    const classes = (targets ?? [])
      .map((t) => t.class)
      .sort((a, b) => a.grade_order - b.grade_order || a.name.localeCompare(b.name, "ja"))
      .map((c) => ({ id: c.id, label: `${c.grade_label} ${c.name}` }));
    const isLate = orderWindow(picked, now) === "late";
    form =
      event && classes.length > 0 && (products ?? []).length > 0 ? (
        <ProxyOrderForm
          key={picked.id}
          action={createProxyOrder.bind(null, picked.id)}
          isLate={isLate}
          deliveryMethod={event.delivery_method as "school" | "mail" | "either"}
          shippingFee={event.shipping_fee ?? settings.default_shipping_fee}
          classes={classes}
          products={(products ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            kind: p.kind as "disc" | "data",
            price: p.price,
            secondPrice: p.second_price,
            latePrice: p.late_price,
            classIds: p.product_targets.map((t) => t.class_id),
          }))}
          methods={{ konbini: settings.payment_methods.konbini, bank_transfer: settings.payment_methods.bank_transfer }}
        />
      ) : (
        <Notice tone="warning">この行事には、対象のクラスか販売中の商品がありません。行事の設定（A05）を確認してください。</Notice>
      );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="代理注文"
        description="電話・紙で受けた注文を入力します。コンビニ払い・銀行振込は、払込票・振込先を印刷して渡せます。"
        actions={<Button asChild variant="outline"><Link href="/admin/orders?channel=proxy">代理注文の一覧</Link></Button>}
      />
      <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">行事（受付中のもの）</span>
          <select name="event" defaultValue={picked?.id ?? ""} className={`${selectClass} min-w-80`}>
            <option value="" disabled>選ぶ</option>
            {selling.map((e) => (
              <option key={e.id} value={e.id}>
                {e.school.name}　{e.name}{orderWindow(e, now) === "late" ? "（締切後の受付中）" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">選ぶ</Button>
      </form>
      {selling.length === 0 ? <Notice tone="info">受付中の行事がありません。</Notice> : null}
      {picked ? (
        <Panel title={`${picked.school.name}　${picked.name}`}>
          <p className="mb-4 text-sm text-muted-foreground">
            締切 {formatJstCompact(picked.deadline_at)}
            {orderWindow(picked, now) === "late" && picked.late_until ? `（締切後の受付は ${formatJstCompact(picked.late_until)} まで。郵送のみ・締切後の価格）` : ""}
          </p>
          {form}
        </Panel>
      ) : null}
    </div>
  );
}
