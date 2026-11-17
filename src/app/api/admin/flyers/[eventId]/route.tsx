import { staffOr401 } from "@/lib/server/admin-guard";
import { flyerData } from "@/lib/server/flyers";
import { pdfResponse, qrDataUrl, renderPdf } from "@/lib/server/pdf/base";
import { FlyerDocument } from "@/lib/server/pdf/flyer";

export const maxDuration = 60;

// A06 案内チラシ（A4 PDF）。phone=1 で「電話でも注文できます」の一文を入れる（移行期間）
export async function GET(request: Request, ctx: RouteContext<"/api/admin/flyers/[eventId]">) {
  const { response } = await staffOr401();
  if (response) return response;
  const { eventId } = await ctx.params;
  const d = await flyerData(eventId);
  if (!d) return new Response("not found", { status: 404 });
  if (d.products.length === 0) return new Response("販売中の商品がありません", { status: 404 });
  const phoneOrders = new URL(request.url).searchParams.get("phone") === "1";
  const qr = await qrDataUrl(d.orderUrl);
  return pdfResponse(await renderPdf(<FlyerDocument d={d} qr={qr} phoneOrders={phoneOrders} />), `案内チラシ_${d.schoolName}_${d.eventName}.pdf`);
}
