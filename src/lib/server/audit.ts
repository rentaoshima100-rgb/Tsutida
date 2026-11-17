import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

// 操作の記録（14章）：注文の状態の変更、返金、登録コードの再発行、つながりの解除、設定の変更

export type AuditEntry = {
  actorId: string | null;
  actorType: "staff" | "member" | "system";
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, unknown>;
};

export async function writeAudit(entry: AuditEntry | AuditEntry[]) {
  const rows = (Array.isArray(entry) ? entry : [entry]).map((e) => ({
    actor_id: e.actorId,
    actor_type: e.actorType,
    action: e.action,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    detail: (e.detail ?? {}) as { [key: string]: Json },
  }));
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("audit_logs").insert(rows);
  if (error) throw error;
}

/** 操作の名前（A17 の表示） */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "order.paid_cash": "現金の入金を確認",
  "order.cancel": "注文の取り消し",
  "order.cancel_items": "明細の取り消し・返金",
  "order.refund_retry": "返金のやり直し",
  "order.memo": "注文のメモ",
  "order.exchange": "交換対応の記録",
  "order.proxy_create": "代理注文の作成",
  "order.attention_clear": "要対応の解除",
  "items.in_production": "制作中に変更",
  "items.delivered": "納品済みに変更",
  "items.shipped": "発送済みに変更",
  "code.issue": "登録コードの発行",
  "code.reissue": "登録コードの再発行",
  "code.revoke": "登録コードの無効化",
  "link.revoke": "つながりの解除",
  "event.create": "行事の作成",
  "event.update": "行事の変更",
  "event.publish": "行事の公開",
  "event.unpublish": "行事の非公開",
  "event.extend_deadline": "締切の延長",
  "event.cancel": "行事の中止",
  "product.cancel": "商品の中止",
  "event.late_notice": "締切後の受付のお知らせ",
  "school.create": "学校・園の登録",
  "school.update": "学校・園の変更",
  "class.save": "クラスの変更",
  "year.copy_classes": "前年のクラスをコピー",
  "settings.update": "設定の変更",
  "template.update": "メールの文面の変更",
  "mail.admin_message": "個別のお知らせの送信",
  "staff.create": "管理者の追加",
  "staff.update": "管理者の変更",
  "member.link_revoke": "つながりの解除",
  "member.withdraw": "退会",
  "member.consent": "お知らせの同意の変更",
};
