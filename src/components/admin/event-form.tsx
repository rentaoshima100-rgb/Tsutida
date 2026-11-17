import { inputClass, selectClass } from "@/components/admin/ui";
import { toJstLocalInput } from "@/lib/domain/time";
import type { EventRow } from "@/lib/server/orders/load";

/** 行事の項目（A05）。日時は日本時間で入力する */
export function EventFields({
  event,
  schools,
  defaultYear,
  defaultNote,
  lockDeadline,
}: {
  event?: EventRow | null;
  schools: { id: string; name: string }[];
  defaultYear: number;
  defaultNote: string;
  lockDeadline?: boolean;
}) {
  const L = (label: string, child: React.ReactNode, span = "") => (
    <label className={`space-y-1 ${span}`}>
      <span className="block text-xs text-muted-foreground">{label}</span>
      {child}
    </label>
  );
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      {L("学校・園", (
        <select name="schoolId" defaultValue={event?.school_id ?? ""} className={`${selectClass} w-full`} disabled={Boolean(event)}>
          <option value="" disabled>選ぶ</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ))}
      {event ? <input type="hidden" name="schoolId" value={event.school_id} /> : null}
      {L("年度", <input name="fiscalYear" type="number" defaultValue={event?.fiscal_year ?? defaultYear} className={`${inputClass} w-full`} readOnly={Boolean(event)} />)}
      {L("行事名", <input name="name" defaultValue={event?.name ?? ""} placeholder="例：2026年度 運動会" className={`${inputClass} w-full`} />, "sm:col-span-2")}
      {L("開催日", <input name="heldOn" type="date" defaultValue={event?.held_on ?? ""} className={`${inputClass} w-full`} />)}
      {L("受け取り方法", (
        <select name="deliveryMethod" defaultValue={event?.delivery_method ?? "either"} className={`${selectClass} w-full`}>
          <option value="either">選択制（学校・園か郵送）</option>
          <option value="school">学校・園への納品のみ</option>
          <option value="mail">郵送のみ（卒園式・卒業式など）</option>
        </select>
      ))}
      {L("販売開始（日本時間）", <input name="saleStartsAt" type="datetime-local" defaultValue={event ? toJstLocalInput(event.sale_starts_at) : ""} className={`${inputClass} w-full`} />)}
      {L(lockDeadline ? "締切（公開中は「締切の延長」で変える）" : "締切（日本時間）", (
        <>
          <input name="deadlineAt" type="datetime-local" defaultValue={event ? toJstLocalInput(event.deadline_at) : ""} className={`${inputClass} w-full`} readOnly={lockDeadline} />
        </>
      ))}
      {L("送料（空なら設定の初期値）", <input name="shippingFee" inputMode="numeric" defaultValue={event?.shipping_fee ?? ""} className={`${inputClass} w-full`} />)}
      {L("お届け予定", <input name="deliveryNote" defaultValue={event?.delivery_note ?? defaultNote} className={`${inputClass} w-full`} />)}
      <div className="space-y-2 rounded-lg bg-surface p-3 sm:col-span-2">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="lateEnabled" defaultChecked={event?.late_enabled ?? false} className="size-4" />締切後の注文を受け付ける（郵送のみ・締切後の価格）</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {L("締切後の受付期限（日本時間）", <input name="lateUntil" type="datetime-local" defaultValue={event?.late_until ? toJstLocalInput(event.late_until) : ""} className={`${inputClass} w-full`} />)}
          {L("締切後の注文のお届け予定", <input name="lateDeliveryNote" defaultValue={event?.late_delivery_note ?? "受付期限から約2週間後に発送します"} className={`${inputClass} w-full`} />)}
        </div>
      </div>
      {L("収録内容（演目・収録時間）", <textarea name="contents" rows={4} defaultValue={event?.contents ?? ""} className="w-full rounded-md border border-input bg-white p-2.5 text-sm" />, "sm:col-span-2")}
    </div>
  );
}
