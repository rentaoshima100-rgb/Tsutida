"use server";

import { verifyUnsubscribeToken } from "@/lib/server/mail/unsubscribe";
import { setMarketingConsent } from "@/lib/server/members";
import type { FormState } from "@/lib/form";

// G12 配信停止（署名付きリンク。ログインなし）
export async function unsubscribe(token: string, _prev: FormState): Promise<FormState> {
  const memberId = verifyUnsubscribeToken(token);
  if (!memberId) return { message: "リンクが正しくありません。お手数ですがお問い合わせください" };
  await setMarketingConsent({ memberId, optIn: false, source: "unsubscribe_link" });
  return { ok: true, message: "お知らせメールの配信を止めました。ご注文・お支払い・お届けのメールは、これまでどおり届きます。" };
}
