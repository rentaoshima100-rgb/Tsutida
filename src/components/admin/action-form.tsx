"use client";

import { useActionState } from "react";
import { Notice } from "@/components/site/notice";
import { initialFormState, type FormState } from "@/lib/form";

/** サーバーの処理を呼ぶフォーム。結果の文言をフォームの上に出す。confirm があれば確認してから送る */
export function ActionForm({
  action,
  children,
  confirm,
  className,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={className}
    >
      {state.message ? <Notice tone={state.ok ? "success" : "error"} className="mb-3">{state.message}</Notice> : null}
      {children}
    </form>
  );
}
