"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { initialFormState } from "@/lib/form";
import { unsubscribe } from "./actions";

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(unsubscribe.bind(null, token), initialFormState);
  if (state.message) return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <p>販売開始や締切前などの、お知らせメールの配信を止めます。</p>
      <SubmitButton size="xl">配信を止める</SubmitButton>
    </form>
  );
}
