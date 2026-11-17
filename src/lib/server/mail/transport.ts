import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

// メールの送信。本番・テスト環境は Amazon SES（東京）、開発はローカルの Mailpit（SMTP）

export type OutgoingMail = {
  from: { name: string; address: string };
  replyTo?: string;
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
  /** SES のタグ（配信結果の通知で、どのメールか分かるようにする） */
  tags?: Record<string, string>;
};

export type SendResult = { messageId: string };

let ses: SESv2Client | null = null;
let smtp: Transporter | null = null;

function formatFrom(from: OutgoingMail["from"]): string {
  // 差出人名は RFC 2047 でエンコードする（日本語の名前）
  const encoded = `=?UTF-8?B?${Buffer.from(from.name, "utf8").toString("base64")}?=`;
  return `${encoded} <${from.address}>`;
}

export async function sendMail(mail: OutgoingMail): Promise<SendResult> {
  const e = env();
  if (e.MAIL_ALLOWED_DOMAINS) {
    const allowed = e.MAIL_ALLOWED_DOMAINS.split(",").map((d) => d.trim().toLowerCase());
    const domain = mail.to.split("@")[1]?.toLowerCase() ?? "";
    if (!allowed.includes(domain)) throw new Error(`テスト環境のため送信しません（${domain} は許可されていません）`);
  }

  if (e.MAIL_TRANSPORT === "log") {
    console.info(`[mail:log] to=${mail.to.replace(/^(.).*@/, "$1***@")} subject=${mail.subject}`);
    return { messageId: `log-${Date.now()}-${Math.random().toString(36).slice(2)}` };
  }

  if (e.MAIL_TRANSPORT === "smtp") {
    smtp ??= nodemailer.createTransport(e.SMTP_URL ?? "smtp://127.0.0.1:54325");
    const info = await smtp.sendMail({
      from: { name: mail.from.name, address: mail.from.address },
      replyTo: mail.replyTo || undefined,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      headers: mail.headers,
    });
    return { messageId: info.messageId };
  }

  ses ??= new SESv2Client({ region: e.AWS_REGION });
  const out = await ses.send(
    new SendEmailCommand({
      FromEmailAddress: formatFrom(mail.from),
      ReplyToAddresses: mail.replyTo ? [mail.replyTo] : undefined,
      Destination: { ToAddresses: [mail.to] },
      ConfigurationSetName: e.SES_CONFIGURATION_SET || undefined,
      EmailTags: mail.tags
        ? Object.entries(mail.tags).map(([Name, Value]) => ({ Name, Value: Value.replace(/[^A-Za-z0-9_\-.@]/g, "_") }))
        : undefined,
      Content: {
        Simple: {
          Subject: { Data: mail.subject, Charset: "UTF-8" },
          Body: { Text: { Data: mail.text, Charset: "UTF-8" } },
          Headers: mail.headers
            ? Object.entries(mail.headers).map(([Name, Value]) => ({ Name, Value }))
            : undefined,
        },
      },
    }),
  );
  if (!out.MessageId) throw new Error("SES did not return a MessageId");
  return { messageId: out.MessageId };
}
