import { describe, expect, it } from "vitest";
import {
  canMemberCancel,
  dueDeadlineReminder,
  orderWindow,
  paymentDue,
  paymentReminderDue,
  productionFixAt,
  saleStartSendAt,
} from "@/lib/domain/deadlines";
import { fiscalYearOf, formatJstDateTime, fromJstLocalInput, jstDate, toJstLocalInput } from "@/lib/domain/time";

// 日本時間の日時から Date を作る
const jst = (s: string) => new Date(`${s}+09:00`);

describe("日本時間の扱い", () => {
  it("UTC の 15:00 は日本時間の翌日 0:00", () => {
    expect(jstDate(new Date("2026-11-04T15:00:00Z"))).toBe("2026-11-05");
    expect(jstDate(new Date("2026-11-04T14:59:59Z"))).toBe("2026-11-04");
  });
  it("年度は4月始まり", () => {
    expect(fiscalYearOf(jst("2026-04-01T00:00:00"))).toBe(2026);
    expect(fiscalYearOf(jst("2026-03-31T23:59:59"))).toBe(2025);
    expect(fiscalYearOf(jst("2027-03-31T12:00:00"))).toBe(2026);
  });
  it("表示と入力の変換", () => {
    expect(formatJstDateTime(jst("2026-11-05T09:05:00"))).toBe("2026年11月5日（木） 9:05");
    expect(toJstLocalInput(fromJstLocalInput("2026-12-01T18:30"))).toBe("2026-12-01T18:30");
  });
});

describe("支払い期限（9.3）", () => {
  const deadline = jst("2026-11-20T23:59:00");
  it("通常は注文日の3日後の23:59", () => {
    const r = paymentDue(jst("2026-11-10T10:00:00"), deadline);
    expect(r.days).toBe(3);
    expect(r.dueAt.toISOString()).toBe(jst("2026-11-13T23:59:00").toISOString());
  });
  it("締切日の2日後の23:59を超えない", () => {
    const r = paymentDue(jst("2026-11-20T22:00:00"), deadline);
    expect(r.days).toBe(2);
    expect(r.dueAt.toISOString()).toBe(jst("2026-11-22T23:59:00").toISOString());
  });
  it("締切の前日の注文は3日（締切+2日とちょうど同じ日）", () => {
    const r = paymentDue(jst("2026-11-19T08:00:00"), deadline);
    expect(r.days).toBe(3);
    expect(r.dueAt.toISOString()).toBe(jst("2026-11-22T23:59:00").toISOString());
  });
  it("日付の境目は日本時間で数える（UTC では前日でも日本時間で翌日）", () => {
    const r = paymentDue(new Date("2026-11-20T15:30:00Z"), jst("2026-11-22T12:00:00"));
    // 日本時間 11/21 0:30 の注文。締切日 11/22 → 上限 11/24
    expect(r.days).toBe(3);
    expect(jstDate(r.dueAt)).toBe("2026-11-24");
  });
  it("締切を大きく過ぎた代理注文でも1日は残す", () => {
    const r = paymentDue(jst("2026-12-10T10:00:00"), deadline);
    expect(r.days).toBe(1);
  });
});

describe("受付の状態（9.1）", () => {
  const event = {
    sale_starts_at: jst("2026-11-01T10:00:00"),
    deadline_at: jst("2026-11-20T23:59:00"),
    late_enabled: true,
    late_until: jst("2026-11-30T23:59:00"),
  };
  it("販売開始前・受付中・締切後の受付・終了", () => {
    expect(orderWindow(event, jst("2026-11-01T09:59:59"))).toBe("before_sale");
    expect(orderWindow(event, jst("2026-11-01T10:00:00"))).toBe("open");
    expect(orderWindow(event, jst("2026-11-20T23:59:00"))).toBe("open");
    expect(orderWindow(event, jst("2026-11-21T00:00:00"))).toBe("late");
    expect(orderWindow(event, jst("2026-12-01T00:00:00"))).toBe("closed");
    expect(orderWindow({ ...event, late_enabled: false }, jst("2026-11-21T00:00:00"))).toBe("closed");
  });
  it("会員の取り消しは締切まで（締切後の注文は受付期限まで）", () => {
    expect(canMemberCancel(event, false, jst("2026-11-20T23:59:00"))).toBe(true);
    expect(canMemberCancel(event, false, jst("2026-11-21T00:00:00"))).toBe(false);
    expect(canMemberCancel(event, true, jst("2026-11-25T00:00:00"))).toBe(true);
  });
});

describe("本数の確定（9.4）", () => {
  it("締切日の2日後の23:59", () => {
    expect(productionFixAt(jst("2026-11-20T10:00:00")).toISOString()).toBe(jst("2026-11-22T23:59:00").toISOString());
  });
});

describe("お知らせの時刻（11章・12章）", () => {
  it("販売開始が21時〜翌8時なら朝8時に送る", () => {
    expect(saleStartSendAt(jst("2026-11-01T10:00:00")).toISOString()).toBe(jst("2026-11-01T10:00:00").toISOString());
    expect(saleStartSendAt(jst("2026-11-01T21:00:00")).toISOString()).toBe(jst("2026-11-02T08:00:00").toISOString());
    expect(saleStartSendAt(jst("2026-11-02T06:30:00")).toISOString()).toBe(jst("2026-11-02T08:00:00").toISOString());
    expect(saleStartSendAt(jst("2026-11-02T08:00:00")).toISOString()).toBe(jst("2026-11-02T08:00:00").toISOString());
  });

  const event = {
    sale_starts_at: jst("2026-11-01T10:00:00"),
    deadline_at: jst("2026-11-20T23:59:00"),
    late_enabled: false,
    late_until: null,
  };
  it("締切の3日前・前日の9時以降に送り、前日を過ぎたら3日前は送らない", () => {
    expect(dueDeadlineReminder(event, jst("2026-11-17T08:59:00"))).toBeNull();
    expect(dueDeadlineReminder(event, jst("2026-11-17T09:00:00"))).toBe("deadline_d3");
    expect(dueDeadlineReminder(event, jst("2026-11-18T12:00:00"))).toBe("deadline_d3");
    expect(dueDeadlineReminder(event, jst("2026-11-19T09:00:00"))).toBe("deadline_d1");
    expect(dueDeadlineReminder(event, jst("2026-11-20T23:59:00"))).toBeNull();
  });
  it("販売開始がお知らせの時刻より後の行事には送らない", () => {
    const short = { ...event, sale_starts_at: jst("2026-11-18T10:00:00") };
    expect(dueDeadlineReminder(short, jst("2026-11-18T12:00:00"))).toBeNull();
    expect(dueDeadlineReminder(short, jst("2026-11-19T09:00:00"))).toBe("deadline_d1");
  });
  it("支払期限の前日の9時以降", () => {
    const due = jst("2026-11-13T23:59:00");
    expect(paymentReminderDue(due, jst("2026-11-12T08:59:00"))).toBe(false);
    expect(paymentReminderDue(due, jst("2026-11-12T09:00:00"))).toBe(true);
    expect(paymentReminderDue(due, jst("2026-11-14T00:00:00"))).toBe(false);
  });
});
