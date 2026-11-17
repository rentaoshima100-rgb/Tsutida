import { staffOr401 } from "@/lib/server/admin-guard";
import { sortingData } from "@/lib/server/fulfillment";
import { csvResponse, pdfResponse, renderPdf } from "@/lib/server/pdf/base";
import { DEFAULT_LABEL_LAYOUT, DeliveryNoteDocument, SchoolLabelsDocument, SortingListDocument, type LabelLayout } from "@/lib/server/pdf/fulfillment-docs";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJstDate } from "@/lib/domain/time";

export const maxDuration = 60;

// A11 仕分けリスト（PDF・CSV）、お届けラベル、納品書
export async function GET(request: Request, ctx: RouteContext<"/api/admin/sorting/[eventId]">) {
  const { response } = await staffOr401();
  if (response) return response;
  const { eventId } = await ctx.params;
  const url = new URL(request.url);
  const doc = url.searchParams.get("doc") ?? "list";
  const classIds = url.searchParams.getAll("class");
  const { data: event } = await createAdminClient().from("events").select("name, school:schools!inner(name)").eq("id", eventId).single();
  if (!event) return new Response("not found", { status: 404 });
  const classes = (await sortingData(eventId)).filter((c) => classIds.length === 0 || classIds.includes(c.classId));
  if (classes.length === 0) return new Response("対象の明細がありません（受付済み・制作中の、学校・園で受け取る分）", { status: 404 });

  if (doc === "csv") {
    const rows: (string | number)[][] = [["学校・園", "クラス", "お子さま", "ふりがな", "商品", "枚数", "注文番号"]];
    for (const c of classes) for (const ch of c.children) for (const l of ch.lines) rows.push([event.school.name, c.label, ch.name, ch.kana, l.product, l.quantity, ch.orderNos.join(" ")]);
    return csvResponse(rows, `仕分けリスト_${event.name}.csv`);
  }
  const settings = await getSettings();
  if (doc === "labels") {
    const raw = (settings as unknown as { label_layout?: Partial<LabelLayout> }).label_layout;
    const layout = { ...DEFAULT_LABEL_LAYOUT, ...(raw ?? {}) };
    return pdfResponse(await renderPdf(<SchoolLabelsDocument eventName={event.name} classes={classes} layout={layout} />), `お届けラベル_${event.name}.pdf`);
  }
  if (doc === "delivery") {
    return pdfResponse(
      await renderPdf(<DeliveryNoteDocument schoolName={event.school.name} eventName={event.name} businessName={settings.business_info.name} classes={classes} date={formatJstDate(new Date())} />),
      `納品書_${event.name}.pdf`,
    );
  }
  return pdfResponse(await renderPdf(<SortingListDocument schoolName={event.school.name} eventName={event.name} classes={classes} />), `仕分けリスト_${event.name}.pdf`);
}
