import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/server/mail/unsubscribe";
import { setMarketingConsent } from "@/lib/server/members";

// ワンクリックの配信停止（RFC 8058。List-Unsubscribe-Post で POST される）。ログインは要らない

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const memberId = verifyUnsubscribeToken(token);
  if (!memberId) return new NextResponse("invalid token", { status: 400 });
  await setMarketingConsent({ memberId, optIn: false, source: "unsubscribe_link" });
  return new NextResponse("unsubscribed", { status: 200 });
}
