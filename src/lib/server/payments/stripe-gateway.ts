import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import type {
  BankTransferDetails,
  CheckoutParams,
  KonbiniDetails,
  PaymentDetails,
  PaymentEvent,
  PaymentGateway,
  ProxyPaymentParams,
  RefundParams,
} from "./types";
import { PaymentError } from "./types";

// Stripe との連携（10章）。お子さまの名前は Stripe に渡さない（14章）。

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new PaymentError("STRIPE_SECRET_KEY が設定されていません");
  client = new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "tsuchida-order" } });
  return client;
}

const STORE_LABEL: Record<string, string> = {
  familymart: "ファミリーマート",
  lawson: "ローソン",
  ministop: "ミニストップ",
  seicomart: "セイコーマート",
};

export function detailsFromPaymentIntent(pi: Stripe.PaymentIntent): PaymentDetails | null {
  const next = pi.next_action;
  if (next?.konbini_display_details) {
    const d = next.konbini_display_details;
    const stores = Object.entries(d.stores ?? {})
      .filter(([, v]) => v && typeof v === "object" && "payment_code" in v)
      .map(([store, v]) => {
        const s = v as { payment_code: string; confirmation_number?: string | null };
        return { store: STORE_LABEL[store] ?? store, paymentCode: s.payment_code, confirmationNumber: s.confirmation_number ?? null };
      });
    const details: KonbiniDetails = {
      kind: "konbini",
      hostedVoucherUrl: d.hosted_voucher_url,
      expiresAt: d.expires_at ?? null,
      stores,
    };
    return details;
  }
  if (next?.display_bank_transfer_instructions) {
    const d = next.display_bank_transfer_instructions;
    const zengin = d.financial_addresses?.find((a) => a.type === "zengin")?.zengin;
    const details: BankTransferDetails = {
      kind: "bank_transfer",
      hostedInstructionsUrl: d.hosted_instructions_url,
      amountRemaining: d.amount_remaining,
      reference: d.reference,
      bank: zengin
        ? {
            bankName: zengin.bank_name,
            branchName: zengin.branch_name,
            accountType: zengin.account_type,
            accountNumber: zengin.account_number,
            accountHolderName: zengin.account_holder_name,
          }
        : null,
    };
    return details;
  }
  return null;
}

export class StripeGateway implements PaymentGateway {
  readonly name = "stripe" as const;

  async createCheckoutSession(p: CheckoutParams) {
    const isBank = p.method === "bank_transfer";
    if (isBank && !p.customerId) throw new PaymentError("銀行振込には Stripe の顧客が必要です");
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "ja",
        allowed_payment_method_types: [isBank ? "customer_balance" : p.method],
        customer: isBank ? p.customerId : undefined,
        customer_email: isBank ? undefined : p.customerEmail,
        line_items: p.lineItems.map((li) => ({
          quantity: 1,
          price_data: { currency: "jpy", unit_amount: li.amount, product_data: { name: li.name } },
        })),
        metadata: { order_id: p.orderId, order_no: p.orderNo },
        payment_intent_data: {
          metadata: { order_id: p.orderId, order_no: p.orderNo, channel: "web" },
          description: `注文番号 ${p.orderNo}`,
        },
        // 設定できる最短の30分（時計のずれに備えて1分足す）
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        payment_method_options:
          p.method === "konbini"
            ? { konbini: { expires_after_days: p.konbiniDays } }
            : isBank
              ? { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "jp_bank_transfer" } } }
              : undefined,
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
      },
      { idempotencyKey: `checkout:${p.orderId}` },
    );
    if (!session.url) throw new PaymentError("Checkout の URL を受け取れませんでした");
    return { sessionId: session.id, url: session.url };
  }

  async expireCheckoutSession(sessionId: string) {
    try {
      await stripe().checkout.sessions.expire(sessionId);
    } catch (e) {
      // すでに完了・失効しているものは無視する
      if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
    }
  }

  async ensureCustomer(p: { existingId?: string | null; name: string; email?: string | null; memberId?: string; idempotencyKey?: string }) {
    if (p.existingId) return p.existingId;
    const key = p.idempotencyKey ?? (p.memberId ? `customer:${p.memberId}` : undefined);
    const customer = await stripe().customers.create(
      { name: p.name, email: p.email || undefined, metadata: p.memberId ? { member_id: p.memberId } : {} },
      key ? { idempotencyKey: key } : undefined,
    );
    return customer.id;
  }

  async createProxyPayment(p: ProxyPaymentParams) {
    const metadata = { order_id: p.orderId, order_no: p.orderNo, channel: "proxy" };
    const pi =
      p.method === "konbini"
        ? await stripe().paymentIntents.create(
            {
              amount: p.amount,
              currency: "jpy",
              allowed_payment_method_types: ["konbini"],
              payment_method_data: { type: "konbini", billing_details: { name: p.buyerName, email: p.buyerEmail ?? undefined } },
              payment_method_options: { konbini: { expires_after_days: p.konbiniDays } },
              confirm: true,
              metadata,
              description: `注文番号 ${p.orderNo}（代理注文）`,
            },
            { idempotencyKey: `proxy:${p.orderId}` },
          )
        : await stripe().paymentIntents.create(
            {
              amount: p.amount,
              currency: "jpy",
              customer: p.customerId,
              allowed_payment_method_types: ["customer_balance"],
              payment_method_data: { type: "customer_balance" },
              payment_method_options: {
                customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "jp_bank_transfer" } },
              },
              confirm: true,
              metadata,
              description: `注文番号 ${p.orderNo}（代理注文）`,
            },
            { idempotencyKey: `proxy:${p.orderId}` },
          );
    const details = detailsFromPaymentIntent(pi);
    if (!details) throw new PaymentError("払込票・振込先を受け取れませんでした");
    return { paymentIntentId: pi.id, details };
  }

  async cancelPaymentIntent(paymentIntentId: string) {
    try {
      await stripe().paymentIntents.cancel(paymentIntentId);
    } catch (e) {
      if (e instanceof Stripe.errors.StripeInvalidRequestError && /status of canceled/.test(e.message)) return;
      throw e;
    }
  }

  async getPaymentIntent(paymentIntentId: string) {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
    return { status: pi.status, amountReceived: pi.amount_received };
  }

  async createRefund(p: RefundParams) {
    const refund = await stripe().refunds.create(
      { payment_intent: p.paymentIntentId, amount: p.amount, metadata: { order_id: p.orderId, refund_id: p.refundId } },
      { idempotencyKey: `refund:${p.refundId}` },
    );
    return { id: refund.id, status: mapRefundStatus(refund.status) };
  }
}

