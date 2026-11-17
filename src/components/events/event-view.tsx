import { CalendarDays, Clock, Disc3, Truck } from "lucide-react";
import { formatYen } from "@/lib/domain/pricing";
import { DELIVERY_METHOD_LABEL, MEDIA_LABEL } from "@/lib/domain/status";
import { formatDateOnly, formatJstDateTime } from "@/lib/domain/time";
import { Notice } from "@/components/site/notice";

// 行事のページ（M02）と見本の商品ページ（G04）で同じ部品を使う（5章）

export type EventViewData = {
  name: string;
  schoolName: string;
  heldOn: string | null;
  contents: string | null;
  jacketUrl: string | null;
  deadlineAt: string;
  lateUntil: string | null;
  deliveryMethod: "school" | "mail" | "either";
  deliveryNote: string | null;
  lateDeliveryNote: string | null;
  products: {
    id: string;
    name: string;
    media: "dvd" | "bluray" | "photo_data";
    price: number;
    secondPrice: number | null;
    latePrice: number | null;
    canceled: boolean;
  }[];
  childNames: string[];
};

export function EventView({ data, playbackNote, children }: { data: EventViewData; playbackNote: string; children?: React.ReactNode }) {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-bold text-muted-foreground">{data.schoolName}</p>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        {data.childNames.length > 0 ? (
          <p className="text-[0.95rem]">対象のお子さま：{data.childNames.map((n) => `${n}さん`).join("、")}</p>
        ) : null}
      </header>

      <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_1fr]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {data.jacketUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.jacketUrl} alt={`${data.name}のジャケット`} className="aspect-[3/4] w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/4] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Disc3 className="size-12" aria-hidden />
              <span className="text-sm">ジャケットの画像はありません</span>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <dl className="space-y-3 text-[0.95rem]">
            {data.heldOn ? (
              <div className="flex gap-3">
                <dt className="flex w-28 shrink-0 items-center gap-1.5 font-bold"><CalendarDays className="size-4" aria-hidden />開催日</dt>
                <dd>{formatDateOnly(data.heldOn)}</dd>
              </div>
            ) : null}
            <div className="flex gap-3">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 font-bold"><Clock className="size-4" aria-hidden />締切</dt>
              <dd>
                {formatJstDateTime(data.deadlineAt)}
                {data.lateUntil ? (
                  <span className="block text-muted-foreground">締切後のご注文は {formatJstDateTime(data.lateUntil)} まで（郵送のみ）</span>
                ) : null}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="flex w-28 shrink-0 items-center gap-1.5 font-bold"><Truck className="size-4" aria-hidden />受け取り</dt>
              <dd>
                {DELIVERY_METHOD_LABEL[data.deliveryMethod]}
                {data.deliveryNote ? <span className="block text-muted-foreground">{data.deliveryNote}</span> : null}
              </dd>
            </div>
          </dl>
          {data.contents ? (
            <div>
              <h2 className="font-bold">収録内容</h2>
              <p className="mt-1 whitespace-pre-line text-[0.95rem] leading-7">{data.contents}</p>
            </div>
          ) : null}
        </div>
      </div>

      <section aria-labelledby="prices" className="space-y-3">
        <h2 id="prices" className="text-lg font-bold">商品と価格（税込）</h2>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data.products.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
              <span className="font-bold">
                {p.name}
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs font-bold text-muted-foreground">{MEDIA_LABEL[p.media]}</span>
              </span>
              {p.canceled ? (
                <span className="ml-auto font-bold text-danger">販売中止</span>
              ) : (
                <span className="ml-auto text-right">
                  <span className="text-lg font-bold">{formatYen(p.price)}</span>
                  {p.secondPrice && p.secondPrice !== p.price ? (
                    <span className="block text-sm text-muted-foreground">2枚目から {formatYen(p.secondPrice)}</span>
                  ) : null}
                  {data.lateUntil && p.latePrice ? (
                    <span className="block text-sm text-muted-foreground">締切後のご注文 {formatYen(p.latePrice)}</span>
                  ) : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {playbackNote ? <Notice tone="warning" title="再生できる機器について">{playbackNote}</Notice> : null}

      {children}
    </article>
  );
}
