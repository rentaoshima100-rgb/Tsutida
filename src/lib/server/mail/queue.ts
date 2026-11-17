import "server-only";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { getSettings, type Settings } from "@/lib/server/settings";
import { MissingVariableError, renderEmail, type FooterInfo } from "./render";
import { sendMail } from "./transport";
import { unsubscribeOneClickUrl, unsubscribePageUrl } from "./unsubscribe";

// メールの送信キュー（11章・12章 S1）。1通1行で email_messages に記録し、dedupe_key で二重送信を防ぐ。

export type MailVars = Record<string, string | number | null | undefined>;

export type MailItem = {
  to: string;
  memberId?: string | null;
  orderId?: string | null;
  eventId?: string | null;
  dedupeKey: string;
  vars: MailVars;
};

export type EnqueueResult = { queued: number; duplicates: number; failed: number; skipped: number };

function footerInfo(s: Settings): FooterInfo {
  const b = s.business_info;
  return {
    businessName: b.name,
    postalCode: b.postal_code,
    address: b.address,
    phone: b.phone,
    hours: b.hours,
    email: b.email,
    contactUrl: appUrl("/contact"),
  };
}

/** どのメールにも使える差し込み */
export function commonVars(s: Settings): MailVars {
  return {
    site_url: appUrl("/"),
    mypage_url: appUrl("/mypage"),
    children_url: appUrl("/mypage/children"),
    contact_url: appUrl("/contact"),
    business_name: s.business_info.name,
    business_phone: s.business_info.phone,
    business_email: s.business_info.email,
  };
}

/**
 * 同じテンプレートのメールをまとめてキューに入れる。
 * ・同じ dedupe_key はすでにあれば入れない
 * ・差し込みの値が足りなければ、送らずに failed として記録する
 * ・お知らせ（is_marketing）は、同意があり、メールが届いている会員にだけ入れる
 */
export async function enqueueMails(templateKey: string, items: MailItem[]): Promise<EnqueueResult> {
  const result: EnqueueResult = { queued: 0, duplicates: 0, failed: 0, skipped: 0 };
  if (items.length === 0) return result;
  const admin = createAdminClient();
  const settings = await getSettings();

  const { data: template, error: tErr } = await admin
    .from("email_templates")
    .select("*")
    .eq("key", templateKey)
    .single();
  if (tErr || !template) throw new Error(`メールのテンプレートがありません: ${templateKey}`);

  // 会員の状態（同意・届いているか）
  const memberIds = [...new Set(items.map((i) => i.memberId).filter((v): v is string => Boolean(v)))];
  const memberState = new Map<string, { optIn: boolean; emailStatus: string; withdrawn: boolean }>();
  for (let i = 0; i < memberIds.length; i += 500) {
    const { data } = await admin
      .from("members")
      .select("id, marketing_opt_in, email_status, withdrawn_at")
      .in("id", memberIds.slice(i, i + 500));
    for (const m of data ?? []) {
      memberState.set(m.id, { optIn: m.marketing_opt_in, emailStatus: m.email_status, withdrawn: Boolean(m.withdrawn_at) });
    }
  }

  const base = commonVars(settings);
  const footer = footerInfo(settings);
  const rows = [];
  for (const item of items) {
    const state = item.memberId ? memberState.get(item.memberId) : undefined;
    if (template.is_marketing && (!state || !state.optIn || state.withdrawn || state.emailStatus !== "ok")) {
      result.skipped++;
      continue;
    }
    let status: "queued" | "failed" = "queued";
    let error: string | null = null;
    let subject = template.subject;
    let body = "";
    try {
      const rendered = renderEmail({
        subject: template.subject,
        body: template.body,
        vars: { ...base, ...item.vars },
        footer,
        unsubscribeUrl: template.is_marketing && item.memberId ? unsubscribePageUrl(item.memberId) : undefined,
      });
      subject = rendered.subject;
      body = rendered.body;
    } catch (e) {
      if (!(e instanceof MissingVariableError)) throw e;
      status = "failed";
      error = e.message;
    }
    if (status === "queued" && state && state.emailStatus !== "ok") {
      status = "failed";
      error = `メールが届かない宛先のため送りません（${state.emailStatus}）`;
    }
    rows.push({
      template_key: templateKey,
      to_email: item.to,
      member_id: item.memberId ?? null,
      order_id: item.orderId ?? null,
      event_id: item.eventId ?? null,
      dedupe_key: item.dedupeKey,
      subject,
      body,
      is_marketing: template.is_marketing,
      status,
      error,
    });
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await admin
      .from("email_messages")
      .upsert(chunk, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("status");
    if (error) throw error;
    const inserted = data ?? [];
    result.queued += inserted.filter((r) => r.status === "queued").length;
    result.failed += inserted.filter((r) => r.status === "failed").length;
    result.duplicates += chunk.length - inserted.length;
  }
  return result;
}

export async function enqueueMail(templateKey: string, item: MailItem) {
  return enqueueMails(templateKey, [item]);
}

const MAX_ATTEMPTS = 5;

/**
 * キューのメールを送る（S1。5分ごと）。SES の送信速度の上限を守り、時間の上限までに送れる分だけ送る
 */
export async function processMailQueue(opts: { timeBudgetMs?: number; batchSize?: number } = {}) {
  const admin = createAdminClient();
  const settings = await getSettings();
  const started = Date.now();
  const budget = opts.timeBudgetMs ?? 240_000;
  const minIntervalMs = 1000 / Math.max(1, settings.ses_max_send_rate);
  const from = { name: settings.mail_sender.from_name, address: settings.mail_sender.from_address };
  let sent = 0;
  let failed = 0;

  while (Date.now() - started < budget) {
    const { data: batch, error } = await admin.rpc("claim_email_batch", {
      p_limit: opts.batchSize ?? 50,
      p_lease: "5 minutes",
    });
    if (error) throw error;
    if (!batch || batch.length === 0) break;

    for (const msg of batch) {
      const t0 = Date.now();
      try {
        const headers: Record<string, string> = {};
        if (msg.is_marketing && msg.member_id) {
          headers["List-Unsubscribe"] = `<${unsubscribeOneClickUrl(msg.member_id)}>`;
          headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }
        const res = await sendMail({
          from,
          replyTo: settings.mail_sender.reply_to || undefined,
          to: msg.to_email,
          subject: msg.subject,
          text: msg.body,
          headers,
          tags: { template: msg.template_key, email_message_id: msg.id },
        });
        await admin
          .from("email_messages")
          .update({ status: "sent", ses_message_id: res.messageId, sent_at: new Date().toISOString(), error: null, locked_until: null })
          .eq("id", msg.id)
          .eq("status", "queued");
        sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const giveUp = msg.attempts >= MAX_ATTEMPTS || message.startsWith("テスト環境のため送信しません");
        await admin
          .from("email_messages")
          .update(giveUp ? { status: "failed", error: message, locked_until: null } : { error: message })
          .eq("id", msg.id)
          .eq("status", "queued");
        if (giveUp) failed++;
      }
      const wait = minIntervalMs - (Date.now() - t0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (Date.now() - started >= budget) break;
    }
  }
  return { sent, failed };
}
