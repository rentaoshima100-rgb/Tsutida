// 状態の名前と、マイページでの表示（8章）

import { formatJstMonthDay } from "./time";

export type PaymentStatus = "draft" | "pending" | "paid" | "partially_refunded" | "refunded" | "canceled";
export type FulfillmentStatus =
  | "accepted"
  | "in_production"
  | "delivered"
  | "shipped"
  | "canceled"
  | "provided";
export type PaymentMethod = "card" | "konbini" | "paypay" | "bank_transfer" | "cash";
export type DeliveryMethod = "school" | "mail";
export type EventDeliveryMethod = DeliveryMethod | "either";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  draft: "未確定",
  pending: "支払い待ち",
  paid: "支払い済み",
  partially_refunded: "一部返金",
  refunded: "返金済み",
  canceled: "取り消し",
};

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  accepted: "受付済み",
  in_production: "制作中",
  delivered: "納品済み",
  shipped: "発送済み",
  canceled: "取り消し",
  provided: "提供済み",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "クレジットカード",
  konbini: "コンビニ払い",
  paypay: "PayPay",
  bank_transfer: "銀行振込",
  cash: "現金",
};

export const DELIVERY_METHOD_LABEL: Record<EventDeliveryMethod, string> = {
  school: "学校・園でお受け取り",
  mail: "ご自宅へ郵送",
  either: "学校・園でのお受け取りか、ご自宅への郵送を選べます",
};

export const MEDIA_LABEL: Record<"dvd" | "bluray" | "photo_data", string> = {
  dvd: "DVD",
  bluray: "Blu-ray",
  photo_data: "写真データ",
};

export const SCHOOL_KIND_LABEL: Record<"preschool" | "elementary", string> = {
  preschool: "幼稚園・保育園・こども園",
  elementary: "小学校",
};

export const EVENT_STATUS_LABEL: Record<"draft" | "published" | "canceled", string> = {
  draft: "非公開",
  published: "公開中",
  canceled: "中止",
};

/** 明細ごとの、マイページでの表示（8章の表） */
export function memberItemStatus(params: {
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  canceledAt: string | null;
  paymentDueAt: string | null;
}): { label: string; tone: "waiting" | "progress" | "done" | "canceled" } {
  const { paymentStatus, fulfillmentStatus, canceledAt, paymentDueAt } = params;
  if (paymentStatus === "canceled") return { label: "取り消し", tone: "canceled" };
  if (canceledAt) {
    return paymentStatus === "refunded" || paymentStatus === "partially_refunded"
      ? { label: "取り消し（返金済み）", tone: "canceled" }
      : { label: "取り消し", tone: "canceled" };
  }
  if (paymentStatus === "pending") {
    return {
      label: paymentDueAt ? `お支払い待ち（${formatJstMonthDay(paymentDueAt)}まで）` : "お支払い待ち",
      tone: "waiting",
    };
  }
  switch (fulfillmentStatus) {
    case "accepted":
      return { label: "ご注文を受け付けました", tone: "progress" };
    case "in_production":
      return { label: "制作中", tone: "progress" };
    case "delivered":
      return { label: "学校・園にお届けしました", tone: "done" };
    case "shipped":
      return { label: "発送しました", tone: "done" };
    case "provided":
      return { label: "ご利用いただけます", tone: "done" };
    default:
      return { label: "手続き中", tone: "waiting" };
  }
}
