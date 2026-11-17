"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { Field, bigInput } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { Input } from "@/components/ui/input";
import { initialFormState } from "@/lib/form";
import { registerChildCode } from "./actions";

const noSubscribe = () => () => {};

/** /r で保存したコード（保存できない環境では空） */
function readPendingCode(): string {
  try {
    return sessionStorage.getItem("pending_code") ?? "";
  } catch {
    return "";
  }
}

export function CodeForm({ childOptions }: { childOptions: { id: string; label: string }[] }) {
  const [state, action] = useActionState(registerChildCode, initialFormState);
  // QR コードから来たときは、/r で保存したコードを入れておく（4章）。サーバーで描くときは空にする
  const pending = useSyncExternalStore(noSubscribe, readPendingCode, () => "");
  const [typed, setTyped] = useState<string | null>(state.values?.code ?? null);
  const [target, setTarget] = useState(state.values?.target ?? "new");
  // 送信の結果が変わったら、入力欄を合わせる（登録できたら空に、エラーなら入力した値に）
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setTyped(state.ok ? "" : (state.values?.code ?? typed));
  }
  useEffect(() => {
    if (!state.ok) return;
    try {
      sessionStorage.removeItem("pending_code");
    } catch {
      /* 保存できない環境 */
    }
  }, [state]);
  const code = typed ?? pending;

  const v = state.values ?? {};
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <Field id="code" label="登録コード（12文字）" required error={e.code} hint="カードに書かれた英数字です。QRコードから開いた場合は入力済みです">
        <Input
          id="code"
          name="code"
          value={code}
          onChange={(ev) => setTyped(ev.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="例：ABCD-EFGH-JKMN"
          className={`${bigInput} font-mono tracking-[0.12em] uppercase`}
          aria-invalid={Boolean(e.code)}
        />
      </Field>
      {childOptions.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="font-bold">どのお子さまのコードですか</legend>
          <p className="text-sm text-muted-foreground">新年度のカードは、すでに登録しているお子さまを選んでください。</p>
          <div className="space-y-2">
            {childOptions.map((c) => (
              <label key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 has-checked:border-brand has-checked:bg-[#eef3fb]">
                <input type="radio" name="target" value={c.id} checked={target === c.id} onChange={() => setTarget(c.id)} className="size-5 accent-[var(--brand)]" />
                <span>{c.label}（新年度のコード）</span>
              </label>
            ))}
            <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 has-checked:border-brand has-checked:bg-[#eef3fb]">
              <input type="radio" name="target" value="new" checked={target === "new"} onChange={() => setTarget("new")} className="size-5 accent-[var(--brand)]" />
              <span>はじめて登録するお子さま（兄弟姉妹など）・ご家族が登録したお子さま</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="target" value="new" />
      )}
      {target === "new" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="fullName" label="お子さまのお名前" required error={e.fullName}>
            <Input id="fullName" name="fullName" defaultValue={v.fullName} className={bigInput} aria-invalid={Boolean(e.fullName)} />
          </Field>
          <Field id="fullNameKana" label="ふりがな" required error={e.fullNameKana} hint="ご家族が先に登録した場合は、同じふりがなを入力してください">
            <Input id="fullNameKana" name="fullNameKana" defaultValue={v.fullNameKana} className={bigInput} aria-invalid={Boolean(e.fullNameKana)} />
          </Field>
        </div>
      ) : null}
      <SubmitButton size="xl" className="w-full sm:w-auto">登録する</SubmitButton>
    </form>
  );
}
