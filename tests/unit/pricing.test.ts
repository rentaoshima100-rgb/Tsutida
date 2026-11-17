import { describe, expect, it } from "vitest";
import { calcOrder, PricingError, type PricingProduct } from "@/lib/domain/pricing";

const dvd: PricingProduct = { id: "dvd", kind: "disc", price: 3000, secondPrice: 2500, latePrice: 3500 };
const bd: PricingProduct = { id: "bd", kind: "disc", price: 3500, secondPrice: null, latePrice: 4000 };
const photo: PricingProduct = { id: "photo", kind: "data", price: 500, secondPrice: 300, latePrice: null };
const products = new Map([dvd, bd, photo].map((p) => [p.id, p]));

describe("calcOrder（9.2）", () => {
  it("設計書の例：Aの分1枚、Bの分2枚を学校・園で受け取る → 3,000円・5,000円、合計8,000円", () => {
    const r = calcOrder({
      lines: [
        { lineNo: 1, productId: "dvd", quantity: 1 },
        { lineNo: 2, productId: "dvd", quantity: 2 },
      ],
      products,
      isLate: false,
      deliveryMethod: "school",
      shippingFee: 500,
    });
    expect(r.lines.map((l) => l.amount)).toEqual([3000, 5000]);
    expect(r.subtotal).toBe(8000);
    expect(r.shippingFee).toBe(0);
    expect(r.total).toBe(8000);
  });

  it("1枚目は明細を作った順で最初の行に割り当てる（並びが逆でも lineNo の順）", () => {
    const r = calcOrder({
      lines: [
        { lineNo: 2, productId: "dvd", quantity: 1 },
        { lineNo: 1, productId: "dvd", quantity: 2 },
      ],
      products,
      isLate: false,
      deliveryMethod: "school",
      shippingFee: 0,
    });
    expect(r.lines).toEqual([
      expect.objectContaining({ lineNo: 1, unitPrices: [3000, 2500], amount: 5500 }),
      expect.objectContaining({ lineNo: 2, unitPrices: [2500], amount: 2500 }),
    ]);
  });

  it("2枚目以降の価格は商品ごとに数える。空欄なら割引なし", () => {
    const r = calcOrder({
      lines: [
        { lineNo: 1, productId: "dvd", quantity: 1 },
        { lineNo: 2, productId: "bd", quantity: 2 },
        { lineNo: 3, productId: "dvd", quantity: 1 },
      ],
      products,
      isLate: false,
      deliveryMethod: "school",
      shippingFee: 0,
    });
    expect(r.lines.map((l) => l.amount)).toEqual([3000, 7000, 2500]);
    expect(r.total).toBe(12500);
  });

  it("郵送でディスクがあれば送料を足す", () => {
    const r = calcOrder({
      lines: [{ lineNo: 1, productId: "bd", quantity: 1 }],
      products,
      isLate: false,
      deliveryMethod: "mail",
      shippingFee: 600,
    });
    expect(r.shippingFee).toBe(600);
    expect(r.total).toBe(4100);
  });

  it("データ商品だけなら郵送でも送料はかからない（16章）", () => {
    const r = calcOrder({
      lines: [{ lineNo: 1, productId: "photo", quantity: 3 }],
      products,
      isLate: false,
      deliveryMethod: "mail",
      shippingFee: 600,
    });
    expect(r.subtotal).toBe(500 + 300 + 300);
    expect(r.shippingFee).toBe(0);
  });

  it("締切後の注文は全枚数を締切後の価格にし、2枚目以降の価格は使わない", () => {
    const r = calcOrder({
      lines: [
        { lineNo: 1, productId: "dvd", quantity: 2 },
        { lineNo: 2, productId: "dvd", quantity: 1 },
      ],
      products,
      isLate: true,
      deliveryMethod: "mail",
      shippingFee: 500,
    });
    expect(r.lines.map((l) => l.unitPrices)).toEqual([[3500, 3500], [3500]]);
    expect(r.total).toBe(3500 * 3 + 500);
  });

  it("締切後の価格がない商品は通常の価格", () => {
    const r = calcOrder({
      lines: [{ lineNo: 1, productId: "photo", quantity: 2 }],
      products,
      isLate: true,
      deliveryMethod: "mail",
      shippingFee: 500,
    });
    expect(r.lines[0].unitPrices).toEqual([500, 500]);
  });

  it("取り消し後の計算し直し：1枚目の行を消すと、次の行が1枚目の価格になる（9.5）", () => {
    const before = calcOrder({
      lines: [
        { lineNo: 1, productId: "dvd", quantity: 1 },
        { lineNo: 2, productId: "dvd", quantity: 2 },
      ],
      products,
      isLate: false,
      deliveryMethod: "mail",
      shippingFee: 500,
    });
    const after = calcOrder({
      lines: [{ lineNo: 2, productId: "dvd", quantity: 2 }],
      products,
      isLate: false,
      deliveryMethod: "mail",
      shippingFee: 500,
    });
    expect(before.total).toBe(8500);
    expect(after.lines[0].amount).toBe(5500);
    expect(after.total).toBe(6000);
    expect(before.total - after.total).toBe(2500); // 返金額は単純な3,000円ではない
  });

  it("全部の明細を取り消すと送料も0円", () => {
    const r = calcOrder({ lines: [], products, isLate: false, deliveryMethod: "mail", shippingFee: 500 });
    expect(r.total).toBe(0);
  });

  it("不正な入力はエラー", () => {
    const base = { products, isLate: false, deliveryMethod: "school" as const, shippingFee: 0 };
    expect(() => calcOrder({ ...base, lines: [{ lineNo: 1, productId: "dvd", quantity: 0 }] })).toThrow(PricingError);
    expect(() => calcOrder({ ...base, lines: [{ lineNo: 1, productId: "dvd", quantity: 1.5 }] })).toThrow(PricingError);
    expect(() => calcOrder({ ...base, lines: [{ lineNo: 1, productId: "nope", quantity: 1 }] })).toThrow(PricingError);
    expect(() =>
      calcOrder({
        ...base,
        lines: [
          { lineNo: 1, productId: "dvd", quantity: 1 },
          { lineNo: 1, productId: "bd", quantity: 1 },
        ],
      }),
    ).toThrow(PricingError);
    expect(() => calcOrder({ ...base, shippingFee: -1, lines: [] })).toThrow(PricingError);
  });
});
