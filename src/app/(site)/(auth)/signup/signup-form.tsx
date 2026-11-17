"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { signup } from "../actions";

function hasPendingCode() {
  try {
    return Boolean(sessionStorage.getItem("pending_code"));
  } catch {
    return false;
  }
}

export function SignupForm({ next, consentLabel }: { next: string; consentLabel: string }) {
  const [state, action] = useActionState(signup, initialFormState);
  const fromCode = useSyncExternalStore(() => () => {}, hasPendingCode, () => false);
  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {fromCode ? (
        <Notice tone="success" title="登録コードを読み取りました">
          会員登録が終わると、お子さまの登録の画面に進みます。
        </Notice>
      ) : null}
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="メールアドレス" required error={e.email} hint="確認番号とご注文のお知らせが届きます">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={v.email} className={bigInput} aria-invalid={Boolean(e.email)} />
      </Field>
      <Field id="password" label="パスワード" required error={e.password} hint="8文字以上">
        <Input id="password" name="password" type="password" autoComplete="new-password" className={bigInput} aria-invalid={Boolean(e.password)} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="fullName" label="お名前（保護者・ご家族）" required error={e.fullName}>
          <Input id="fullName" name="fullName" autoComplete="name" defaultValue={v.fullName} className={bigInput} aria-invalid={Boolean(e.fullName)} />
        </Field>
        <Field id="fullNameKana" label="ふりがな" required error={e.fullNameKana}>
          <Input id="fullNameKana" name="fullNameKana" defaultValue={v.fullNameKana} className={bigInput} aria-invalid={Boolean(e.fullNameKana)} />
        </Field>
      </div>
      <Field id="phone" label="電話番号" required error={e.phone} hint="メールが届かないときに、ツチダ映像からご連絡することがあります">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v.phone} className={bigInput} aria-invalid={Boolean(e.phone)} />
      </Field>
      <div className="space-y-3 rounded-xl border border-border p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="terms" className="mt-1 size-5 accent-[var(--brand)]" aria-invalid={Boolean(e.terms)} />
          <span>
            <Link href="/legal/terms" target="_blank" className="font-bold text-brand underline underline-offset-4">利用規約</Link>
            と
            <Link href="/legal/privacy" target="_blank" className="font-bold text-brand underline underline-offset-4">プライバシーポリシー</Link>
            に同意します（必須）
          </span>
        </label>
        {e.terms ? <p className="text-sm font-bold text-danger">{e.terms}</p> : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="marketing" defaultChecked={v.marketing === "on"} className="mt-1 size-5 accent-[var(--brand)]" />
          <span>
            {consentLabel}（任意）
            <span className="block text-sm text-muted-foreground">あとからマイページで止められます。ご注文やお支払いのメールは、この欄に関係なく届きます。</span>
          </span>
        </label>
      </div>
      <SubmitButton size="xl" className="w-full">確認番号を送る</SubmitButton>
    </form>
  );
}