function mapRefundStatus(status: string | null): "pending" | "succeeded" | "failed" {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending"; // pending / requires_action（返金先の口座の入力待ち）
}

/** Webhook の署名を確かめる */
export function verifyStripeEvent(body: string, signature: string | null): Stripe.Event {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentError("STRIPE_WEBHOOK_SECRET が設定されていません");
  if (!signature) throw new PaymentError("署名がありません");
  return stripe().webhooks.constructEvent(body, signature, secret);
}

function idOf(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Stripe のイベントを、このサイトの処理の形に直す（10.2） */
export async function toPaymentEvent(event: Stripe.Event): Promise<PaymentEvent> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const orderId = s.metadata?.order_id;
      if (!orderId) return { type: "ignored", reason: "no order_id" };
      const piId = idOf(s.payment_intent);
      if (s.payment_status === "paid") return { type: "checkout.paid", orderId, sessionId: s.id, paymentIntentId: piId };
      // コンビニ払い・銀行振込：払込票・振込先を PaymentIntent から読む
      let details: PaymentDetails | null = null;
      if (piId) details = detailsFromPaymentIntent(await stripe().paymentIntents.retrieve(piId));
      return { type: "checkout.awaiting_payment", orderId, sessionId: s.id, paymentIntentId: piId, details };
    }
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const orderId = s.metadata?.order_id;
      if (!orderId) return { type: "ignored", reason: "no order_id" };
      return { type: "payment.succeeded", orderId, paymentIntentId: idOf(s.payment_intent) };
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      const orderId = s.metadata?.order_id;
      if (!orderId) return { type: "ignored", reason: "no order_id" };
      return { type: "payment.failed", orderId, paymentIntentId: idOf(s.payment_intent) };
    }
    case "checkout.session.expired": {
      const s = event.data.object;
      const orderId = s.metadata?.order_id;
      if (!orderId) return { type: "ignored", reason: "no order_id" };
      return { type: "checkout.expired", orderId, sessionId: s.id };
    }
    case "payment_intent.partially_funded": {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (!orderId) return { type: "ignored", reason: "no order_id" };
      const remaining = pi.next_action?.display_bank_transfer_instructions?.amount_remaining ?? null;
      const amountRemaining = remaining ?? pi.amount - pi.amount_received;
      return {
        type: "payment.partially_funded",
        orderId,
        paymentIntentId: pi.id,
        amountReceived: pi.amount - amountRemaining,
        amountRemaining,
      };
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object;
      // Checkout の注文は checkout.session.* で処理する。ここで扱うのは代理注文だけ
      if (pi.metadata?.channel !== "proxy" || !pi.metadata.order_id) return { type: "ignored", reason: "not proxy" };
      return event.type === "payment_intent.succeeded"
        ? { type: "payment.succeeded", orderId: pi.metadata.order_id, paymentIntentId: pi.id }
        : { type: "payment.failed", orderId: pi.metadata.order_id, paymentIntentId: pi.id };
    }
    case "refund.updated":
    case "refund.failed": {
      const r = event.data.object;
      return {
        type: "refund.updated",
        stripeRefundId: r.id,
        refundId: r.metadata?.refund_id ?? null,
        status: mapRefundStatus(r.status),
        failureReason: r.failure_reason ?? null,
      };
    }
    case "charge.dispute.created": {
      const d = event.data.object;
      return { type: "dispute.created", paymentIntentId: idOf(d.payment_intent), amount: d.amount, reason: d.reason };
    }
    default:
      return { type: "ignored", reason: event.type };
  }
}
