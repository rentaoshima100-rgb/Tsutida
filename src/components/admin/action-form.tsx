"use client";

import { useActionState, useEffect, useRef } from "react";
import { Notice } from "@/components/site/notice";
import { initialFormState, type FormState } from "@/lib/form";

type Snapshot = [string, string][];

/** 送る直前の入力を控える（ファイルと、React が足す $ACTION の項目は除く） */
function takeSnapshot(form: HTMLFormElement): Snapshot {
  const out: Snapshot = [];
  for (const [name, value] of new FormData(form).entries()) {
    if (typeof value === "string" && !name.startsWith("$ACTION")) out.push([name, value]);
  }
  return out;
}

/** エラーで戻ったときに、控えておいた入力をフォームに戻す */
function restoreSnapshot(form: HTMLFormElement, snapshot: Snapshot) {
  const values = new Map<string, string[]>();
  for (const [name, value] of snapshot) values.set(name, [...(values.get(name) ?? []), value]);
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) continue;
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (["hidden", "file", "submit", "button", "reset", "image"].includes(el.type)) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = (values.get(el.name) ?? []).includes(el.value);
        continue;
      }
    }
    const rest = values.get(el.name);
    if (rest && rest.length > 0) el.value = rest.shift() as string;
  }
}

/**
 * サーバーの処理を呼ぶフォーム。結果の文言をフォームの上に出す。confirm があれば確認してから送る。
 * React は処理のあとフォームを初期値に戻すので、エラーのときは入力した内容を戻す（打ち直しをさせない）
 */
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
  const formRef = useRef<HTMLFormElement>(null);
  const snapshot = useRef<Snapshot | null>(null);

  useEffect(() => {
    if (state.ok || !state.message || !snapshot.current || !formRef.current) return;
    restoreSnapshot(formRef.current, snapshot.current);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        snapshot.current = takeSnapshot(e.currentTarget);
      }}
      className={className}
    >
      {state.message ? <Notice tone={state.ok ? "success" : "error"} className="mb-3">{state.message}</Notice> : null}
      {children}
    </form>
  );
}
