"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/server/auth";
import { writeAudit } from "@/lib/server/audit";
import { enqueueUnorderedReminder } from "@/lib/server/jobs";
import { cancelEventOrProduct } from "@/lib/server/orders/cancel";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { fromJstLocalInput } from "@/lib/domain/time";
import { str, type FormState } from "@/lib/form";

// A05 行事・商品

const eventSchema = z
  .object({
    schoolId: z.string().uuid("学校・園を選んでください"),
    fiscalYear: z.coerce.number().int().min(2000).max(2100),
    name: z.string().min(1, "行事名を入力してください").max(80),
    heldOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    saleStartsAt: z.string().min(1, "販売開始の日時を入力してください"),
    deadlineAt: z.string().min(1, "締切の日時を入力してください"),
    deliveryMethod: z.enum(["school", "mail", "either"]),
    shippingFee: z.string().regex(/^(\d+)?$/, "送料は数字で入力してください"),
    deliveryNote: z.string().max(200),
    lateEnabled: z.boolean(),
    lateUntil: z.string(),
    lateDeliveryNote: z.string().max(200),
    contents: z.string().max(4000),
  })
  .refine((v) => !v.lateEnabled || v.lateUntil, { message: "締切後の受付期限を入力してください", path: ["lateUntil"] });

function readEvent(fd: FormData) {
  return {
    schoolId: str(fd, "schoolId"),
    fiscalYear: str(fd, "fiscalYear"),
    name: str(fd, "name"),
    heldOn: str(fd, "heldOn"),
    saleStartsAt: str(fd, "saleStartsAt"),
    deadlineAt: str(fd, "deadlineAt"),
    deliveryMethod: str(fd, "deliveryMethod"),
    shippingFee: str(fd, "shippingFee"),
    deliveryNote: str(fd, "deliveryNote"),
    lateEnabled: fd.get("lateEnabled") === "on",
    lateUntil: str(fd, "lateUntil"),
    lateDeliveryNote: str(fd, "lateDeliveryNote"),
    contents: str(fd, "contents"),
  };
}

export async function saveEvent(eventId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = eventSchema.safeParse(readEvent(fd));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const v = parsed.data;
  let sale: Date, deadline: Date, lateUntil: Date | null;
  try {
    sale = fromJstLocalInput(v.saleStartsAt);
    deadline = fromJstLocalInput(v.deadlineAt);
    lateUntil = v.lateEnabled ? fromJstLocalInput(v.lateUntil) : null;
  } catch {
    return { message: "日時の形式が正しくありません" };
  }
  if (deadline <= sale) return { message: "締切は販売開始より後にしてください" };
  if (lateUntil && lateUntil <= deadline) return { message: "締切後の受付期限は、締切より後にしてください" };

  const admin = createAdminClient();
  const row = {
    school_id: v.schoolId,
    fiscal_year: v.fiscalYear,
    name: v.name,
    held_on: v.heldOn || null,
    sale_starts_at: sale.toISOString(),
    deadline_at: deadline.toISOString(),
    delivery_method: v.deliveryMethod,
    shipping_fee: v.shippingFee === "" ? null : Number(v.shippingFee),
    delivery_note: v.deliveryNote || null,
    late_enabled: v.lateEnabled,
    late_until: lateUntil?.toISOString() ?? null,
    late_delivery_note: v.lateDeliveryNote || null,
    contents: v.contents || null,
  };
  if (eventId) {
    const { data: current } = await admin.from("events").select("status, deadline_at").eq("id", eventId).single();
    if (current?.status === "published" && current.deadline_at !== row.deadline_at) {
      return { message: "公開中の行事の締切は、「締切の延長」から変えてください（お知らせと記録のため）" };
    }
    if (current?.status === "canceled") return { message: "中止した行事は変更できません" };
    const { error } = await admin.from("events").update(row).eq("id", eventId);
    if (error) return { message: "保存できませんでした" };
    await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.update", targetType: "event", targetId: eventId, detail: row });
    revalidatePath(`/admin/events/${eventId}`);
    return { ok: true, message: "保存しました" };
  }
  const { data, error } = await admin.from("events").insert({ ...row, status: "draft" }).select("id").single();
  if (error) return { message: "作成できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.create", targetType: "event", targetId: data.id, detail: row });
  redirect(`/admin/events/${data.id}`);
}

