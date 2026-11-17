import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireMember } from "@/lib/server/auth";
import { listMemberEvents } from "@/lib/server/orders/context";
import { DELIVERY_METHOD_LABEL } from "@/lib/domain/status";
import { formatJstDateTime, formatJstMonthDayTime } from "@/lib/domain/time";

export const metadata: Metadata = { title: "販売中の行事" };

const WINDOW_LABEL = { open: "受付中", late: "締切後の受付中", before_sale: "受付前", closed: "受付終了" } as const;

// M01 販売中の行事
export default async function EventsPage() {
  const member = await requireMember("/events");
  const { hasChildren, events } = await listMemberEvents(member.id);
  if (!hasChildren) redirect("/mypage/children");
  const visible = events.filter((e) => e.window !== "closed");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">販売中の行事</h1>
      {visible.length === 0 ? (
        <div className="space-y-3 rounded-xl bg-surface p-5">
          <p>いま注文できる行事はありません。販売が始まると、メールでお知らせします（お知らせの受け取りに同意した場合）。</p>
          <p>
            <Link href="/mypage" className="font-bold text-brand underline underline-offset-4">注文履歴を見る</Link>
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visible.map((e) => (
            <li key={e.id} className="rounded-2xl border border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-muted-foreground">{e.schoolName}</p>
                  <h2 className="text-lg font-bold">{e.name}</h2>
                </div>
                <span className={e.window === "open" || e.window === "late" ? "rounded-full bg-cap px-3 py-1 text-sm font-bold" : "rounded-full bg-surface px-3 py-1 text-sm font-bold text-muted-foreground"}>
                  {WINDOW_LABEL[e.window]}
                </span>
              </div>
              <dl className="mt-3 space-y-1.5 text-[0.95rem]">
                <div className="flex items-center gap-2">
                  <dt className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-bold"><Clock className="size-4" aria-hidden />締切</dt>
                  <dd>
                    {e.window === "before_sale" ? `${formatJstMonthDayTime(e.saleStartsAt)}から受付　` : ""}
                    {e.window === "late" && e.lateUntil ? `${formatJstDateTime(e.lateUntil)}（締切後の受付）` : formatJstDateTime(e.deadlineAt)}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="flex shrink-0 items-center gap-1.5 whitespace-nowrap font-bold"><Truck className="size-4" aria-hidden />受け取り</dt>
                  <dd>{e.window === "late" ? "ご自宅へ郵送" : DELIVERY_METHOD_LABEL[e.deliveryMethod]}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="font-bold">お子さま</dt>
                  <dd>{e.childNames.map((n) => `${n}さん`).join("、")}</dd>
                </div>
              </dl>
              <Button asChild size="xl" className="mt-4 w-full sm:w-auto" variant={e.window === "open" || e.window === "late" ? "default" : "outline"}>
                <Link href={`/events/${e.id}`}>行事のページを見る</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
