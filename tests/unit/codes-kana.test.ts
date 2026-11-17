import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, formatCode, generateCode, normalizeCode, registrationUrl } from "@/lib/domain/codes";
import { isKana, nameKey } from "@/lib/domain/kana";
import { memberItemStatus } from "@/lib/domain/status";

describe("登録コード（9.8）", () => {
  it("12文字の Crockford Base32 を作る", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    }
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });
  it("乱数から決まった値を作る（ビットの使い方の確認）", () => {
    expect(generateCode(() => new Uint8Array(8))).toBe("000000000000");
    expect(generateCode(() => new Uint8Array(8).fill(255))).toBe("ZZZZZZZZZZZZ");
  });
  it("入力の揺れを吸収する", () => {
    expect(normalizeCode("test-0m00-0001")).toBe("TEST0M000001");
    expect(normalizeCode("ＴＥＳＴ　０Ｍ００　０００１")).toBe("TEST0M000001");
    expect(normalizeCode("TESTOMOOOOO1")).toBe("TEST0M000001"); // O → 0
    expect(normalizeCode("TEST0M00000I")).toBe("TEST0M000001"); // I → 1
    expect(normalizeCode("TEST0M00000l")).toBe("TEST0M000001"); // l → 1
    expect(normalizeCode("TEST0M00001")).toBeNull(); // 11文字
    expect(normalizeCode("TEST0M00000U")).toBeNull(); // U は使わない
  });
  it("カードの表記とQRのURL", () => {
    expect(formatCode("TEST0M000001")).toBe("TEST-0M00-0001");
    expect(registrationUrl("https://order.t-eizou.com/", "TEST0M000001")).toBe(
      "https://order.t-eizou.com/r?openExternalBrowser=1#TEST0M000001",
    );
  });
});

describe("ふりがなの照合キー（9.9）", () => {
  it("カタカナ・半角・空白の違いを吸収する", () => {
    expect(nameKey("ヤマダ　タロウ")).toBe("やまだたろう");
    expect(nameKey("ﾔﾏﾀﾞ ﾀﾛｳ")).toBe("やまだたろう");
    expect(nameKey(" やまだ たろう ")).toBe("やまだたろう");
    expect(nameKey("ヴィヴィ")).toBe("ゔぃゔぃ");
    expect(nameKey("サクラ")).toBe(nameKey("さくら"));
  });
  it("ふりがなとして受け付ける文字", () => {
    expect(isKana("やまだ たろう")).toBe(true);
    expect(isKana("ヤマダ　タロー")).toBe(true);
    expect(isKana("山田")).toBe(false);
    expect(isKana("yamada")).toBe(false);
    expect(isKana("   ")).toBe(false);
  });
});

describe("マイページの表示（8章）", () => {
  const base = { canceledAt: null, paymentDueAt: null };
  it("状態の組み合わせ", () => {
    expect(memberItemStatus({ ...base, paymentStatus: "paid", fulfillmentStatus: "accepted" }).label).toBe(
      "ご注文を受け付けました",
    );
    expect(memberItemStatus({ ...base, paymentStatus: "paid", fulfillmentStatus: "in_production" }).label).toBe("制作中");
    expect(memberItemStatus({ ...base, paymentStatus: "paid", fulfillmentStatus: "delivered" }).label).toBe(
      "学校・園にお届けしました",
    );
    expect(
      memberItemStatus({
        ...base,
        paymentStatus: "pending",
        fulfillmentStatus: null,
        paymentDueAt: "2026-11-13T14:59:00Z",
      }).label,
    ).toBe("お支払い待ち（11月13日（金）まで）");
    expect(memberItemStatus({ ...base, paymentStatus: "canceled", fulfillmentStatus: null }).label).toBe("取り消し");
    expect(
      memberItemStatus({
        ...base,
        paymentStatus: "partially_refunded",
        fulfillmentStatus: "canceled",
        canceledAt: "2026-11-10T00:00:00Z",
      }).label,
    ).toBe("取り消し（返金済み）");
  });
});
