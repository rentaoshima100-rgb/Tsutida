import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { EventPicker, pickedEvent } from "@/components/admin/event-picker";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { requireStaff } from "@/lib/server/auth";
import { productionSummary, type ProductionRow } from "@/lib/server/fulfillment";
import { productionFixAt } from "@/lib/domain/deadlines";
import { formatJstCompact } from "@/lib/domain/time";
import { toInProduction } from "./actions";

export const metadata: Metadata = { title: "集計・制作" };

function SummaryTable({ rows }: { rows: ProductionRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">注文はまだありません。</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">商品</th><th className="text-right">受付済み</th><th className="text-right">制作中</th><th className="text-right">納品・発送済み</th><th className="text-right">支払い待ち（見込み）</th><th className="text-right">制作する本数</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.productId} className="border-t">
            <td className="py-2 font-bold">{r.name}</td>
            <td className="text-right">{r.accepted}</td>
            <td className="text-right">{r.inProduction}</td>
            <td className="text-right">{r.done}</td>
            <td className="text-right text-muted-foreground">{r.pending}</td>
            <td className="text-right text-lg font-bold">{r.accepted + r.inProduction + r.done}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// A10 集計・制作：行事・商品ごとの本数、本数の確定、「制作中」へ一括変更。締切後の注文は別に集計
export default async function ProductionPage(props: PageProps<"/admin/production">) {
  await requireStaff();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : "";
  const event = eventId ? await pickedEvent(eventId) : null;
  const summary = event ? await productionSummary(event.id) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="集計・制作" description="本数は、締切日の2日後の23:59（支払い期限が出そろった時点）に確定します" />
      <EventPicker value={eventId} />
      {event && summary ? (
        <>
          <Panel title={`通常の注文　${event.school.name} ${event.name}`}>
            {event.production_fixed_at ? (
              <Notice tone="success" title={`本数が確定しました（${formatJstCompact(event.production_fixed_at)}）`} className="mb-3" />
            ) : (
              <Notice tone="info" title={`本数の確定：${formatJstCompact(productionFixAt(event.deadline_at))}`} className="mb-3">確定までは、支払い待ちの分を見込みとして別に数えています。</Notice>
            )}
            <SummaryTable rows={summary.normal} />
            {event.production_fixed_at && summary.normal.some((r) => r.accepted > 0) ? (
              <ActionForm action={toInProduction.bind(null, event.id, false)} confirm="受付済みの明細を「制作中」に変えます。よろしいですか？" className="mt-3">
                <SubmitButton>受付済みを「制作中」にする</SubmitButton>
              </ActionForm>
            ) : null}
          </Panel>
          {event.late_enabled ? (
            <Panel title="締切後の注文（追加制作）">
              {event.late_production_fixed_at ? (
                <Notice tone="success" title={`本数が確定しました（${formatJstCompact(event.late_production_fixed_at)}）`} className="mb-3" />
              ) : event.late_until ? (
                <Notice tone="info" title={`本数の確定：${formatJstCompact(productionFixAt(event.late_until))}`} className="mb-3" />
              ) : null}
              <SummaryTable rows={summary.late} />
              {event.late_production_fixed_at && summary.late.some((r) => r.accepted > 0) ? (
                <ActionForm action={toInProduction.bind(null, event.id, true)} confirm="締切後の注文の受付済みの明細を「制作中」に変えます" className="mt-3">
                  <SubmitButton>締切後の注文を「制作中」にする</SubmitButton>
                </ActionForm>
              ) : null}
            </Panel>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">行事を選んでください。</p>
      )}
    </div>
  );
}
