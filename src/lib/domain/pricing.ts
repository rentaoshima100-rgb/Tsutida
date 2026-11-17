// 金額の計算（9.2 calcOrder）。画面・Checkout・取り消し・代理注文のすべてでこの関数だけを使う。
// 金額は税込の整数（円）。割り算をせず、端数を出さない。

export type PricingProduct = {
  id: string;
  kind: "disc" | "data";
  price: number;
  secondPrice: number | null;
  latePrice: number | null;
};

export type PricingLine = {
  /** 明細を作った順の番号（小さいほど先） */
  lineNo: number;
  productId: string;
  quantity: number;
};

export type PricingInput = {
  lines: PricingLine[];
  products: ReadonlyMap<string, PricingProduct> | Record<string, PricingProduct>;
  /** 締切後の注文 */
  isLate: boolean;
  deliveryMethod: "school" | "mail";
  /** 郵送のときの送料（行事の shipping_fee、なければ設定の初期値） */
  shippingFee: number;
};

export type PricedLine = {
  lineNo: number;
  productId: string;
  quantity: number;
  /** 1枚ずつの単価（並びは枚数の順） */
  unitPrices: number[];
  amount: number;
};

export type PricingResult = {
  lines: PricedLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
};

export class PricingError extends Error {}

function getProduct(products: PricingInput["products"], id: string): PricingProduct {
  const p = products instanceof Map ? products.get(id) : (products as Record<string, PricingProduct>)[id];
  if (!p) throw new PricingError(`unknown product: ${id}`);
  return p;
}

function assertYen(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new PricingError(`${label} must be a non-negative integer`);
}

export function calcOrder(input: PricingInput): PricingResult {
  assertYen(input.shippingFee, "shippingFee");
  const sorted = [...input.lines].sort((a, b) => a.lineNo - b.lineNo);
  const seenLineNos = new Set<number>();
  // 同じ商品の、注文全体でのこれまでの枚数
  const countByProduct = new Map<string, number>();

  const lines: PricedLine[] = sorted.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new PricingError(`quantity must be a positive integer (line ${line.lineNo})`);
    }
    if (seenLineNos.has(line.lineNo)) throw new PricingError(`duplicate lineNo ${line.lineNo}`);
    seenLineNos.add(line.lineNo);

    const product = getProduct(input.products, line.productId);
    assertYen(product.price, "price");
    if (product.secondPrice !== null) assertYen(product.secondPrice, "secondPrice");
    if (product.latePrice !== null) assertYen(product.latePrice, "latePrice");

    const unitPrices: number[] = [];
    for (let i = 0; i < line.quantity; i++) {
      const nth = (countByProduct.get(product.id) ?? 0) + 1;
      countByProduct.set(product.id, nth);
      if (input.isLate) {
        // 締切後の注文は全枚数を締切後の価格（2枚目以降の価格は使わない。17章：未決）
        unitPrices.push(product.latePrice ?? product.price);
      } else {
        unitPrices.push(nth === 1 ? product.price : (product.secondPrice ?? product.price));
      }
    }
    return {
      lineNo: line.lineNo,
      productId: line.productId,
      quantity: line.quantity,
      unitPrices,
      amount: unitPrices.reduce((sum, v) => sum + v, 0),
    };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const hasDisc = lines.some((l) => getProduct(input.products, l.productId).kind === "disc");
  const shippingFee = input.deliveryMethod === "mail" && hasDisc ? input.shippingFee : 0;
  return { lines, subtotal, shippingFee, total: subtotal + shippingFee };
}

/** 3,000円 */
export function formatYen(value: number): string {
  return `${value.toLocaleString("ja-JP")}円`;
}

/** Stripe のコンビニ払いで受け付けられる金額（120円以上30万円以下。9.1） */
export const KONBINI_MIN = 120;
export const KONBINI_MAX = 300_000;
