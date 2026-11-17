"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { fakeDetails } from "@/lib/server/payments/fake-gateway";
import { processPaymentEvent } from "@/lib/server/payments/process";
import { createAdminClient } from "@/lib/supabase/server";

// 開発用の擬似決済の操作。PAYMENT_GATEWAY=fake のときだけ動く

function assertFake() {
  if (env().PAYMENT_GATEWAY !== "fake") throw new Error("not available");
}

function sameOrigin(url: string): string {
  const base = new URL(env().APP_BASE_URL);
  const u = new URL(url, base);
  return u.origin === base.origin ? u.toString() : base.toString();
}

export async function fakePay(orderId: string, sessionId: string, successUrl: string) {
  assertFake();
  await processPaymentEvent({ type: "checkout.paid", orderId, sessionId, paymentIntentId: `fake_pi_${orderId}` });
  redirect(sameOrigin(successUrl));
}

export async function fakeIssueVoucher(orderId: string, sessionId: string, successUrl: string) {
  assertFake();
  const { data: order } = await createAdminClient().from("orders").select("payment_method, total").eq("id", orderId).single();
  const method = order?.payment_method === "konbini" ? "konbini" : "bank_transfer";
  await processPaymentEvent({
    type: "checkout.awaiting_payment",
    orderId,
    sessionId,
    paymentIntentId: `fake_pi_${orderId}`,
    details: fakeDetails(method, order?.total ?? 0),
  });
  redirect(sameOrigin(successUrl));
}

export async function fakeReceive(orderId: string) {
  assertFake();
  await processPaymentEvent({ type: "payment.succeeded", orderId, paymentIntentId: `fake_pi_${orderId}` });
  redirect(`/dev/fake-checkout?session=fake_cs_${orderId}`);
}

export async function fakeExpire(orderId: string) {
  assertFake();
  await processPaymentEvent({ type: "payment.failed", orderId, paymentIntentId: `fake_pi_${orderId}` });
  redirect(`/dev/fake-checkout?session=fake_cs_${orderId}`);
}

export async function fakeAbandon(orderId: string, sessionId: string) {
  assertFake();
  await processPaymentEvent({ type: "checkout.expired", orderId, sessionId });
  redirect("/events");
}
