// 決済の共通の型（10章）。Stripe と開発用の擬似決済の両方がこの形に合わせる。

export type OnlineMethod = "card" | "paypay" | "konbini" | "bank_transfer";

/** 払込票・振込先の案内（orders.payment_details に保存し、M05 とメールに出す） */
export type KonbiniDetails = {
  kind: "konbini";
  hostedVoucherUrl: string | null;
  expiresAt: number | null;
  stores: { store: string; paymentCode: string; confirmationNumber: string | null }[];
};

export type BankTransferDetails = {
  kind: "bank_transfer";
  hostedInstructionsUrl: string | null;
  amountRemaining: number | null;
  reference: string | null;
  bank: {
    bankName: string | null;
    branchName: string | null;
    accountType: string | null;
    accountNumber: string | null;
    accountHolderName: string | null;
  } | null;
};

export type PaymentDetails = KonbiniDetails | BankTransferDetails;

export type CheckoutParams = {
  orderId: string;
  orderNo: string;
  method: OnlineMethod;
  lineItems: { name: string; amount: number }[];
  customerEmail: string;
  customerId?: string;
  konbiniDays?: number;
  successUrl: string;
  cancelUrl: string;
};

export type ProxyPaymentParams = {
  orderId: string;
  orderNo: string;
  method: "konbini" | "bank_transfer";
  amount: number;
  buyerName: string;
  /** コンビニ払いでは必須（Stripe が billing_details に求める）。銀行振込は空でもよい */
  buyerEmail: string | null;
  konbiniDays?: number;
  customerId?: string;
};

export type RefundParams = {
  paymentIntentId: string;
  amount: number;
  refundId: string;
  orderId: string;
};

export interface PaymentGateway {
  readonly name: "stripe" | "fake";
  createCheckoutSession(p: CheckoutParams): Promise<{ sessionId: string; url: string }>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** 銀行振込に使う Stripe の顧客（なければ作る） */
  ensureCustomer(p: { existingId?: string | null; name: string; email?: string | null; memberId?: string; idempotencyKey?: string }): Promise<string>;
  createProxyPayment(p: ProxyPaymentParams): Promise<{ paymentIntentId: string; details: PaymentDetails }>;
  cancelPaymentIntent(paymentIntentId: string): Promise<void>;
  getPaymentIntent(paymentIntentId: string): Promise<{ status: string; amountReceived: number }>;
  createRefund(p: RefundParams): Promise<{ id: string; status: "pending" | "succeeded" | "failed" }>;
}

/** Webhook を、このサイトの処理に必要な形に直したもの */
export type PaymentEvent =
  | { type: "checkout.paid"; orderId: string; sessionId: string; paymentIntentId: string | null }
  | {
      type: "checkout.awaiting_payment";
      orderId: string;
      sessionId: string;
      paymentIntentId: string | null;
      details: PaymentDetails | null;
    }
  | { type: "checkout.expired"; orderId: string; sessionId: string }
  | { type: "payment.succeeded"; orderId: string; paymentIntentId: string | null }
  | { type: "payment.failed"; orderId: string; paymentIntentId: string | null }
  | { type: "payment.partially_funded"; orderId: string; paymentIntentId: string; amountReceived: number; amountRemaining: number }
  | {
      type: "refund.updated";
      stripeRefundId: string;
      refundId: string | null;
      status: "pending" | "succeeded" | "failed";
      failureReason: string | null;
    }
  | { type: "dispute.created"; paymentIntentId: string | null; amount: number; reason: string }
  | { type: "ignored"; reason: string };

export class PaymentError extends Error {}
