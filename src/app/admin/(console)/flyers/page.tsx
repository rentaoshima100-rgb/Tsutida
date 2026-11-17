import type { Metadata } from "next";
import { CopyButton } from "@/components/admin/copy-button";
import { EventPicker } from "@/components/admin/event-picker";
import { PageHeader, Panel } from "@/components/admin/ui";
import { Notice } from "@/components/site/notice";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { announcementTexts, flyerData } from "@/lib/server/flyers";

export const metadata: Metadata = { title: "チラシ・告知文" };

// A06 案内チラシ・告知文：行事ごとの A4 チラシ PDF と、学校・園の連絡アプリに貼る文
export default async function FlyersPage(props: PageProps<"/admin/flyers">) {
  await requireStaff();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : "";
  const d = eventId ? await flyerData(eventId) : null;

  return (
    <div className="space-y-5">
      <PageHeader title="チラシ・告知文" description="チラシの QR コードと告知文のアドレスは、LINE で開いても外のブラウザで開くようにしてあります。" />
      <EventPicker value={eventId} />
      {eventId && !d ? <Notice tone="error">行事が見つかりません（下書きの行事は選べません）。</Notice> : null}
      {d ? (
        <>
          {d.products.length === 0 ? <Notice tone="warning">販売中の商品がないため、チラシを作れません。</Notice> : null}
          <Panel title="案内チラシ（A4）">
            <p className="mb-3 text-sm text-muted-foreground">
              行事名・収録内容・商品と価格・締切・お届け・注文の方法・お支払い方法・問い合わせ先を載せます。ジャケット画像はお子さまが写ることがあるため載せません。
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg"><a href={`/api/admin/flyers/${d.eventId}`} target="_blank" rel="noopener">チラシを開く（PDF）</a></Button>
              <Button asChild size="lg" variant="outline"><a href={`/api/admin/flyers/${d.eventId}?phone=1`} target="_blank" rel="noopener">電話注文の案内つきで開く</a></Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">チラシに載せる事項は、弁護士の確認が終わるまで変わることがあります（仕様書17章）。</p>
          </Panel>
          {announcementTexts(d).map((a) => (
            <Panel key={a.key} title={`告知文：${a.label}`} actions={<CopyButton text={a.text} />}>
              <pre className="whitespace-pre-wrap rounded-lg bg-surface p-3 font-sans text-sm leading-relaxed">{a.text}</pre>
            </Panel>
          ))}
        </>
      ) : null}
    </div>
  );
}
