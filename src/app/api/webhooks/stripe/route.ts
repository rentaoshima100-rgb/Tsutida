import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { processPaymentEvent } from "@/lib/server/payments/process";
import { toPaymentEvent, verifyStripeEvent } from "@/lib/server/payments/stripe-gateway";

// Stripe の Webhook（10.2）。署名を確かめ、stripe_events に記録してから処理する。
// 処理済みのイベントが再送されたら何もせず 200。失敗したら error を記録して 500（Stripe が再送する）

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.text();
  let event;
  try {
    event = verifyStripeEvent(body, request.headers.get("stripe-signature"));
  } catch {
    return new NextResponse("invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const objectId = (event.data.object as { id?: string }).id ?? null;
  const { error: insertError } = await admin
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, object_id: objectId });
  if (insertError) {
    if (insertError.code !== "23505") return new NextResponse("db error", { status: 500 });
    const { data: existing } = await admin
      .from("stripe_events")
      .select("processed_at, attempts")
      .eq("id", event.id)
      .single();
    if (existing?.processed_at) return NextResponse.json({ received: true, duplicate: true });
    await admin.from("stripe_events").update({ attempts: (existing?.attempts ?? 1) + 1 }).eq("id", event.id);
  }

  try {
    const result = await processPaymentEvent(await toPaymentEvent(event));
    await admin.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return NextResponse.json({ received: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[stripe webhook] ${event.type} ${event.id}: ${message}`);
    await admin.from("stripe_events").update({ error: message.slice(0, 500) }).eq("id", event.id);
    return new NextResponse("processing failed", { status: 500 });
  }
}
