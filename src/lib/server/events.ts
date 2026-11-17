import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { EventViewData } from "@/components/events/event-view";
import type { OrderContext } from "@/lib/server/orders/context";

/** ジャケット画像の署名付きURL（会員ページでだけ出す。公開しない） */
export async function jacketUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await createAdminClient().storage.from("jackets").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function eventViewData(ctx: OrderContext): Promise<EventViewData> {
  const e = ctx.event;
  return {
    name: e.name,
    schoolName: e.school.name,
    heldOn: e.held_on,
    contents: e.contents,
    jacketUrl: await jacketUrl(e.jacket_image_path),
    deadlineAt: e.deadline_at,
    lateUntil: e.late_enabled ? e.late_until : null,
    deliveryMethod: e.delivery_method as "school" | "mail" | "either",
    deliveryNote: e.delivery_note,
    lateDeliveryNote: e.late_delivery_note,
    products: ctx.products
      .filter((p) => ctx.children.some((c) => c.productIds.includes(p.id)) || p.status === "canceled")
      .map((p) => ({
        id: p.id,
        name: p.name,
        media: p.media as "dvd" | "bluray" | "photo_data",
        price: p.price,
        secondPrice: p.second_price,
        latePrice: p.late_price,
        canceled: p.status === "canceled",
      })),
    childNames: ctx.children.map((c) => c.fullName),
  };
}
