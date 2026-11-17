import "server-only";
import { randomUUID } from "node:crypto";
import { appUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { dueDeadlineReminder, paymentReminderDue, saleStartSendAt } from "@/lib/domain/deadlines";
import { DELIVERY_METHOD_LABEL } from "@/lib/domain/status";
import { fiscalYearOf, formatJstDateTime, formatJstMonthDay, jstDate } from "@/lib/domain/time";
import { alertStaff } from "@/lib/server/alerts";
import { writeAudit } from "@/lib/server/audit";
import { enqueueMails, processMailQueue, type MailItem } from "@/lib/server/mail/queue";
import { getGateway } from "@/lib/server/payments";
import { loadOrderById } from "@/lib/server/orders/load";
import { sendOrderMail } from "@/lib/server/orders/mail";
import { processPaymentEvent } from "@/lib/server/payments/process";
import { getSettings } from "@/lib/server/settings";

// 定期処理（12章）。どのジョブも何回実行しても結果が同じになるように書く。
// 日時の判定はすべて日本時間。毎回その時点の DB の値から対象を選び直す。

type JobResult = Record<string, unknown> | string;

async function withLock(name: string, fn: () => Promise<JobResult>): Promise<JobResult> {
  const admin = createAdminClient();
  const holder = randomUUID();
  const { data: got, error } = await admin.rpc("acquire_job_lock", { p_name: name, p_holder: holder, p_ttl: "15 minutes" });
  if (error) throw error;
  if (!got) return "locked";
  try {
    const result = await fn();
    await admin.rpc("release_job_lock", { p_name: name, p_holder: holder });
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[job ${name}]`, message);
    await admin.rpc("release_job_lock", { p_name: name, p_holder: holder, p_error: message.slice(0, 500) });
    return { error: message };
  }
}

/** J1 販売開始のお知らせ */
export async function jobSaleStarted(now = new Date()) {
  const admin = createAdminClient();
  const { data: events } = await admin
    .from("events")
    .select("*, school:schools!inner(name)")
    .eq("status", "published")
    .is("sale_start_notified_at", null)
    .lte("sale_starts_at", now.toISOString());
  let mails = 0;
  for (const ev of events ?? []) {
    if (now < saleStartSendAt(ev.sale_starts_at)) continue;
    if (now.getTime() < new Date(ev.deadline_at).getTime()) {
      const { data: audience, error } = await admin.rpc("event_audience", { p_event_id: ev.id, p_unordered_only: false });
      if (error) throw error;
      const items: MailItem[] = (audience ?? []).map((a) => ({
        to: a.email,
        memberId: a.member_id,
        eventId: ev.id,
        dedupeKey: `sale_started:${ev.id}:${a.member_id}`,
        vars: {
          member_name: a.full_name,
          school_name: ev.school.name,
          event_name: ev.name,
          child_names: a.child_names.map((n: string) => `${n}さん`).join("、"),
          deadline: formatJstDateTime(ev.deadline_at),
          delivery: DELIVERY_METHOD_LABEL[ev.delivery_method as "school" | "mail" | "either"],
          event_url: appUrl(`/events/${ev.id}`),
        },
      }));
      const r = await enqueueMails("sale_started", items);
      mails += r.queued;
    }
    await admin
      .from("events")
      .update({ sale_start_notified_at: now.toISOString() })
      .eq("id", ev.id)
      .is("sale_start_notified_at", null);
  }
  return { events: events?.length ?? 0, mails };
}

/** 「まだ注文していない」会員へのお知らせ（D-3・D-1・延長・締切後受付）の共通の処理 */
export async function enqueueUnorderedReminder(
  eventId: string,
  templateKey: "deadline_d3" | "deadline_d1" | "deadline_extended" | "late_order_open",
  dedupeSuffix: string,
) {
  const admin = createAdminClient();
  const { data: ev } = await admin.from("events").select("*, school:schools!inner(name)").eq("id", eventId).single();
  if (!ev) return 0;
  const { data: audience, error } = await admin.rpc("event_audience", { p_event_id: eventId, p_unordered_only: true });
  if (error) throw error;
  const items: MailItem[] = (audience ?? []).map((a) => ({
    to: a.email,
    memberId: a.member_id,
    eventId,
    dedupeKey: `${templateKey}:${eventId}:${dedupeSuffix}:${a.member_id}`,
    vars: {
      member_name: a.full_name,
      school_name: ev.school.name,
      event_name: ev.name,
      unordered_child_names: a.unordered_child_names.map((n: string) => `${n}さん`).join("、"),
      deadline: formatJstDateTime(ev.deadline_at),
      deadline_date: formatJstMonthDay(ev.deadline_at),
      late_until: ev.late_until ? formatJstDateTime(ev.late_until) : "",
      late_delivery_note: ev.late_delivery_note ?? "",
      event_url: appUrl(`/events/${ev.id}`),
    },
  }));
  const r = await enqueueMails(templateKey, items);
  return r.queued;
}

/** J2 締切前のお知らせ（dedupe_key に締切日時を入れる。延長後は新しい締切で送り直す） */
export async function jobDeadlineReminders(now = new Date()) {
  const admin = createAdminClient();
  const soon = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const { data: events } = await admin
    .from("events")
    .select("id, sale_starts_at, deadline_at, late_enabled, late_until")
    .eq("status", "published")
    .gt("deadline_at", now.toISOString())
    .lt("deadline_at", soon.toISOString());
  let mails = 0;
  for (const ev of events ?? []) {
    const kind = dueDeadlineReminder(ev, now);
    if (!kind) continue;
    mails += await enqueueUnorderedReminder(ev.id, kind, new Date(ev.deadline_at).toISOString());
  }
  return { events: events?.length ?? 0, mails };
}

/** J3 支払期限の前日のお知らせ */
export async function jobPaymentReminders(now = new Date()) {
  const admin = createAdminClient();
  const soon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const { data: orders } = await admin
    .from("orders")
    .select("id, payment_due_at")
    .eq("payment_status", "pending")
    .gt("payment_due_at", now.toISOString())
    .lt("payment_due_at", soon.toISOString());
  let mails = 0;
  for (const o of orders ?? []) {
    if (!o.payment_due_at || !paymentReminderDue(o.payment_due_at, now)) continue;
    const order = await loadOrderById(o.id);
    if (!order) continue;
    const r = await sendOrderMail("payment_due_reminder", order, {
      dedupeKey: `payment_due_reminder:${o.id}:${o.payment_due_at}`,
    });
    mails += r?.queued ?? 0;
  }
  return { orders: orders?.length ?? 0, mails };
}

/**
 * J4 期限切れの取り消し：銀行振込は PaymentIntent を取り消す。
 * コンビニ払いは Stripe の失効の通知を待ち、期限から3日たっても通知がなければ状態を取り直す
 */
export async function jobExpirePending(now = new Date()) {
  const admin = createAdminClient();
  const gateway = getGateway();
  const { data: orders } = await admin
    .from("orders")
    .select("id, order_no, payment_method, payment_due_at, stripe_payment_intent_id, amount_received")
    .eq("payment_status", "pending")
    .lt("payment_due_at", now.toISOString());
  let canceled = 0;
  let checked = 0;
  for (const o of orders ?? []) {
    if (o.payment_method === "konbini") {
      const graceOver = now.getTime() > new Date(o.payment_due_at!).getTime() + 3 * 24 * 60 * 60 * 1000;
      if (!graceOver || !o.stripe_payment_intent_id) continue;
      checked++;
      const pi = await gateway.getPaymentIntent(o.stripe_payment_intent_id);
      if (pi.status === "succeeded") {
        await processPaymentEvent({ type: "payment.succeeded", orderId: o.id, paymentIntentId: o.stripe_payment_intent_id });
      } else if (pi.status === "requires_payment_method" || pi.status === "canceled") {
        await processPaymentEvent({ type: "payment.failed", orderId: o.id, paymentIntentId: o.stripe_payment_intent_id });
        canceled++;
      }
      continue;
    }
    if (o.payment_method !== "bank_transfer") continue;
    if (o.stripe_payment_intent_id) await gateway.cancelPaymentIntent(o.stripe_payment_intent_id);
    const { data: moved } = await admin.rpc("cancel_unpaid_order", { p_order_id: o.id, p_reason: "支払期限切れ" });
    if (!moved) continue;
    canceled++;
    if (o.amount_received > 0) {
      await admin
        .from("orders")
        .update({ needs_attention: `一部の入金（${o.amount_received}円）があったまま期限切れになりました。返金してください` })
        .eq("id", o.id);
    }
    const order = await loadOrderById(o.id);
    if (order) await sendOrderMail("order_auto_canceled", order, { dedupeKey: `order_auto_canceled:${o.id}` });
    await writeAudit({
      actorId: null,
      actorType: "system",
      action: "order.cancel",
      targetType: "order",
      targetId: o.order_no,
      detail: { reason: "支払期限切れ（定期処理）" },
    });
  }
  return { canceled, checked };
}

/** J5 本数の確定 */
export async function jobFixProduction(now = new Date()) {
  const { data, error } = await createAdminClient().rpc("fix_production_counts", { p_now: now.toISOString() });
  if (error) throw error;
  return { fixed: data?.length ?? 0 };
}

/** J6 途中でやめた注文（draft で作成から2時間以上）の掃除 */
export async function jobCleanupDrafts(now = new Date()) {
  const admin = createAdminClient();
  const before = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: drafts } = await admin
    .from("orders")
    .select("id, stripe_checkout_session_id")
    .eq("payment_status", "draft")
    .lt("created_at", before);
  for (const d of drafts ?? []) {
    if (d.stripe_checkout_session_id) await getGateway().expireCheckoutSession(d.stripe_checkout_session_id).catch(() => {});
    await admin.rpc("delete_draft_order", { p_order_id: d.id });
  }
  return { deleted: drafts?.length ?? 0 };
}

/** J7 新年度の登録コードの入力のお願い（設定の日以降の最初の実行で、その年度に1回） */
export async function jobNewYear(now = new Date()) {
  const admin = createAdminClient();
  const settings = await getSettings();
  const today = jstDate(now);
  const fy = fiscalYearOf(now);
  const sendDay = `${fy}-${settings.new_year_mail_date}`;
  if (today < sendDay) return "not yet";
  const { data: marker } = await admin.from("settings").select("value").eq("key", "new_year_mail_sent_year").maybeSingle();
  if (marker && Number(marker.value) >= fy) return "already sent";

  let queued = 0;
  for (let from = 0; ; from += 1000) {
    const { data: members } = await admin
      .from("members")
      .select("id, email, full_name")
      .is("withdrawn_at", null)
      .eq("email_status", "ok")
      .order("created_at")
      .range(from, from + 999);
    if (!members || members.length === 0) break;
    const r = await enqueueMails(
      "new_year_code",
      members.map((m) => ({
        to: m.email,
        memberId: m.id,
        dedupeKey: `new_year:${fy}:${m.id}`,
        vars: { member_name: m.full_name },
      })),
    );
    queued += r.queued;
    if (members.length < 1000) break;
  }
  await admin.from("settings").upsert({ key: "new_year_mail_sent_year", value: fy, is_public: false });
  return { queued };
}

/** J8 監視：保守担当へ知らせる（同じ知らせは1日1回） */
export async function jobMonitor(now = new Date()) {
  const admin = createAdminClient();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const problems: string[] = [];

  const { data: webhookErrors } = await admin
    .from("stripe_events")
    .select("id, type, error")
    .not("error", "is", null)
    .is("processed_at", null)
    .gte("received_at", since)
    .limit(20);
  if (webhookErrors && webhookErrors.length > 0) {
    problems.push(
      `Stripe からの通知の処理に失敗しています（${webhookErrors.length}件）\n` +
        webhookErrors.map((e) => `・${e.type} ${e.id}: ${e.error}`).join("\n"),
    );
  }
  const { count: failedMails } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("queued_at", since);
  if ((failedMails ?? 0) >= 5) problems.push(`送信に失敗したメールが ${failedMails} 通あります（直近24時間）`);

  const { count: stuckQueue } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lt("queued_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());
  if ((stuckQueue ?? 0) > 0) problems.push(`1時間以上送られていないメールが ${stuckQueue} 通あります`);

  const { data: stuckRefunds } = await admin
    .from("refunds")
    .select("id, order_id, amount")
    .eq("method", "stripe")
    .is("stripe_refund_id", null)
    .lt("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString());
  if (stuckRefunds && stuckRefunds.length > 0) problems.push(`Stripe に送れていない返金が ${stuckRefunds.length} 件あります`);

  const { data: jobErrors } = await admin.from("job_locks").select("name, last_error").not("last_error", "is", null);
  if (jobErrors && jobErrors.length > 0) {
    problems.push(`定期処理でエラーがありました\n${jobErrors.map((j) => `・${j.name}: ${j.last_error}`).join("\n")}`);
  }

  if (problems.length > 0) {
    await alertStaff({ to: "maintainer", title: "注文サイトの監視", body: problems.join("\n\n"), key: "monitor" });
  }
  return { problems: problems.length };
}

const HOURLY: [string, (now: Date) => Promise<JobResult>][] = [
  ["J1", jobSaleStarted],
  ["J2", jobDeadlineReminders],
  ["J3", jobPaymentReminders],
  ["J4", jobExpirePending],
  ["J5", jobFixProduction],
  ["J6", jobCleanupDrafts],
  ["J7", jobNewYear],
  ["J8", jobMonitor],
];

export async function runHourlyJobs(now = new Date()) {
  const results: Record<string, JobResult> = {};
  for (const [name, fn] of HOURLY) results[name] = await withLock(name, () => fn(now));
  return results;
}

export async function runSendJob() {
  return withLock("S1", () => processMailQueue({ timeBudgetMs: 240_000 }));
}
