import "server-only";
import { createVerify } from "node:crypto";

// Amazon SNS の通知の署名の確認（11章：SNS から /api/webhooks/ses に HTTPS で届け、署名を検証する）

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: "1" | "2";
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
};

const certCache = new Map<string, string>();

export function isValidSnsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function stringToSign(m: SnsMessage): string {
  const keys =
    m.Type === "Notification"
      ? ["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
      : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  return keys.map((k) => `${k}\n${(m as Record<string, unknown>)[k] ?? ""}\n`).join("");
}

export async function verifySnsMessage(m: SnsMessage, fetchCert: (url: string) => Promise<string> = defaultFetch): Promise<boolean> {
  if (!isValidSnsUrl(m.SigningCertURL) || !new URL(m.SigningCertURL).pathname.endsWith(".pem")) return false;
  let cert = certCache.get(m.SigningCertURL);
  if (!cert) {
    cert = await fetchCert(m.SigningCertURL);
    certCache.set(m.SigningCertURL, cert);
  }
  const verifier = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  verifier.update(stringToSign(m), "utf8");
  return verifier.verify(cert, m.Signature, "base64");
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to fetch SNS certificate: ${res.status}`);
  return res.text();
}

/** SES の配信結果のイベント（設定セットのイベント送信と、ID の通知の両方の形） */
export type SesEvent = {
  eventType?: string;
  notificationType?: string;
  mail: { messageId: string; destination?: string[] };
  bounce?: { bounceType: string; bouncedRecipients: { emailAddress: string }[] };
  complaint?: { complainedRecipients: { emailAddress: string }[] };
  delivery?: { recipients: string[] };
  reject?: { reason: string };
};
