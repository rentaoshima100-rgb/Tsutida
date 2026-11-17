"use client";

import { Minus, Plus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { calcOrder, formatYen } from "@/lib/domain/pricing";
import { initialFormState } from "@/lib/form";
import { reviewOrder } from "./actions";

export type OrderFormProps = {
  eventId: string;
  isLate: boolean;
  children: { childId: string; label: string; productIds: string[] }[];
  products: { id: string; name: string; kind: "disc" | "data"; price: number; secondPrice: number | null; latePrice: number | null }[];
  deliveryOptions: ("school" | "mail")[];
  shippingFee: number;
  paymentMethods: { method: "card" | "paypay" | "konbini" | "bank_transfer"; label: string; note: string; disabledReason: string | null }[];
  initial: {
    quantities: Record<string, number>;
    deliveryMethod: "school" | "mail";
    shipping: { name: string; postalCode: string; address: string; phone: string };
    paymentMethod: string;
  };
};

const key = (productId: string, childId: string) => `${productId}:${childId}`;

export function OrderForm(props: OrderFormProps) {
  const action = reviewOrder.bind(null, props.eventId);
  const [state, formAction] = useActionState(action, initialFormState);
  const [qty, setQty] = useState<Record<string, number>>(props.initial.quantities);
  const [delivery, setDelivery] = useState(props.initial.deliveryMethod);
  const [shipping, setShipping] = useState(props.initial.shipping);
  const [method, setMethod] = useState(props.initial.paymentMethod);

  // 明細は「お子さまの順 × 商品の順」で作る（9.2 の配分の順番）
  const lines = useMemo(() => {
    const out: { productId: string; childId: string; quantity: number }[] = [];
    for (const c of props.children) for (const p of props.products) {
      const q = qty[key(p.id, c.childId)] ?? 0;
      if (q > 0 && c.productIds.includes(p.id)) out.push({ productId: p.id, childId: c.childId, quantity: q });
    }
    return out;
  }, [qty, props.children, props.products]);

  const preview = useMemo(() => {
    if (lines.length === 0) return null;
    return calcOrder({
      lines: lines.map((l, i) => ({ lineNo: i + 1, productId: l.productId, quantity: l.quantity })),
      products: new Map(props.products.map((p) => [p.id, p])),
      isLate: props.isLate,
      deliveryMethod: delivery,
      shippingFee: props.shippingFee,
    });
  }, [lines, props.products, props.isLate, delivery, props.shippingFee]);

  const cart = JSON.stringify({
    lines,
    deliveryMethod: delivery,
    shipping: delivery === "mail" ? shipping : undefined,
    paymentMethod: method,
  });
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="cart" value={cart} />
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}

      <section className="space-y-4">
        <h2 className="text-lg font-bold">商品と枚数</h2>
        {props.children.map((c) => (
          <fieldset key={c.childId} className="rounded-2xl border border-border p-4">
            <legend className="px-1 font-bold">{c.label}の分</legend>
            <ul className="mt-1 divide-y divide-border">
              {props.products.filter((p) => c.productIds.includes(p.id)).map((p) => {
                const k = key(p.id, c.childId);
                const q = qty[k] ?? 0;
                const unit = props.isLate ? (p.latePrice ?? p.price) : p.price;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-bold">{p.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatYen(unit)}
                        {!props.isLate && p.secondPrice && p.secondPrice !== p.price ? `（2枚目から ${formatYen(p.secondPrice)}）` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1" role="group" aria-label={`${c.label}の${p.name}の枚数`}>
                      <button type="button" className="flex size-12 items-center justify-center rounded-xl border border-input disabled:opacity-40" onClick={() => setQty({ ...qty, [k]: Math.max(0, q - 1) })} disabled={q === 0} aria-label="1枚減らす">
                        <Minus className="size-5" aria-hidden />
                      </button>
                      <output className="w-10 text-center text-xl font-bold" aria-live="polite">{q}</output>
                      <button type="button" className="flex size-12 items-center justify-center rounded-xl border border-input disabled:opacity-40" onClick={() => setQty({ ...qty, [k]: Math.min(9, q + 1) })} disabled={q >= 9} aria-label="1枚増やす">
                        <Plus className="size-5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">受け取り方法</h2>
        {props.deliveryOptions.length > 1 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {props.deliveryOptions.map((d) => (
              <label key={d} className="flex items-start gap-3 rounded-xl border border-border p-4 has-checked:border-brand has-checked:bg-[#eef3fb]">
                <input type="radio" name="delivery" checked={delivery === d} onChange={() => setDelivery(d)} className="mt-1 size-5 accent-[var(--brand)]" />
                <span>
                  <span className="block font-bold">{d === "school" ? "学校・園で受け取る" : "自宅へ郵送"}</span>
                  <span className="text-sm text-muted-foreground">{d === "school" ? "送料はかかりません" : `送料 ${formatYen(props.shippingFee)}`}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-surface p-4">
            {props.deliveryOptions[0] === "school" ? "学校・園でお受け取りください（送料はかかりません）" : `ご自宅へ郵送します（送料 ${formatYen(props.shippingFee)}）`}
          </p>
        )}
      </section>

      {delivery === "mail" ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">お届け先</h2>
          <Field id="ship-name" label="お名前" required error={e["shipping.name"]}>
            <Input id="ship-name" autoComplete="name" value={shipping.name} onChange={(ev) => setShipping({ ...shipping, name: ev.target.value })} className={bigInput} />
          </Field>
          <Field id="ship-postal" label="郵便番号" required error={e["shipping.postalCode"]}>
            <Input id="ship-postal" autoComplete="postal-code" inputMode="numeric" placeholder="910-0000" value={shipping.postalCode} onChange={(ev) => setShipping({ ...shipping, postalCode: ev.target.value })} className={`${bigInput} max-w-48`} />
          </Field>
          <Field id="ship-address" label="住所" required error={e["shipping.address"]} hint="建物名・部屋番号まで入力してください">
            <Input id="ship-address" autoComplete="street-address" value={shipping.address} onChange={(ev) => setShipping({ ...shipping, address: ev.target.value })} className={bigInput} />
          </Field>
          <Field id="ship-phone" label="電話番号" required error={e["shipping.phone"]}>
            <Input id="ship-phone" type="tel" autoComplete="tel" inputMode="tel" value={shipping.phone} onChange={(ev) => setShipping({ ...shipping, phone: ev.target.value })} className={bigInput} />
          </Field>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">お支払い方法</h2>
        {e.paymentMethod ? <p className="text-sm font-bold text-danger">{e.paymentMethod}</p> : null}
        <div className="space-y-2">
          {props.paymentMethods.map((m) => (
            <label key={m.method} className="flex items-start gap-3 rounded-xl border border-border p-4 has-checked:border-brand has-checked:bg-[#eef3fb] has-disabled:opacity-60">
              <input type="radio" name="method" checked={method === m.method} disabled={Boolean(m.disabledReason)} onChange={() => setMethod(m.method)} className="mt-1 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block font-bold">{m.label}</span>
                <span className="text-sm text-muted-foreground">{m.disabledReason ?? m.note}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* 画面の下に合計と「確認へ進む」を出し続ける。フォームの終わりで止まり、ページの下の事業者の表示は隠さない */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div aria-live="polite">
            <p className="text-sm text-muted-foreground">合計（税込{preview && preview.shippingFee > 0 ? "・送料込み" : ""}）</p>
            <p className="text-xl font-bold">{preview ? formatYen(preview.total) : "—"}</p>
          </div>
          <SubmitButton size="xl" disabled={!preview || !method} pendingLabel="確かめています…">
            確認へ進む
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
