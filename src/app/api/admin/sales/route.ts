import { staffOr401 } from "@/lib/server/admin-guard";
import { csvResponse } from "@/lib/server/pdf/base";
import { salesDataset } from "@/lib/server/sales";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/domain/status";
import { fiscalYearOf, jstParts } from "@/lib/domain/time";

export const maxDuration = 60;

function ymd(value: string | null): string {
  if (!value) return "";
  const p = jstParts(value);
  return `${p.year}/${String(p.month).padStart(2, "0")}/${String(p.day).padStart(2, "0")}`;
}

// A15 会計ソフト用CSV（13章）：明細ごとに1行、送料は別の行。金額は取り消し後の額、取り消した額は別の列
export async function GET(request: Request) {
  const { response } = await staffOr401();
  if (response) return response;
  const url = new URL(request.url);
  const fy = Number(url.searchParams.get("fy")) || fiscalYearOf(new Date());
  const encoding = url.searchParams.get("encoding") === "sjis" ? "sjis" : "utf8bom";
  const { events, orders } = await salesDataset(fy);
  const ev = new Map(events.map((e) => [e.id, e]));
  const rows: (string | number)[][] = [["支払い日", "注文日", "注文番号", "学校・園", "行事", "商品", "数量", "金額", "取り消した額", "支払い方法", "状態", "経路"]];
  for (const o of orders) {
    const e = ev.get(o.event_id);
    const common = (product: string, qty: number | string, amount: number, canceled: number | string) => [
      ymd(o.paid_at),
      ymd(o.created_at),
      o.order_no,
      e?.school_name ?? "",
      e?.name ?? "",
      product,
      qty,
      amount,
      canceled,
      PAYMENT_METHOD_LABEL[o.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ?? o.payment_method,
      PAYMENT_STATUS_LABEL[o.payment_status as keyof typeof PAYMENT_STATUS_LABEL] ?? o.payment_status,
      o.channel === "proxy" ? "代理注文" : "ネット",
    ];
    for (const i of o.items) rows.push(common(i.product_name_snapshot, i.quantity, i.amount, i.canceled_amount ?? ""));
    if (o.shipping_fee > 0) rows.push(common("送料", "", o.shipping_fee, ""));
  }
  return csvResponse(rows, `売上_${fy}年度.csv`, encoding);
}
