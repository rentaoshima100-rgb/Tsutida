import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { EventPicker, pickedEvent } from "@/components/admin/event-picker";
import { PageHeader, Panel, inputClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { shippingData } from "@/lib/server/fulfillment";
import { importTrackingCsv } from "./actions";

export const metadata: Metadata = { title: "発送（郵送）" };

// A12 発送：宛名ラベル・宛名CSV、追跡番号CSVの取り込み、「発送済み」へ一括変更
export default async function ShippingPage(props: PageProps<"/admin/shipping">) {
  await requireStaff();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : "";
  const event = eventId ? await pickedEvent(eventId) : null;
  const rows = event ? await shippingData(event.id) : [];
  const base = event ? `/api/admin/shipping/${event.id}` : "";
  return (
    <div className="space-y-4">
      <PageHeader title="発送（郵送）" description="「制作中」の郵送の注文を出します。追跡番号を取り込むと「発送済み」になり、注文者にメールが届きます" />
      <EventPicker value={eventId} />
      {event ? (
        <>
          <Panel title={`発送する注文　${rows.length} 件`}>
            <div className="mb-3 flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`${base}?doc=labels`} target="_blank" rel="noopener">宛名ラベル（PDF）</a></Button>
              <Button asChild variant="outline"><a href={`${base}?doc=csv`}>宛名CSV（Excel向け）</a></Button>
              <Button asChild variant="outline"><a href={`${base}?doc=csv&enc=sjis`}>宛名CSV（Shift_JIS）</a></Button>
            </div>
            {rows.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">注文番号</th><th>お届け先</th><th>住所</th><th>内容</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.orderId} className="border-t align-top">
                      <td className="py-2 font-mono">{r.orderNo}{r.isLate ? <span className="ml-1 rounded bg-surface px-1 text-xs">締切後</span> : null}</td>
                      <td>{r.name}<span className="block text-xs text-muted-foreground">{r.phone}</span></td>
                      <td>〒{r.postalCode} {r.address}</td>
                      <td>{r.contents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-muted-foreground">「制作中」の郵送の注文はありません。</p>}
          </Panel>
          <Panel title="追跡番号の取り込み">
            <ActionForm action={importTrackingCsv.bind(null, event.id)} className="space-y-2 text-sm">
              <p className="text-muted-foreground">1行に「注文番号,追跡番号」（3列目に配送会社を入れてもかまいません）。宛名CSVの最後の列に追跡番号を入れて、そのまま取り込めます。</p>
              <input type="file" name="file" accept=".csv,text/csv" />
              <textarea name="text" rows={4} placeholder={"T0000012,1234-5678-9012\nT0000013,1234-5678-9013"} className="w-full rounded-md border border-input bg-white p-2 font-mono text-xs" />
              <label className="flex items-center gap-2"><span className="text-xs text-muted-foreground">配送会社（CSVにないとき）</span><input name="carrier" defaultValue="日本郵便" className={`${inputClass} w-40`} /></label>
              <SubmitButton>取り込んで「発送済み」にする</SubmitButton>
            </ActionForm>
          </Panel>
        </>
      ) : <p className="text-sm text-muted-foreground">行事を選んでください。</p>}
    </div>
  );
}
