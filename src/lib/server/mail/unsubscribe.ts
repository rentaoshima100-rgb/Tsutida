import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appUrl, env } from "@/lib/env";

// 配信停止の署名つきリンク（11章・G12）。ログインなしで、その会員のお知らせだけを止められる。
// 特定電子メール法上、停止の手段は期限なく使えるようにするため、有効期限は付けない。

function sign(memberId: string): string {
  return createHmac("sha256", env().UNSUBSCRIBE_SIGNING_SECRET).update(`unsubscribe:${memberId}`).digest("base64url");
}

export function unsubscribeToken(memberId: string): string {
  return `${Buffer.from(memberId).toString("base64url")}.${sign(memberId)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [idPart, sig] = token.split(".");
  if (!idPart || !sig) return null;
  let memberId: string;
  try {
    memberId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/.test(memberId)) return null;
  const expected = Buffer.from(sign(memberId));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return memberId;
}

/** メールの本文に入れる停止のページ */
export function unsubscribePageUrl(memberId: string): string {
  return appUrl(`/unsubscribe?token=${encodeURIComponent(unsubscribeToken(memberId))}`);
}

/** List-Unsubscribe-Post（ワンクリック停止）の受け口 */
export function unsubscribeOneClickUrl(memberId: string): string {
  return appUrl(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken(memberId))}`);
}