export async function saveTargets(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const classIds = fd.getAll("classId").map(String);
  const admin = createAdminClient();
  const { data: existing } = await admin.from("event_targets").select("class_id").eq("event_id", eventId);
  const before = new Set((existing ?? []).map((e) => e.class_id));
  const after = new Set(classIds);
  const remove = [...before].filter((c) => !after.has(c));
  const add = [...after].filter((c) => !before.has(c));
  if (remove.length) {
    await admin.from("product_targets").delete().in("class_id", remove).in("product_id", (await admin.from("products").select("id").eq("event_id", eventId)).data?.map((p) => p.id) ?? []);
    await admin.from("event_targets").delete().eq("event_id", eventId).in("class_id", remove);
  }
  if (add.length) {
    const { error } = await admin.from("event_targets").insert(add.map((class_id) => ({ event_id: eventId, class_id })));
    if (error) return { message: "対象のクラスを保存できませんでした" };
  }
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.update", targetType: "event", targetId: eventId, detail: { targets: classIds } });
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: "対象のクラスを保存しました" };
}

const productSchema = z.object({
  media: z.enum(["dvd", "bluray"]),
  name: z.string().min(1, "商品名を入力してください").max(60),
  price: z.coerce.number().int().positive("価格を入力してください"),
  secondPrice: z.string().regex(/^(\d+)?$/),
  latePrice: z.string().regex(/^(\d+)?$/),
  sortOrder: z.coerce.number().int().min(0).max(99),
});

export async function saveProduct(eventId: string, productId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = productSchema.safeParse({
    media: str(fd, "media"),
    name: str(fd, "name"),
    price: str(fd, "price"),
    secondPrice: str(fd, "secondPrice"),
    latePrice: str(fd, "latePrice"),
    sortOrder: str(fd, "sortOrder") || "0",
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const v = parsed.data;
  const row = {
    event_id: eventId,
    kind: "disc",
    media: v.media,
    name: v.name,
    price: v.price,
    second_price: v.secondPrice ? Number(v.secondPrice) : null,
    late_price: v.latePrice ? Number(v.latePrice) : null,
    sort_order: v.sortOrder,
  };
  const admin = createAdminClient();
  let id = productId;
  if (productId) {
    const { error } = await admin.from("products").update(row).eq("id", productId).eq("event_id", eventId).eq("status", "on_sale");
    if (error) return { message: "保存できませんでした" };
  } else {
    const { data, error } = await admin.from("products").insert(row).select("id").single();
    if (error) return { message: "追加できませんでした" };
    id = data.id;
  }
  // 商品ごとの対象（空なら行事の対象と同じ）
  const targets = fd.getAll("productClassId").map(String);
  await admin.from("product_targets").delete().eq("product_id", id!);
  if (targets.length) {
    const { error } = await admin.from("product_targets").insert(targets.map((class_id) => ({ product_id: id!, class_id })));
    if (error) return { message: "商品の対象クラスは、行事の対象クラスから選んでください" };
  }
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.update", targetType: "product", targetId: id!, detail: { ...row, targets } });
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: "商品を保存しました" };
}

export async function setPublished(eventId: string, publish: boolean): Promise<FormState> {
  const staff = await requireStaff();
  const admin = createAdminClient();
  if (publish) {
    const [{ count: t }, { count: p }] = await Promise.all([
      admin.from("event_targets").select("class_id", { count: "exact", head: true }).eq("event_id", eventId),
      admin.from("products").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "on_sale"),
    ]);
    if (!t || !p) return { message: "公開するには、対象のクラスと商品を1つ以上登録してください" };
  } else {
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("event_id", eventId).neq("payment_status", "draft");
    if (count) return { message: "注文がある行事は非公開にできません。販売をやめるときは「中止」を使ってください" };
  }
  const { error } = await admin.from("events").update({ status: publish ? "published" : "draft" }).eq("id", eventId).neq("status", "canceled");
  if (error) return { message: "変更できませんでした" };
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: publish ? "event.publish" : "event.unpublish", targetType: "event", targetId: eventId });
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: publish ? "公開しました。販売開始の日時になると、お知らせメールが届きます" : "非公開にしました" };
}

/** 締切の延長（9.6）：上書きして履歴に残す。お知らせ（deadline_extended）を送るかは選ぶ */
export async function extendDeadline(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const admin = createAdminClient();
  const { data: ev } = await admin.from("events").select("deadline_at, late_until, late_enabled, status").eq("id", eventId).single();
  if (!ev || ev.status !== "published") return { message: "公開中の行事だけ延長できます" };
  let next: Date;
  try {
    next = fromJstLocalInput(str(fd, "deadlineAt"));
  } catch {
    return { message: "日時を入力してください" };
  }
  if (next <= new Date(ev.deadline_at)) return { message: "いまの締切より後の日時を入れてください" };
  if (ev.late_enabled && ev.late_until && next >= new Date(ev.late_until)) return { message: "締切後の受付期限より前にしてください（先に受付期限を延ばしてください）" };
  const notify = fd.get("notify") === "on";
  await admin.from("events").update({ deadline_at: next.toISOString(), production_fixed_at: null }).eq("id", eventId);
  await admin.from("event_deadline_changes").insert({ event_id: eventId, old_deadline_at: ev.deadline_at, new_deadline_at: next.toISOString(), notify, changed_by: staff.user_id });
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.extend_deadline", targetType: "event", targetId: eventId, detail: { from: ev.deadline_at, to: next.toISOString(), notify } });
  let queued = 0;
  if (notify) queued = await enqueueUnorderedReminder(eventId, "deadline_extended", next.toISOString());
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: `締切を延長しました${notify ? `（お知らせ ${queued} 通を送ります）` : ""}` };
}

