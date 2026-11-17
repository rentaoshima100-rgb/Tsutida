import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { EventPicker, pickedEvent } from "@/components/admin/event-picker";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/server/auth";
import { sortingData } from "@/lib/server/fulfillment";
import { deliver } from "./actions";

export const metadata: Metadata = { title: "仕分け（納品）" };

// A11 仕分け：クラス別・名前順の仕分けリスト（PDF・CSV）、お届けラベル、納品書、「納品済み」へ一括変更
export default async function SortingPage(props: PageProps<"/admin/sorting">) {
  await requireStaff();
  const sp = await props.searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : "";
  const event = eventId ? await pickedEvent(eventId) : null;
  const classes = event ? await sortingData(event.id) : [];
  const base = event ? `/api/admin/sorting/${event.id}` : "";
  return (
    <div className="space-y-4">
      <PageHeader title="仕分け（学校・園への納品）" description="学校・園で受け取る分だけを出します。同じお子さまの分は、ご家族が別々に注文した分も1行にまとめます" />
      <EventPicker value={eventId} />
      {event ? (
        <>
          <Panel title="印刷・書き出し">
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`${base}?doc=list`} target="_blank" rel="noopener">仕分けリスト（PDF）</a></Button>
              <Button asChild variant="outline"><a href={`${base}?doc=csv`}>仕分けリスト（CSV）</a></Button>
              <Button asChild variant="outline"><a href={`${base}?doc=labels`} target="_blank" rel="noopener">お届けラベル（PDF）</a></Button>
              <Button asChild variant="outline"><a href={`${base}?doc=delivery`} target="_blank" rel="noopener">納品書（PDF）</a></Button>
            </div>
          </Panel>
          <Panel title="クラスごとの人数と、納品済みへの変更">
            {classes.length === 0 ? <p className="text-sm text-muted-foreground">受付済み・制作中の、学校・園で受け取る分はありません。</p> : (
              <ActionForm action={deliver.bind(null, event.id)} confirm="選んだクラスの「制作中」の明細を「納品済み」にし、注文者にメールを送ります" className="space-y-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="w-8" /><th className="py-1.5">クラス</th><th className="text-right">お子さま</th><th className="text-right">枚数</th></tr></thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c.classId} className="border-t">
                        <td><input type="checkbox" name="class" value={c.classId} className="size-4" aria-label={`${c.label}を納品済みにする`} /></td>
                        <td className="py-2">{c.label}</td>
                        <td className="text-right">{c.children.length}人</td>
                        <td className="text-right">{c.children.reduce((n, ch) => n + ch.lines.reduce((m, l) => m + l.quantity, 0), 0)}枚</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <SubmitButton>選んだクラスを「納品済み」にする</SubmitButton>
              </ActionForm>
            )}
          </Panel>
        </>
      ) : <p className="text-sm text-muted-foreground">行事を選んでください。</p>}
    </div>
  );
}
