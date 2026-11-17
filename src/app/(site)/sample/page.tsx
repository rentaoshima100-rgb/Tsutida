import type { Metadata } from "next";
import Link from "next/link";
import { EventView } from "@/components/events/event-view";
import { Button } from "@/components/ui/button";
import { getPublicSettings } from "@/lib/server/settings";
import { addDays, jstAt, jstDate } from "@/lib/domain/time";

export const metadata: Metadata = { title: "見本の商品ページ" };

/** 見本の締切：今日から2週間後の19時（日本時間） */
function sampleDeadline(): string {
  return jstAt(addDays(jstDate(new Date()), 14), 19).toISOString();
}

// G04 見本の商品ページ：M02 と同じ部品で、架空の行事を出す。お子さまが写る画像は使わない（仕様書3章）
export default async function SamplePage() {
  const s = await getPublicSettings();
  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-cap-soft px-4 py-3 text-[0.95rem] font-bold">
        これは見本です。実際の行事のページは、登録コードで会員登録をしたご家庭だけが見られます。
      </p>
      <EventView
        playbackNote={s.playback_note}
        data={{
          name: "運動会（見本）",
          schoolName: "見本の園",
          heldOn: null,
          contents: "開会式／かけっこ／ダンス／玉入れ／リレー／閉会式\n収録時間：約80分（行事によって変わります）",
          jacketUrl: null,
          deadlineAt: sampleDeadline(),
          lateUntil: null,
          deliveryMethod: "either",
          deliveryNote: "締切から約3週間後に、学校・園へお届け（郵送の場合は発送）します",
          lateDeliveryNote: null,
          products: [
            { id: "dvd", name: "運動会 DVD", media: "dvd", price: 3000, secondPrice: 2500, latePrice: null, canceled: false },
            { id: "bd", name: "運動会 Blu-ray", media: "bluray", price: 3500, secondPrice: 3000, latePrice: null, canceled: false },
          ],
          childNames: [],
        }}
      >
        <div className="rounded-2xl bg-surface p-5">
          <Button asChild size="xl" className="w-full">
            <Link href="/login">注文する（ログインが必要です）</Link>
          </Button>
        </div>
      </EventView>
    </div>
  );
}
