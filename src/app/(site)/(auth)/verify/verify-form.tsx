"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialFormState, type FormState } from "@/lib/form";
import { resendSignupCode, verifySignup } from "../actions";

const RESEND_WAIT = 60;

export function VerifyForm({ resent }: { resent: boolean }) {
  const [state, action] = useActionState(verifySignup, initialFormState);
  const [resend, setResend] = useState<FormState | null>(resent ? { ok: true, message: "確認番号を送りました" } : null);
  const [wait, setWait] = useState(RESEND_WAIT);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const e = state.errors ?? {};
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5" noValidate>
        {state.message ? <Notice tone="error">{state.message}</Notice> : null}
        {resend?.message ? <Notice tone={resend.ok ? "success" : "error"}>{resend.message}</Notice> : null}
        <Field id="token" label="確認番号（6桁）" required error={e.token}>
          <Input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className={`${bigInput} text-center font-mono text-2xl tracking-[0.4em]`}
            aria-invalid={Boolean(e.token)}
          />
        </Field>
        <SubmitButton size="xl" className="w-full">登録を完了する</SubmitButton>
      </form>
      <div className="space-y-2 text-center">
        <Button
          type="button"
          variant="outline"
          size="xl"
          disabled={wait > 0 || pending}
          onClick={() =>
            start(async () => {
              setResend(await resendSignupCode());
              setWait(RESEND_WAIT);
            })
          }
        >
          {wait > 0 ? `確認番号をもう一度送る（あと${wait}秒）` : "確認番号をもう一度送る"}
        </Button>
      </div>
    </div>
  );
}
