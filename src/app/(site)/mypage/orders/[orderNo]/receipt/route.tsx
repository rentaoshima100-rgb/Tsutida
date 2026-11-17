import { getMember } from "@/lib/server/auth";
import { loadMemberOrder } from "@/lib/server/orders/load";
import { pdfResponse, renderPdf } from "@/lib/server/pdf/base";
import { ReceiptDocument } from "@/lib/server/pdf/receipt";
import { getSettings } from "@/lib/server/settings";
import { formatYen } from "@/lib/domain/pricing";
import { formatJstDate } from "@/lib/domain/time";

// M07 領収書（PDF）。支払い済みの注文だけ。宛名は会員が入力する
export async function GET(request: Request, ctx: RouteContext<"/mypage/orders/[orderNo]/receipt">) {
  const member = await getMember();
  if (!member) return new Response("ログインしてください", { status: 401 });
  const { orderNo } = await ctx.params;
  const order = await loadMemberOrder(member.id, orderNo);
  if (!order || !(order.payment_status === "paid" || order.payment_status === "partially_refunded") || order.total <= 0) {
    return new Response("領収書を発行できる注文ではありません", { status: 404 });
  }
  const name = (new URL(request.url).searchParams.get("name") ?? member.full_name).slice(0, 40) || member.full_name;
  const settings = await getSettings();
  const b = settings.business_info;
  const pdf = await renderPdf(
    <ReceiptDocument
      name={name}
      amount={formatYen(order.total)}
      proviso={settings.receipt.proviso}
      issuedOn={formatJstDate(new Date())}
      paidOn={order.paid_at ? formatJstDate(order.paid_at) : ""}
      orderNo={order.order_no}
      business={{ name: b.name, postalCode: b.postal_code, address: b.address, phone: b.phone }}
      lines={[`${order.event.name}`]}
    />,
  );
  return pdfResponse(pdf, `領収書_${order.order_no}.pdf`);
}
