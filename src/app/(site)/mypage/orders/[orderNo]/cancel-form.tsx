"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { initialFormState } from "@/lib/form";
import { cancelOrderItems } from "./actions";

export function CancelForm({
  orderNo,
  mode,
  items,
  deadlineLabel,
}: {
  orderNo: string;
  mode: "items" | "order";
  items: { id: string; label: string }[];
  deadlineLabel: string;
}) {
  const [state, action] = useActionState(cancelOrderItems.bind(null, orderNo), initialFormState);
  const [selected, setSelected] = useState<string[]>([]);
  if (state.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(mode === "order" ? "このご注文を取り消します。よろしいですか？" : "選んだ明細を取り消します。よろしいですか？")) e.preventDefault();
      }}
      className="space-y-3 rounded-2xl border border-border p-5"
    >
      <h2 className="text-lg font-bold">ご注文の取り消し</h2>
      <p className="text-[0.95rem] text-muted-foreground">{deadlineLabel}まで取り消せます。</p>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      {mode === "order" ? (
        <>
          <input type="hidden" name="all" value="1" />
          <p className="text-[0.95rem]">お支払い前のご注文は、ご注文ごとの取り消しになります（払込票・振込先は使えなくなります）。</p>
          <SubmitButton size="xl" variant="outline" className="w-full sm:w-auto">このご注文を取り消す</SubmitButton>
        </>
      ) : (
        <>
          <p className="text-[0.95rem]">取り消す明細を選んでください。取り消したあとの内容で合計を計算し直し、差額を返金します。</p>
          <div className="space-y-2">
            {items.map((i) => (
              <label key={i.id} className="flex items-start gap-3 rounded-xl border border-border p-3 has-checked:border-danger has-checked:bg-danger-soft">
                <input
                  type="checkbox"
                  name="item"
                  value={i.id}
                  checked={selected.includes(i.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))}
                  className="mt-1 size-5"
                />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
          <SubmitButton size="xl" variant="outline" className="w-full sm:w-auto" disabled={selected.length === 0}>
            選んだ明細を取り消す
          </SubmitButton>
        </>
      )}
    </form>
  );
}
