import "server-only";
import { appUrl } from "@/lib/env";
import { getSettings, type BusinessInfo } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/domain/pricing";
import { PAYMENT_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstDate, formatJstDateTime, formatJstMonthDayTime } from "@/lib/domain/time";

// A06 案内チラシ・告知文（13章）。お子さまの写真が写りうるジャケット画像は載せない（会員ページだけで出す）

export type FlyerProduct = { name: string; price: number; secondPrice: number | null; latePrice: number | null };

export type FlyerData = {
  eventId: string;
  schoolName: string;
  eventName: string;
  heldOn: string | null;
  contents: string | null;
  deadlineAt: string;
  lateUntil: string | null;
  deliveryMethod: "school" | "mail" | "either";
  shippingFee: number;
  deliveryNote: string | null;
  products: FlyerProduct[];
  paymentMethods: string[];
  business: BusinessInfo;
  /** チラシ・告知文に載せる注文サイトのURL。LINE で開いたときに外のブラウザで開く（4章） */
  orderUrl: string;
};

export async function flyerData(eventId: string): Promise<FlyerData | null> {
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return null;
  const admin = createAdminClient();
  const [{ data: event }, settings] = await Promise.all([
    admin
      .from("events")
      .select("*, school:schools!inner(name), products(name, price, second_price, late_price, status, sort_order)")
      .eq("id", eventId)
      .neq("status", "draft")
      .maybeSingle(),
    getSettings(),
  ]);
  if (!event) return null;
  const methods = (["card", "paypay", "konbini", "bank_transfer"] as const).filter((m) => settings.payment_methods[m]).map((m) => PAYMENT_METHOD_LABEL[m]);
  return {
    eventId: event.id,
    schoolName: event.school.name,
    eventName: event.name,
    heldOn: event.held_on,
    contents: event.contents,
    deadlineAt: event.deadline_at,
    lateUntil: event.late_enabled ? event.late_until : null,
    deliveryMethod: event.delivery_method as FlyerData["deliveryMethod"],
    shippingFee: event.shipping_fee ?? settings.default_shipping_fee,
    deliveryNote: event.delivery_note,
    products: event.products
      .filter((p) => p.status === "on_sale")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({ name: p.name, price: p.price, secondPrice: p.second_price, latePrice: p.late_price })),
    paymentMethods: methods,
    business: settings.business_info,
    orderUrl: appUrl(`/events/${event.id}?openExternalBrowser=1`),
  };
}

export function deliveryText(d: FlyerData): string {
  const ship = d.shippingFee > 0 ? `郵送の送料 ${formatYen(d.shippingFee)}` : "郵送の送料 無料";
  if (d.deliveryMethod === "school") return "学校・園でお渡しします";
  if (d.deliveryMethod === "mail") return `ご自宅へ郵送します（${ship}）`;
  return `学校・園でのお渡し、またはご自宅への郵送を選べます（${ship}）`;
}

/** 学校・園の連絡アプリに貼る文（販売開始・締切前の2つ） */
export function announcementTexts(d: FlyerData): { key: string; label: string; text: string }[] {
  const contact = [d.business.name, d.business.phone ? `電話 ${d.business.phone}` : "", d.business.hours ? `（${d.business.hours}）` : ""].filter(Boolean).join("　");
  const prices = d.products.map((p) => `・${p.name} ${formatYen(p.price)}${p.secondPrice !== null ? `（2枚目から ${formatYen(p.secondPrice)}）` : ""}`).join("\n");
  const firstTime = "はじめての方は、会員登録と、お配りした登録コード（カード）の入力をお願いします。";
  const held = d.heldOn ? `${formatJstDate(d.heldOn)}の` : "";
  return [
    {
      key: "start",
      label: "販売開始のお知らせ",
      text: [
        `【${d.schoolName}】${d.eventName}の DVD・Blu-ray のご案内`,
        "",
        `${held}${d.eventName}の映像を、DVD・Blu-ray にしてお届けします。`,
        "",
        "■ 商品と価格（税込）",
        prices,
        "",
        `■ ご注文の締切：${formatJstDateTime(d.deadlineAt)}`,
        `■ お届け：${deliveryText(d)}`,
        "■ ご注文はこちらから",
        d.orderUrl,
        firstTime,
        "",
        `お問い合わせ：${contact}`,
      ].join("\n"),
    },
    {
      key: "reminder",
      label: "締切前のお知らせ",
      text: [
        `【${d.schoolName}】${d.eventName}の DVD・Blu-ray のご注文は、${formatJstMonthDayTime(d.deadlineAt)}までです`,
        "",
        "ご注文がまだの方は、締切までにお願いいたします。",
        "■ ご注文はこちらから",
        d.orderUrl,
        firstTime,
        "",
        `お問い合わせ：${contact}`,
      ].join("\n"),
    },
  ];
}
