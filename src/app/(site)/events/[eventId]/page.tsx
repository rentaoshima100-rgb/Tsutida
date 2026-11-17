import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventView } from "@/components/events/event-view";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/server/auth";
import { eventViewData } from "@/lib/server/events";
import { loadOrderContext } from "@/lib/server/orders/context";
import { getSettings } from "@/lib/server/settings";
import { formatJstDateTime } from "@/lib/domain/time";

export const metadata: Metadata = { title: "行事のページ", robots: { index: false } };

// M02 行事のページ
export default async function EventPage(props: PageProps<"/events/[eventId]">) {
  const { eventId } = await props.params;
  const member = await requireMember(`/events/${eventId}`);
  const ctx = await loadOrderContext(member.id, eventId);
  if (!ctx) notFound();
  const [data, settings] = await Promise.all([eventViewData(ctx), getSettings()]);
  return (
    <EventView data={data} playbackNote={settings.playback_note}>
      {ctx.canOrder ? (
        <div className="space-y-3 rounded-2xl bg-surface p-5">
          {ctx.isLate ? (
            <Notice tone="warning" title="締切後のご注文です">
              締切後の価格になり、お届けはご自宅への郵送だけです（{ctx.event.late_delivery_note ?? "受付期限のあとにまとめて制作します"}）。
            </Notice>
          ) : null}
          <Button asChild size="xl" className="w-full">
            <Link href={`/events/${eventId}/order`}>注文する</Link>
          </Button>
        </div>
      ) : ctx.window === "before_sale" ? (
        <Notice tone="info" title="受付前です">{formatJstDateTime(ctx.event.sale_starts_at)}から注文できます。</Notice>
      ) : (
        <Notice tone="info" title="受付終了">この行事のご注文の受付は終わりました。ご注文の内容は、マイページの注文履歴で確認できます。</Notice>
      )}
    </EventView>
  );
}
