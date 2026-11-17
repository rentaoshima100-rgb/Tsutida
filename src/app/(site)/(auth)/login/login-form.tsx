"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(login, initialFormState);
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="メールアドレス">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={v.email} className={bigInput} />
      </Field>
      <Field id="password" label="パスワード">
        <Input id="password" name="password" type="password" autoComplete="current-password" className={bigInput} />
      </Field>
      <SubmitButton size="xl" className="w-full">ログイン</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/password/reset" className="font-bold text-brand underline underline-offset-4">
          パスワードを忘れた方
        </Link>
      </p>
    </form>
  );
}
