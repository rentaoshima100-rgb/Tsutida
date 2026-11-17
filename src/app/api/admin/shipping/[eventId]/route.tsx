import { staffOr401 } from "@/lib/server/admin-guard";
import { shippingData } from "@/lib/server/fulfillment";
import { csvResponse, pdfResponse, renderPdf } from "@/lib/server/pdf/base";
import { AddressLabelsDocument, DEFAULT_LABEL_LAYOUT } from "@/lib/server/pdf/fulfillment-docs";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// A12 宛名ラベル（PDF）・宛名CSV。CSV の形式は発送方法で決める（未決）ので、まずは汎用の列にする
export async function GET(request: Request, ctx: RouteContext<"/api/admin/shipping/[eventId]">) {
  const { response } = await staffOr401();
  if (response) return response;
  const { eventId } = await ctx.params;
  const url = new URL(request.url);
  const lateParam = url.searchParams.get("late");
  const rows = await shippingData(eventId, lateParam === null ? undefined : lateParam === "1");
  const { data: event } = await createAdminClient().from("events").select("name").eq("id", eventId).single();
  if (rows.length === 0) return new Response("発送する注文（郵送・制作中）がありません", { status: 404 });
  if (url.searchParams.get("doc") === "csv") {
    const enc = url.searchParams.get("enc") === "sjis" ? "sjis" : "utf8bom";
    return csvResponse(
      [["注文番号", "お届け先氏名", "郵便番号", "住所", "電話番号", "品名", "追跡番号"], ...rows.map((r) => [r.orderNo, r.name, r.postalCode, r.address, r.phone, r.contents, ""])],
      `宛名_${event?.name ?? eventId}.csv`,
      enc,
    );
  }
  return pdfResponse(await renderPdf(<AddressLabelsDocument rows={rows} layout={DEFAULT_LABEL_LAYOUT} />), `宛名ラベル_${event?.name ?? eventId}.pdf`);
}
