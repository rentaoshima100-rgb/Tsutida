import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/site/notice";
import { getMember } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "お支払いの結果", robots: { index: false } };

// G13 決済からの戻り先。ログインなしでも開け、出すのは「支払い完了／支払い待ち」とメールの案内だけ（4章）。
// PayPay アプリから別のブラウザに戻った場合の対策。状態は変えない（Webhook で進める）
export default async function PaymentReturnPage(props: PageProps<"/payment/return">) {
  const sp = await props.searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : "";
  const { data: order } = sessionId
    ? await createAdminClient()
        .from("orders")
        .select("order_no, member_id, payment_status")
        .eq("stripe_checkout_session_id", sessionId)
        .maybeSingle()
    : { data: null };

  const member = await getMember();
  if (order && member && order.member_id === member.id) redirect(`/orders/${order.order_no}/complete`);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">お支払いの結果</h1>
      {order?.payment_status === "paid" ? (
        <Notice tone="success" title="お支払いが完了しました">ご注文の内容は、メールでお送りしています。</Notice>
      ) : order?.payment_status === "pending" ? (
        <Notice tone="info" title="お支払い待ちです">払込票・振込先と期限を、メールでお送りしています。</Notice>
      ) : (
        <Notice tone="info" title="お支払いを確認しています">確認ができしだい、メールでお知らせします。詳しくはメールをご確認ください。</Notice>
      )}
      <p className="text-sm text-muted-foreground">ご注文の内容は、ログインするとマイページでも確認できます。</p>
    </div>
  );
}
