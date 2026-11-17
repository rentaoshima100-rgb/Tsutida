"use client";

import { useActionState } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialFormState } from "@/lib/form";
import { sendContact } from "./actions";

export function ContactForm({
  defaults,
  orders,
}: {
  defaults: { name: string; email: string };
  orders: { orderNo: string; label: string }[];
}) {
  const [state, action] = useActionState(sendContact, initialFormState);
  if (state.ok) return <Notice tone="success" title={state.message} />;
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field id="name" label="お名前" required error={e.name}>
        <Input id="name" name="name" autoComplete="name" defaultValue={v.name ?? defaults.name} className={bigInput} aria-invalid={Boolean(e.name)} />
      </Field>
      <Field id="email" label="メールアドレス" required error={e.email} hint="ご返信はこのアドレスにお送りします">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={v.email ?? defaults.email} className={bigInput} aria-invalid={Boolean(e.email)} />
      </Field>
      {orders.length > 0 ? (
        <Field id="orderNo" label="どのご注文について">
          <select id="orderNo" name="orderNo" defaultValue={v.orderNo ?? ""} className={`${bigInput} w-full border`}>
            <option value="">選ばない</option>
            {orders.map((o) => (
              <option key={o.orderNo} value={o.orderNo}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field id="message" label="お問い合わせの内容" required error={e.message}>
        <Textarea id="message" name="message" rows={7} defaultValue={v.message} className="rounded-xl text-base md:text-base" aria-invalid={Boolean(e.message)} />
      </Field>
      <div aria-hidden className="hidden">
        <label htmlFor="website">ウェブサイト</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton size="xl" className="w-full sm:w-auto">
        送信する
      </SubmitButton>
    </form>
  );
}
