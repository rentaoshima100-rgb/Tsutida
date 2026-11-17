// 期限の計算（9.1・9.3・9.4・11章・12章）。日付の判定はすべて日本時間。

import { addDays, diffDays, jstAt, jstDate, jstEndOfDay, jstParts, toDate } from "./time";

export type EventTiming = {
  sale_starts_at: string | Date;
  deadline_at: string | Date;
  late_enabled: boolean;
  late_until: string | Date | null;
};

export type OrderWindow = "before_sale" | "open" | "late" | "closed";

/** 注文の受付の状態（9.1）。通常は販売開始〜締切、締切後は受付期限まで（郵送のみ） */
export function orderWindow(event: EventTiming, now: Date = new Date()): OrderWindow {
  const t = now.getTime();
  if (t < toDate(event.sale_starts_at).getTime()) return "before_sale";
  if (t <= toDate(event.deadline_at).getTime()) return "open";
  if (event.late_enabled && event.late_until && t <= toDate(event.late_until).getTime()) return "late";
  return "closed";
}

/** その注文の締切（締切後の注文は受付期限） */
export function orderDeadline(event: EventTiming, isLate: boolean): Date {
  if (isLate) {
    if (!event.late_until) throw new Error("late order without late_until");
    return toDate(event.late_until);
  }
  return toDate(event.deadline_at);
}

/**
 * 支払い期限（9.3）：注文日の3日後の23:59。ただし締切日の2日後の23:59を超えない。
 * days はコンビニ払いの expires_after_days に入れる日数（代理注文で締切を過ぎていても1日は残す）
 */
export function paymentDue(orderedAt: Date, deadline: Date): { days: number; dueAt: Date } {
  const orderDay = jstDate(orderedAt);
  const limitDay = addDays(jstDate(deadline), 2);
  const days = Math.max(1, Math.min(3, diffDays(orderDay, limitDay)));
  return { days, dueAt: jstEndOfDay(addDays(orderDay, days)) };
}

/** 本数の確定の時刻（9.4）：締切日（締切後の注文は受付期限の日）の2日後の23:59 */
export function productionFixAt(deadline: Date | string): Date {
  return jstEndOfDay(addDays(jstDate(deadline), 2));
}

/** 会員が取り消せるか（9.5）：締切まで（締切後の注文は受付期限まで） */
export function canMemberCancel(event: EventTiming, isLate: boolean, now: Date = new Date()): boolean {
  return now.getTime() <= orderDeadline(event, isLate).getTime();
}

/**
 * 販売開始のお知らせを送ってよい時刻（11章）：sale_starts_at が21時〜翌8時なら、その次の朝8時
 */
export function saleStartSendAt(saleStartsAt: Date | string): Date {
  const start = toDate(saleStartsAt);
  const { hour } = jstParts(start);
  const day = jstDate(start);
  if (hour >= 21) return jstAt(addDays(day, 1), 8);
  if (hour < 8) return jstAt(day, 8);
  return start;
}

/**
 * 締切前のお知らせ（J2）。いま送るべきものを返す（D-1 の時刻を過ぎていれば D-3 は送らない）。
 * 締切日の3日前・前日の9時以降で、締切前。販売開始がその時刻より後の行事には送らない
 */
export function dueDeadlineReminder(
  event: EventTiming,
  now: Date = new Date(),
): "deadline_d3" | "deadline_d1" | null {
  const deadline = toDate(event.deadline_at);
  if (now.getTime() >= deadline.getTime()) return null;
  const day = jstDate(deadline);
  const d1 = jstAt(addDays(day, -1), 9);
  const d3 = jstAt(addDays(day, -3), 9);
  const start = toDate(event.sale_starts_at).getTime();
  if (now.getTime() >= d1.getTime()) return start < d1.getTime() ? "deadline_d1" : null;
  if (now.getTime() >= d3.getTime()) return start < d3.getTime() ? "deadline_d3" : null;
  return null;
}

/** 支払期限の前日のお知らせ（J3）：期限の前日の9時以降で、期限前 */
export function paymentReminderDue(dueAt: Date | string, now: Date = new Date()): boolean {
  const due = toDate(dueAt);
  if (now.getTime() >= due.getTime()) return false;
  return now.getTime() >= jstAt(addDays(jstDate(due), -1), 9).getTime();
}
