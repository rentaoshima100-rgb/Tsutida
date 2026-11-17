import "server-only";
import { env } from "@/lib/env";
import { FakeGateway } from "./fake-gateway";
import { StripeGateway } from "./stripe-gateway";
import type { PaymentGateway } from "./types";

let gateway: PaymentGateway | null = null;

export function getGateway(): PaymentGateway {
  if (gateway) return gateway;
  gateway = env().PAYMENT_GATEWAY === "fake" ? new FakeGateway() : new StripeGateway();
  return gateway;
}

export type { PaymentGateway } from "./types";
