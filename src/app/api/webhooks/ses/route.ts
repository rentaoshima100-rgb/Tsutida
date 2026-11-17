import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidSnsUrl, verifySnsMessage, type SesEvent, type SnsMessage } from "@/lib/server/mail/sns";
import { setMarketingConsent } from "@/lib/server/members";

// SES の配信結果（バウンス・苦情・到達）を SNS から受け取る（11章）
// ハードバウンス・苦情は members.email_status を更新し、苦情はお知らせの同意を取り消す（案）

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let message: SnsMessage;
  try {
    message = JSON.parse(await request.text()) as SnsMessage;
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  const expectedTopic = env().SES_SNS_TOPIC_ARN;
  if (expectedTopic && message.TopicArn !== expectedTopic) return new NextResponse("unknown topic", { status: 403 });
  if (!(await verifySnsMessage(message).catch(() => false))) return new NextResponse("invalid signature", { status: 403 });

  if (message.Type === "SubscriptionConfirmation") {
    if (message.SubscribeURL && isValidSnsUrl(message.SubscribeURL)) await fetch(message.SubscribeURL);
    return NextResponse.json({ confirmed: true });
  }
  if (message.Type !== "Notification") return NextResponse.json({ ignored: true });

  let event: SesEvent;
  try {
    event = JSON.parse(message.Message) as SesEvent;
  } catch {
    return NextResponse.json({ ignored: "not json" });
  }
  const type = event.eventType ?? event.notificationType;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const messageId = event.mail?.messageId;

  const setMessageStatus = async (status: "delivered" | "bounced" | "complained" | "failed", error?: string) => {
    if (!messageId) return;
    let q = admin.from("email_messages").update({ status, ...(error ? { error } : {}) }).eq("ses_message_id", messageId);
    // 苦情・バウンスは到達の後にも来るので、到達では上書きしない
    if (status === "delivered") q = q.eq("status", "sent");
    await q;
  };

  const markMembers = async (emails: string[], status: "bounced" | "complained") => {
    for (const email of emails) {
      const { data: members } = await admin.from("members").select("id").ilike("email", email);
      for (const m of members ?? []) {
        await admin.from("members").update({ email_status: status, email_status_at: now }).eq("id", m.id);
        if (status === "complained") await setMarketingConsent({ memberId: m.id, optIn: false, source: "complaint" });
      }
    }
  };

  switch (type) {
    case "Delivery":
      await setMessageStatus("delivered");
      break;
    case "Bounce": {
      const permanent = event.bounce?.bounceType === "Permanent";
      if (permanent) {
        await setMessageStatus("bounced", "宛先に届きませんでした（宛先不明など）");
        await markMembers(event.bounce?.bouncedRecipients.map((r) => r.emailAddress) ?? [], "bounced");
      }
      break;
    }
    case "Complaint":
      await setMessageStatus("complained", "迷惑メールとして報告されました");
      await markMembers(event.complaint?.complainedRecipients.map((r) => r.emailAddress) ?? [], "complained");
      break;
    case "Reject":
      await setMessageStatus("failed", `送信を拒否されました（${event.reject?.reason ?? ""}）`);
      break;
  }
  return NextResponse.json({ ok: true, type });
}
