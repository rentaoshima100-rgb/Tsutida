"use client";

import { useActionState } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { confirmPasswordReset, requestPasswordReset } from "../../actions";

export function ResetForm() {
  const [requested, requestAction] = useActionState(requestPasswordReset, initialFormState);
  const [confirmed, confirmAction] = useActionState(confirmPasswordReset, initialFormState);

  if (!requested.ok) {
    const e = requested.errors ?? {};
    return (
      <form action={requestAction} className="space-y-5" noValidate>
        <p className="leading-8">登録したメールアドレスに、パスワードを決め直すための6桁の確認番号を送ります。</p>
        <Field id="email" label="メールアドレス" error={e.email}>
          <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={requested.values?.email} className={bigInput} />
        </Field>
        <SubmitButton size="xl" className="w-full">確認番号を送る</SubmitButton>
      </form>
    );
  }
  const e = confirmed.errors ?? {};
  return (
    <form action={confirmAction} className="space-y-5" noValidate>
      <Notice tone="info">
        登録があれば、{requested.values?.email} に確認番号を送りました（届くまで数分かかることがあります）。
      </Notice>
      {confirmed.message ? <Notice tone="error">{confirmed.message}</Notice> : null}
      <Field id="token" label="確認番号（6桁）" error={e.token}>
        <Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${bigInput} text-center font-mono text-2xl tracking-[0.4em]`} />
      </Field>
      <Field id="password" label="新しいパスワード" error={e.password} hint="8文字以上">
        <Input id="password" name="password" type="password" autoComplete="new-password" className={bigInput} />
      </Field>
      <SubmitButton size="xl" className="w-full">パスワードを決め直す</SubmitButton>
    </form>
  );
}
