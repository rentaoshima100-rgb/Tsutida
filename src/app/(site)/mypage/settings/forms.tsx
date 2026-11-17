"use client";

import { useActionState } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { changePassword, confirmEmailChange, requestEmailChange, updateConsent, updateProfile, withdraw } from "./actions";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function ProfileForm({ initial }: { initial: Record<string, string> }) {
  const [state, action] = useActionState(updateProfile, initialFormState);
  const v = state.values ?? initial;
  const e = state.errors ?? {};
  return (
    <Section title="会員情報">
      <form action={action} className="space-y-4" noValidate>
        {state.message ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fullName" label="お名前" error={e.fullName}><Input id="fullName" name="fullName" defaultValue={v.fullName} className={bigInput} /></Field>
          <Field id="fullNameKana" label="ふりがな" error={e.fullNameKana}><Input id="fullNameKana" name="fullNameKana" defaultValue={v.fullNameKana} className={bigInput} /></Field>
        </div>
        <Field id="phone" label="電話番号" error={e.phone}><Input id="phone" name="phone" type="tel" defaultValue={v.phone} className={bigInput} /></Field>
        <Field id="postalCode" label="郵便番号" error={e.postalCode} hint="郵送でのご注文のときに、お届け先の初期値になります"><Input id="postalCode" name="postalCode" inputMode="numeric" defaultValue={v.postalCode} className={`${bigInput} max-w-48`} /></Field>
        <Field id="address" label="住所" error={e.address}><Input id="address" name="address" defaultValue={v.address} className={bigInput} /></Field>
        <SubmitButton size="xl">保存する</SubmitButton>
      </form>
    </Section>
  );
}

export function EmailForm({ current }: { current: string }) {
  const [req, reqAction] = useActionState(requestEmailChange, initialFormState);
  const [conf, confAction] = useActionState(confirmEmailChange, initialFormState);
  return (
    <Section title="メールアドレス">
      <p>いまのアドレス：{conf.values?.done ? conf.values.email : current}</p>
      {conf.values?.done ? <Notice tone="success">{conf.message}</Notice> : !req.ok ? (
        <form action={reqAction} className="space-y-4" noValidate>
          {req.message ? <Notice tone="error">{req.message}</Notice> : null}
          <Field id="email" label="新しいメールアドレス" error={req.errors?.email}><Input id="email" name="email" type="email" defaultValue={req.values?.email} className={bigInput} /></Field>
          <SubmitButton size="xl" variant="outline">確認番号を送る</SubmitButton>
        </form>
      ) : (
        <form action={confAction} className="space-y-4" noValidate>
          <Notice tone="info">{req.values?.email} に確認番号を送りました。</Notice>
          {conf.message && !conf.ok ? <Notice tone="error">{conf.message}</Notice> : null}
          <Field id="token" label="確認番号（6桁）" error={conf.errors?.token}><Input id="token" name="token" inputMode="numeric" maxLength={6} className={`${bigInput} max-w-48 text-center font-mono text-xl tracking-[0.3em]`} /></Field>
          <SubmitButton size="xl">メールアドレスを変更する</SubmitButton>
        </form>
      )}
    </Section>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, initialFormState);
  const e = state.errors ?? {};
  return (
    <Section title="パスワード">
      <form action={action} className="space-y-4" noValidate>
        {state.message ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
        <Field id="current" label="いまのパスワード" error={e.current}><Input id="current" name="current" type="password" autoComplete="current-password" className={bigInput} /></Field>
        <Field id="next" label="新しいパスワード" error={e.next} hint="8文字以上"><Input id="next" name="next" type="password" autoComplete="new-password" className={bigInput} /></Field>
        <SubmitButton size="xl" variant="outline">パスワードを変更する</SubmitButton>
      </form>
    </Section>
  );
}

export function ConsentForm({ optIn, label }: { optIn: boolean; label: string }) {
  const [state, action] = useActionState(updateConsent, initialFormState);
  return (
    <Section title="お知らせメール">
      <form action={action} className="space-y-4">
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <label className="flex items-start gap-3">
          <input type="checkbox" name="marketing" defaultChecked={optIn} className="mt-1 size-5 accent-[var(--brand)]" />
          <span>{label}<span className="block text-sm text-muted-foreground">ご注文・お支払い・お届けのメールは、この設定に関係なく届きます。</span></span>
        </label>
        <SubmitButton size="xl" variant="outline">設定を保存する</SubmitButton>
      </form>
    </Section>
  );
}

export function WithdrawForm() {
  const [state, action] = useActionState(withdraw, initialFormState);
  return (
    <Section title="退会">
      <form action={action} className="space-y-4" onSubmit={(e) => { if (!window.confirm("退会すると、このアカウントでログインできなくなります。よろしいですか？")) e.preventDefault(); }}>
        {state.message ? <Notice tone="error">{state.message}</Notice> : null}
        <p className="text-[0.95rem]">退会すると、このアカウントでログインできなくなります。ご注文の記録は、法律で決められた期間保管します。</p>
        <label className="flex items-start gap-3"><input type="checkbox" name="confirm" className="mt-1 size-5" /><span>上の内容を確認しました</span></label>
        <SubmitButton size="xl" variant="destructive">退会する</SubmitButton>
      </form>
    </Section>
  );
}
