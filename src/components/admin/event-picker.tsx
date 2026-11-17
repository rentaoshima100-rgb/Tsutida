import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/admin/ui";
import { createAdminClient } from "@/lib/supabase/server";

/** 行事を選ぶ（A10〜A12・A06）。新しい順に200件 */
export async function EventPicker({ value }: { value: string }) {
  const { data: events } = await createAdminClient()
    .from("events")
    .select("id, name, fiscal_year, school:schools!inner(name)")
    .neq("status", "draft")
    .order("deadline_at", { ascending: false })
    .limit(200);
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3 text-sm">
      <label className="space-y-1">
        <span className="block text-xs text-muted-foreground">行事</span>
        <select name="event" defaultValue={value} className={`${selectClass} min-w-80`}>
          <option value="" disabled>選ぶ</option>
          {(events ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.school.name}　{e.name}</option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline">表示</Button>
    </form>
  );
}

export async function pickedEvent(eventId: string) {
  if (!/^[0-9a-f-]{36}$/.test(eventId)) return null;
  const { data } = await createAdminClient()
    .from("events")
    .select("id, name, deadline_at, late_enabled, late_until, production_fixed_at, late_production_fixed_at, school:schools!inner(name)")
    .eq("id", eventId)
    .maybeSingle();
  return data;
}
