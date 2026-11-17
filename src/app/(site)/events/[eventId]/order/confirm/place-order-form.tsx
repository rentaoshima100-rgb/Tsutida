"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { initialFormState } from "@/lib/form";
import { placeOrder } from "../actions";

export function PlaceOrderForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState(placeOrder.bind(null, eventId), initialFormState);
  return (
    <form action={action} className="space-y-3">
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <SubmitButton size="xl" className="w-full" pendingLabel="お支払いの画面を開いています…">
        注文を確定して支払う
      </SubmitButton>
    </form>
  );
}
