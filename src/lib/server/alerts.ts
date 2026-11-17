import "server-only";
import { enqueueMail } from "@/lib/server/mail/queue";
import { getSettings } from "@/lib/server/settings";
import { jstDate } from "@/lib/domain/time";

// 管理者・保守担当への知らせ（10.2・12章 J8）。同じ知らせは1日1回（dedupe_key に日付を入れる）

export async function alertStaff(params: {
  to: "business" | "maintainer" | "both";
  title: string;
  body: string;
  key: string;
}) {
  const s = await getSettings();
  const targets: string[] = [];
  if ((params.to === "business" || params.to === "both") && s.contact_inbox) targets.push(s.contact_inbox);
  if ((params.to === "maintainer" || params.to === "both") && s.maintainer_email) targets.push(s.maintainer_email);
  const day = jstDate(new Date());
  for (const to of [...new Set(targets)]) {
    await enqueueMail("staff_alert", {
      to,
      dedupeKey: `alert:${params.key}:${day}:${to}`,
      vars: { alert_title: params.title, alert_body: params.body },
    });
  }
  if (targets.length === 0) console.warn(`[alert] 宛先が設定されていません: ${params.title}`);
}
