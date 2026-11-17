"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Textarea } from "@/components/ui/textarea";
import { calcOrder, formatYen, type PricingProduct } from "@/lib/domain/pricing";
import { initialFormState, type FormState } from "@/lib/form";

type Product = PricingProduct & { name: string; classIds: string[] };
type Method = "konbini" | "bank_transfer" | "cash";

const METHOD_LABEL: Record<Method, string> = {
  konbini: "コンビニ払い（払込票を印刷して渡す）",
  bank_transfer: "銀行振込（振込先を印刷して渡す）",
  cash: "現金（移行期間のみ。入金は注文の詳細で記録）",
};

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="flex items-center gap-1.5 font-bold">
        {label}
        {required ? <span className="rounded bg-ink px-1 text-[0.7rem] font-bold text-white">必須</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

/** A09 の入力。金額は calcOrder で画面上でも計算し、確定の値はサーバーで計算し直す */
export function ProxyOrderForm({
  action,
  isLate,
  deliveryMethod,
  shippingFee,
  classes,
  products,
  methods,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  isLate: boolean;
  deliveryMethod: "school" | "mail" | "either";
  shippingFee: number;
  classes: { id: string; label: string }[];
  products: Product[];
  methods: { konbini: boolean; bank_transfer: boolean };
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const fixedDelivery: "school" | "mail" | null = isLate ? "mail" : deliveryMethod === "either" ? null : deliveryMethod;
  const [classId, setClassId] = useState("");
  const classRef = useRef<HTMLSelectElement>(null);
  // React は処理のあとフォームを初期値に戻す。エラーで戻ったときに、選んでいたクラスが「選ぶ」に戻らないようにする
  useEffect(() => {
    if (classId !== "" && classRef.current && classRef.current.value !== classId) classRef.current.value = classId;
  }, [state, classId]);
  const [delivery, setDelivery] = useState<"school" | "mail">(fixedDelivery ?? "school");
  const [qty, setQty] = useState<Record<string, number>>({});
  const available: Method[] = [...(methods.konbini ? (["konbini"] as const) : []), ...(methods.bank_transfer ? (["bank_transfer"] as const) : []), "cash"];
  const [method, setMethod] = useState<Method>(available[0]);
  const [email, setEmail] = useState("");

  const usable = products.filter((p) => p.classIds.length === 0 || (classId !== "" && p.classIds.includes(classId)));
  const pricing = useMemo(() => {
    const lines = usable.filter((p) => (qty[p.id] ?? 0) > 0).map((p, i) => ({ lineNo: i + 1, productId: p.id, quantity: qty[p.id] }));
    if (lines.length === 0) return null;
    try {
      return calcOrder({ lines, products: new Map(usable.map((p) => [p.id, p])), isLate, deliveryMethod: delivery, shippingFee });
    } catch {
      return null;
    }
  }, [usable, qty, isLate, delivery, shippingFee]);

  const effectiveDelivery = fixedDelivery ?? delivery;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        {state.message ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-base font-bold">お子さま</legend>
          <Field label="学年・クラス" required>
            <select ref={classRef} name="classId" required value={classId} onChange={(e) => setClassId(e.target.value)} className={`${selectClass} h-10 w-full max-w-sm`}>
              <option value="" disabled>選ぶ</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="お名前" required><input name="childName" required maxLength={40} defaultValue={state.values?.childName} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
            <Field label="ふりがな" required hint="同じクラスにふりがなが同じお子さまがいれば、そのお子さまの注文になります">
              <input name="childKana" required maxLength={60} defaultValue={state.values?.childKana} className={`${inputClass} h-10 w-full`} autoComplete="off" />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-bold">商品と枚数</legend>
          {isLate ? <p className="text-sm text-muted-foreground">締切後の注文です。全枚数が締切後の価格になり、郵送でのお届けになります。</p> : null}
          <ul className="divide-y rounded-xl border">
            {products.map((p) => {
              const ok = usable.includes(p);
              const unit = isLate ? (p.latePrice ?? p.price) : p.price;
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div>
                    <p className="font-bold">{p.name}</p>
                    <p className="text-muted-foreground">
                      {formatYen(unit)}
                      {!isLate && p.secondPrice !== null ? `（2枚目から ${formatYen(p.secondPrice)}）` : ""}
                      {p.classIds.length > 0 ? "　対象のクラスだけ" : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <span className="sr-only">{p.name}の枚数</span>
                    <input
                      type="number"
                      name={`qty:${p.id}`}
                      min={0}
                      max={20}
                      inputMode="numeric"
                      disabled={!ok}
                      value={ok ? (qty[p.id] ?? 0) : 0}
                      onChange={(e) => setQty({ ...qty, [p.id]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                      className={`${inputClass} h-10 w-20 text-right`}
                    />
                    <span>枚</span>
                  </label>
                  {!ok && classId ? <p className="w-full text-xs text-muted-foreground">このクラスでは買えません</p> : null}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-base font-bold">受け取り</legend>
          {fixedDelivery ? (
            <>
              <input type="hidden" name="deliveryMethod" value={fixedDelivery} />
              <p className="text-sm">{fixedDelivery === "school" ? "学校・園でお渡し" : "郵送"}（この行事はこの方法だけです）</p>
            </>
          ) : (
            <div className="flex flex-wrap gap-4 text-sm">
              {(["school", "mail"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input type="radio" name="deliveryMethod" value={m} checked={delivery === m} onChange={() => setDelivery(m)} className="size-4" />
                  {m === "school" ? "学校・園でお渡し" : `郵送（送料 ${formatYen(shippingFee)}、DVD・Blu-rayがあるとき）`}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-base font-bold">注文者</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="お名前" required><input name="buyerName" required maxLength={40} defaultValue={state.values?.buyerName} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
            <Field label="ふりがな"><input name="buyerKana" maxLength={60} defaultValue={state.values?.buyerKana} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
            <Field label="電話番号" required><input name="buyerPhone" type="tel" required maxLength={20} defaultValue={state.values?.buyerPhone} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
            <Field label="メールアドレス" required={method === "konbini"} hint="あれば、支払いの案内と注文のお知らせをメールでも送ります">
              <input name="buyerEmail" type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} h-10 w-full`} autoComplete="off" />
            </Field>
          </div>
          {effectiveDelivery === "mail" ? (
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label="郵便番号" required><input name="shipPostalCode" required maxLength={10} inputMode="numeric" defaultValue={state.values?.shipPostalCode} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
              <Field label="住所" required hint="お届け先の宛名は、注文者のお名前になります"><input name="shipAddress" required maxLength={200} defaultValue={state.values?.shipAddress} className={`${inputClass} h-10 w-full`} autoComplete="off" /></Field>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-bold">支払い方法</legend>
          {available.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="paymentMethod" value={m} checked={method === m} onChange={() => setMethod(m)} className="size-4" />
              {METHOD_LABEL[m]}
            </label>
          ))}
          {!methods.konbini || !methods.bank_transfer ? (
            <p className="text-xs text-muted-foreground">設定（A16）でオフの支払い方法は出していません。</p>
          ) : null}
          {method === "konbini" && !email ? (
            <Notice tone="warning">コンビニ払いには注文者のメールアドレスが必要です。メールがない方は、銀行振込か現金にしてください。</Notice>
          ) : null}
        </fieldset>

        <Field label="メモ（社内用）">
          <Textarea name="memo" maxLength={1000} rows={2} defaultValue={state.values?.memo} />
        </Field>
      </div>

      <aside aria-label="金額" className="h-fit space-y-3 rounded-xl border-2 border-ink p-4 lg:sticky lg:top-4">
        <h3 className="font-bold">金額</h3>
        {pricing ? (
          <dl className="space-y-1 text-sm">
            {pricing.lines.map((l) => {
              const p = usable.find((x) => x.id === l.productId)!;
              return (
                <div key={l.lineNo} className="flex justify-between gap-2">
                  <dt>{p.name} ×{l.quantity}</dt>
                  <dd className="whitespace-nowrap">{formatYen(l.amount)}</dd>
                </div>
              );
            })}
            <div className="flex justify-between gap-2 border-t pt-1">
              <dt>送料</dt>
              <dd>{formatYen(pricing.shippingFee)}</dd>
            </div>
            <div className="flex justify-between gap-2 text-base font-bold">
              <dt>合計</dt>
              <dd>{formatYen(pricing.total)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">商品の枚数を入れると、ここに金額が出ます。</p>
        )}
        <SubmitButton size="lg" className="w-full" disabled={!pricing} pendingLabel="注文を作っています…">
          注文を作る
        </SubmitButton>
        <p className="text-xs text-muted-foreground">作ったあと、払込票・振込先（現金は注文の控え）を印刷する画面に進みます。</p>
      </aside>
    </form>
  );
}
