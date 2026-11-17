import type { Metadata } from "next";
import { getMember } from "@/lib/server/auth";
import { getPublicSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "お問い合わせ" };

// G07 お問い合わせ（ログイン中は注文を選べる）
export default async function ContactPage() {
  const [s, member] = await Promise.all([getPublicSettings(), getMember()]);
  const b = s.business_info;
  let orders: { orderNo: string; label: string }[] = [];
  if (member) {
    const { data } = await createAdminClient()
      .from("orders")
      .select("order_no, created_at, event:events!inner(name)")
      .eq("member_id", member.id)
      .neq("payment_status", "draft")
      .order("created_at", { ascending: false })
      .limit(20);
    orders = (data ?? []).map((o) => ({ orderNo: o.order_no, label: `${o.order_no}　${o.event.name}` }));
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">お問い合わせ</h1>
      <div className="space-y-1 rounded-xl bg-surface p-4">
        <p className="font-bold">{b.name}</p>
        {b.phone && b.phone !== "（未設定）" ? <p>お電話：{b.phone}</p> : null}
        {b.hours ? <p className="text-muted-foreground">受付時間：{b.hours}</p> : null}
        <p className="text-sm text-muted-foreground">フォームからのお問い合わせは、受付時間内に順にご返信します。</p>
      </div>
      <ContactForm defaults={{ name: member?.full_name ?? "", email: member?.email ?? "" }} orders={orders} />
    </div>
  );
}
