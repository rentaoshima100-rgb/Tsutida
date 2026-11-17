import "server-only";
import { appUrl } from "@/lib/env";
import type { CheckoutParams, PaymentDetails, PaymentGateway, ProxyPaymentParams, RefundParams } from "./types";

// 開発・自動テスト用の擬似決済（PAYMENT_GATEWAY=fake）。Stripe の鍵がなくても注文の流れを最後まで通せる。
// 決済画面の代わりに /dev/fake-checkout を開き、そこで「支払う」「入金する」などを選ぶ。本番では使えない（env.ts）。

export function fakeDetails(method: "konbini" | "bank_transfer", amount: number): PaymentDetails {
  if (method === "konbini") {
    return {
      kind: "konbini",
      hostedVoucherUrl: appUrl("/dev/fake-checkout/voucher"),
      expiresAt: null,
      stores: [
        { store: "ファミリーマート", paymentCode: "123456789012", confirmationNumber: "1234567890" },
        { store: "ローソン", paymentCode: "123456789012", confirmationNumber: "1234567890" },
      ],
    };
  }
  return {
    kind: "bank_transfer",
    hostedInstructionsUrl: appUrl("/dev/fake-checkout/voucher"),
    amountRemaining: amount,
    reference: null,
    bank: {
      bankName: "テスト銀行",
      branchName: "開発支店",
      accountType: "futsu",
      accountNumber: "1234567",
      accountHolderName: "ツチダエイゾウ",
    },
  };
}

export class FakeGateway implements PaymentGateway {
  readonly name = "fake" as const;

  async createCheckoutSession(p: CheckoutParams) {
    const sessionId = `fake_cs_${p.orderId}`;
    const url = appUrl(
      `/dev/fake-checkout?session=${sessionId}&method=${p.method}` +
        `&success=${encodeURIComponent(p.successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId))}` +
        `&cancel=${encodeURIComponent(p.cancelUrl)}`,
    );
    return { sessionId, url };
  }

  async expireCheckoutSession() {}

  async ensureCustomer(p: { existingId?: string | null; memberId?: string }) {
    return p.existingId ?? `fake_cus_${p.memberId ?? Date.now()}`;
  }

  async createProxyPayment(p: ProxyPaymentParams) {
    return { paymentIntentId: `fake_pi_${p.orderId}`, details: fakeDetails(p.method, p.amount) };
  }

  async cancelPaymentIntent() {}

  async getPaymentIntent() {
    return { status: "requires_action", amountReceived: 0 };
  }

  async createRefund(p: RefundParams) {
    return { id: `fake_re_${p.refundId}`, status: "succeeded" as const };
  }
}
