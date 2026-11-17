import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/admin/action-form";
import { EventFields } from "@/components/admin/event-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Notice } from "@/components/site/notice";
import { requireStaff } from "@/lib/server/auth";
import { jacketUrl } from "@/lib/server/events";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { orderWindow } from "@/lib/domain/deadlines";
import { formatYen } from "@/lib/domain/pricing";
import { EVENT_STATUS_LABEL, MEDIA_LABEL } from "@/lib/domain/status";
import { formatJstCompact, toJstLocalInput } from "@/lib/domain/time";
import { cancelEvent, copyEvent, extendDeadline, saveEvent, saveProduct, saveTargets, sendLateNotice, setPublished, uploadJacket } from "../actions";

export const metadata: Metadata = { title: "行事の詳細" };

// A05 行事の詳細：項目、商品と価格、対象の学年・クラス、公開・非公開、締切の延長、中止、前年からコピー
export default async function EventAdminPage(props: PageProps<"/admin/events/[eventId]">) {
  await requireStaff();
  const { eventId } = await props.params;
  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("*, school:schools!inner(id, name)").eq("id", eventId).maybeSingle();
  if (!event) notFound();
  const [{ data: schools }, { data: classes }, { data: targets }, { data: products }, { data: changes }, { data: orderCounts }, settings] = await Promise.all([
    admin.from("schools").select("id, name").order("name"),
    admin.from("classes").select("id, grade_label, name, grade_order").eq("school_id", event.school_id).eq("fiscal_year", event.fiscal_year).order("grade_order").order("name"),
    admin.from("event_targets").select("class_id").eq("event_id", eventId),
    admin.from("products").select("*, product_targets(class_id)").eq("event_id", eventId).order("sort_order"),
    admin.from("event_deadline_changes").select("*").eq("event_id", eventId).order("created_at"),
    admin.from("orders").select("payment_status").eq("event_id", eventId).neq("payment_status", "draft"),
    getSettings(),
  ]);
  const targetSet = new Set((targets ?? []).map((t) => t.class_id));
  const grades = [...new Set((classes ?? []).map((c) => c.grade_label))];
  const published = event.status === "published";
  const canceled = event.status === "canceled";
  const window = orderWindow(event, new Date());
  const jacket = await jacketUrl(event.jacket_image_path);
  const ordersTotal = orderCounts?.length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={event.name}
        description={<>{event.school.name}　{event.fiscal_year}年度　{EVENT_STATUS_LABEL[event.status as keyof typeof EVENT_STATUS_LABEL]}　注文 {ordersTotal} 件</>}
        actions={
          <>
            <Link href={`/admin/orders?event=${event.id}`} className="self-center text-sm text-brand underline">注文を見る</Link>
            <Link href={`/admin/production?event=${event.id}`} className="self-center text-sm text-brand underline">集計</Link>
            <ActionForm action={copyEvent.bind(null, event.id)} confirm="この行事を次の年度にコピーします（非公開で作ります）"><SubmitButton variant="outline" size="sm">次の年度にコピー</SubmitButton></ActionForm>
            {!canceled ? (
              <ActionForm action={setPublished.bind(null, event.id, !published)} confirm={published ? "非公開にします" : "公開します。販売開始の日時になると、対象の会員にお知らせメールが届きます"}>
                <SubmitButton size="sm" variant={published ? "outline" : "default"}>{published ? "非公開にする" : "公開する"}</SubmitButton>
              </ActionForm>
            ) : null}
          </>
        }
      />
      {canceled ? <Notice tone="warning" title="この行事は中止しました">{event.canceled_at ? formatJstCompact(event.canceled_at) : ""}</Notice> : null}

      <Panel title="行事の項目">
        <ActionForm action={saveEvent.bind(null, event.id)} className="space-y-4">
          <EventFields event={event} schools={schools ?? []} defaultYear={event.fiscal_year} defaultNote={settings.delivery_note_default} lockDeadline={published} />
          <SubmitButton variant="outline">保存する</SubmitButton>
        </ActionForm>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="対象の学年・クラス">
          {(classes ?? []).length === 0 ? (
            <p className="text-sm">この年度のクラスがありません。<Link href={`/admin/schools/${event.school_id}?year=${event.fiscal_year}`} className="text-brand underline">クラスを作る</Link></p>
          ) : (
            <ActionForm action={saveTargets.bind(null, event.id)} className="space-y-3 text-sm">
              {grades.map((g) => (
                <fieldset key={g} className="space-y-1">
                  <legend className="font-bold">{g}</legend>
                  <div className="flex flex-wrap gap-3">
                    {(classes ?? []).filter((c) => c.grade_label === g).map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5"><input type="checkbox" name="classId" value={c.id} defaultChecked={targetSet.has(c.id)} className="size-4" />{c.name}</label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <SubmitButton variant="outline">対象を保存する</SubmitButton>
            </ActionForm>
          )}
        </Panel>
        <Panel title="ジャケット画像（会員ページだけに出します）">
          <div className="flex gap-4">
            {jacket ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={jacket} alt="ジャケット" className="h-40 w-30 rounded border object-cover" />
            ) : <div className="flex h-40 w-30 items-center justify-center rounded border bg-surface text-xs text-muted-foreground">なし</div>}
            <ActionForm action={uploadJacket.bind(null, event.id)} className="space-y-2 text-sm">
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp" className="text-sm" />
              <p className="text-xs text-muted-foreground">JPEG・PNG・WebP、5MBまで</p>
              <SubmitButton variant="outline" size="sm">アップロード</SubmitButton>
            </ActionForm>
          </div>
        </Panel>
      </div>

      <Panel title="商品と価格（税込）">
        <div className="space-y-3">
          {(products ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              {p.status === "canceled" ? (
                <p className="text-sm"><span className="font-bold">{p.name}</span>（{MEDIA_LABEL[p.media as "dvd" | "bluray"]}）{formatYen(p.price)}　<span className="font-bold text-danger">販売中止</span></p>
              ) : (
                <>
                  <ActionForm action={saveProduct.bind(null, event.id, p.id)} className="grid items-end gap-2 text-sm sm:grid-cols-[6rem_1fr_6rem_6rem_6rem_4rem_auto]">
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">種類</span><select name="media" defaultValue={p.media} className={`${selectClass} w-full`}><option value="dvd">DVD</option><option value="bluray">Blu-ray</option></select></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">商品名</span><input name="name" defaultValue={p.name} className={`${inputClass} w-full`} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">価格</span><input name="price" inputMode="numeric" defaultValue={p.price} className={`${inputClass} w-full`} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">2枚目以降</span><input name="secondPrice" inputMode="numeric" defaultValue={p.second_price ?? ""} className={`${inputClass} w-full`} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">締切後</span><input name="latePrice" inputMode="numeric" defaultValue={p.late_price ?? ""} className={`${inputClass} w-full`} /></label>
                    <label className="space-y-1"><span className="block text-xs text-muted-foreground">並び</span><input name="sortOrder" inputMode="numeric" defaultValue={p.sort_order} className={`${inputClass} w-full`} /></label>
                    <SubmitButton size="sm" variant="outline">保存</SubmitButton>
                    <details className="text-xs sm:col-span-7">
                      <summary className="cursor-pointer text-muted-foreground">この商品の対象を一部のクラスに絞る（空なら行事の対象と同じ）</summary>
                      <div className="mt-1 flex flex-wrap gap-3">
                        {(classes ?? []).filter((c) => targetSet.has(c.id)).map((c) => (
                          <label key={c.id} className="flex items-center gap-1"><input type="checkbox" name="productClassId" value={c.id} defaultChecked={p.product_targets.some((t) => t.class_id === c.id)} />{c.grade_label} {c.name}</label>
                        ))}
                      </div>
                    </details>
                  </ActionForm>
                  {published ? (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-danger">この商品を中止する</summary>
                      <ActionForm action={cancelEvent.bind(null, event.id, p.id)} confirm={`「${p.name}」を中止し、受付済みの注文を取り消して返金します。元に戻せません。よろしいですか？`} className="mt-2 flex gap-2">
                        <input name="reason" placeholder="中止の理由（記録用）" className={`${inputClass} flex-1`} />
                        <SubmitButton size="sm" variant="destructive">中止して返金する</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </>
              )}
            </div>
          ))}
          {!canceled ? (
            <ActionForm action={saveProduct.bind(null, event.id, null)} className="grid items-end gap-2 rounded-lg border border-dashed p-3 text-sm sm:grid-cols-[6rem_1fr_6rem_6rem_6rem_4rem_auto]">
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">種類</span><select name="media" className={`${selectClass} w-full`}><option value="dvd">DVD</option><option value="bluray">Blu-ray</option></select></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">商品名</span><input name="name" placeholder="例：運動会 DVD" className={`${inputClass} w-full`} /></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">価格</span><input name="price" inputMode="numeric" className={`${inputClass} w-full`} /></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">2枚目以降</span><input name="secondPrice" inputMode="numeric" className={`${inputClass} w-full`} /></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">締切後</span><input name="latePrice" inputMode="numeric" className={`${inputClass} w-full`} /></label>
              <label className="space-y-1"><span className="block text-xs text-muted-foreground">並び</span><input name="sortOrder" inputMode="numeric" defaultValue={(products?.length ?? 0) + 1} className={`${inputClass} w-full`} /></label>
              <SubmitButton size="sm">追加</SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </Panel>

      {published ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="締切の延長">
            <ActionForm action={extendDeadline.bind(null, event.id)} className="space-y-2 text-sm">
              <p>いまの締切：{formatJstCompact(event.deadline_at)}</p>
              <input name="deadlineAt" type="datetime-local" defaultValue={toJstLocalInput(event.deadline_at)} className={`${inputClass} w-full`} />
              <label className="flex items-center gap-2"><input type="checkbox" name="notify" className="size-4" />まだ注文していない会員に、延長のお知らせを送る</label>
              <SubmitButton variant="outline">延長する</SubmitButton>
            </ActionForm>
            {(changes ?? []).length > 0 ? (
              <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
                {changes!.map((c) => <li key={c.id}>{formatJstCompact(c.created_at)}：{formatJstCompact(c.old_deadline_at)} → {formatJstCompact(c.new_deadline_at)}{c.notify ? "（お知らせあり）" : ""}</li>)}
              </ul>
            ) : null}
          </Panel>
          <Panel title="お知らせと中止">
            <div className="space-y-4 text-sm">
              {event.late_enabled && window === "late" ? (
                <ActionForm action={sendLateNotice.bind(null, event.id)} confirm="まだ注文していない会員に、締切後の受付のお知らせを送ります">
                  <SubmitButton variant="outline">締切後の受付のお知らせを送る</SubmitButton>
                </ActionForm>
              ) : (
                <p className="text-muted-foreground">締切後の受付のお知らせは、締切後の受付期間中に送れます。</p>
              )}
              <details>
                <summary className="cursor-pointer font-bold text-danger">行事を中止する</summary>
                <ActionForm action={cancelEvent.bind(null, event.id, null)} confirm="行事を中止し、すべての注文を取り消して返金します。元に戻せません。よろしいですか？" className="mt-2 space-y-2">
                  <p className="text-muted-foreground">撮影や制作のトラブルのときに使います。支払い済みの注文は返金し、支払い待ちは取り消して、注文者にお知らせします。</p>
                  <input name="reason" placeholder="中止の理由（記録用）" className={`${inputClass} w-full`} />
                  <SubmitButton variant="destructive">中止して返金する</SubmitButton>
                </ActionForm>
              </details>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