export async function sendLateNotice(eventId: string): Promise<FormState> {
  const staff = await requireStaff();
  const { data: ev } = await createAdminClient().from("events").select("late_enabled, late_until, status").eq("id", eventId).single();
  if (!ev?.late_enabled || ev.status !== "published" || !ev.late_until || new Date(ev.late_until) < new Date()) {
    return { message: "締切後の受付をしている行事だけ送れます" };
  }
  const queued = await enqueueUnorderedReminder(eventId, "late_order_open", ev.late_until);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.late_notice", targetType: "event", targetId: eventId, detail: { queued } });
  return { ok: true, message: `締切後の受付のお知らせを ${queued} 通送ります` };
}

export async function cancelEvent(eventId: string, productId: string | null, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const reason = str(fd, "reason");
  if (!reason) return { message: "中止の理由を入力してください（お客様へのメールには載りません）" };
  const r = await cancelEventOrProduct(staff.user_id, { eventId, productId: productId ?? undefined, reason });
  revalidatePath(`/admin/events/${eventId}`);
  return {
    ok: r.failed.length === 0,
    message: `中止しました。取り消した注文 ${r.canceled} 件（うち返金 ${r.refunded} 件）${r.failed.length ? `。処理できなかった注文：${r.failed.join("、")}` : ""}`,
  };
}

/** ジャケット画像（会員ページでだけ出す。公開しない） */
export async function uploadJacket(eventId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "画像を選んでください" };
  if (file.size > 5 * 1024 * 1024) return { message: "画像は5MB以下にしてください" };
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  if (!ext) return { message: "JPEG・PNG・WebP の画像を選んでください" };
  const path = `${eventId}/${Date.now()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("jackets").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { message: "アップロードできませんでした" };
  await admin.from("events").update({ jacket_image_path: path }).eq("id", eventId);
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.update", targetType: "event", targetId: eventId, detail: { jacket: path } });
  revalidatePath(`/admin/events/${eventId}`);
  return { ok: true, message: "ジャケット画像を登録しました" };
}

/** 前年からコピー：行事の項目・商品をコピーし、対象は同じ学年・クラス名の新年度のクラスにする */
export async function copyEvent(eventId: string): Promise<FormState> {
  const staff = await requireStaff();
  const admin = createAdminClient();
  const settings = await getSettings();
  const { data: src } = await admin.from("events").select("*, products(*), event_targets(class:classes(grade_label, name))").eq("id", eventId).single();
  if (!src) return { message: "行事が見つかりません" };
  const year = src.fiscal_year + 1;
  const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 364 * 24 * 3600 * 1000).toISOString() : null);
  const { data: created, error } = await admin
    .from("events")
    .insert({
      school_id: src.school_id,
      fiscal_year: year,
      name: src.name.replace(String(src.fiscal_year), String(year)),
      held_on: src.held_on ? shift(`${src.held_on}T03:00:00Z`)!.slice(0, 10) : null,
      sale_starts_at: shift(src.sale_starts_at)!,
      deadline_at: shift(src.deadline_at)!,
      delivery_method: src.delivery_method,
      shipping_fee: src.shipping_fee,
      delivery_note: src.delivery_note ?? settings.delivery_note_default,
      late_enabled: src.late_enabled,
      late_until: shift(src.late_until),
      late_delivery_note: src.late_delivery_note,
      contents: src.contents,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !created) return { message: "コピーできませんでした" };
  const products = (src.products ?? []).filter((p) => p.status === "on_sale");
  if (products.length) {
    await admin.from("products").insert(products.map((p) => ({ event_id: created.id, kind: p.kind, media: p.media, name: p.name, price: p.price, second_price: p.second_price, late_price: p.late_price, sort_order: p.sort_order })));
  }
  const { data: newClasses } = await admin.from("classes").select("id, grade_label, name").eq("school_id", src.school_id).eq("fiscal_year", year);
  const targets = (src.event_targets ?? [])
    .map((t) => (newClasses ?? []).find((c) => c.grade_label === t.class?.grade_label && c.name === t.class?.name)?.id)
    .filter((v): v is string => Boolean(v));
  if (targets.length) await admin.from("event_targets").insert(targets.map((class_id) => ({ event_id: created.id, class_id })));
  await writeAudit({ actorId: staff.user_id, actorType: "staff", action: "event.create", targetType: "event", targetId: created.id, detail: { copied_from: eventId } });
  redirect(`/admin/events/${created.id}`);
}
