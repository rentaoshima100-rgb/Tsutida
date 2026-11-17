import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { EventFields } from "@/components/admin/event-form";
import { PageHeader, Panel } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { fiscalYearOf } from "@/lib/domain/time";
import { saveEvent } from "../actions";

export const metadata: Metadata = { title: "行事を作る" };

export default async function NewEventPage() {
  await requireStaff();
  const [{ data: schools }, settings] = await Promise.all([
    createAdminClient().from("schools").select("id, name").order("name"),
    getSettings(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="行事を作る" description="作ったあとで、対象のクラスと商品を登録して公開します" />
      <Panel>
        <ActionForm action={saveEvent.bind(null, null)} className="space-y-4">
          <EventFields schools={schools ?? []} defaultYear={fiscalYearOf(new Date())} defaultNote={settings.delivery_note_default} />
          <SubmitButton size="lg">作る（非公開）</SubmitButton>
        </ActionForm>
      </Panel>
    </div>
  );
}
