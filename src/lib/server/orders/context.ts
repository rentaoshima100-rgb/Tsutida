import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { orderWindow, type OrderWindow } from "@/lib/domain/deadlines";
import { getSettings } from "@/lib/server/settings";
import type { PaymentMethod } from "@/lib/domain/status";
import type { EventRow, ProductRow, SchoolRow } from "./load";

// 見られる・注文できる条件（9.1）。RLS の can_view_event() と同じ条件をサーバーでも確かめる。

export type EligibleChild = {
  childId: string;
  fullName: string;
  fullNameKana: string;
  classId: string;
  gradeLabel: string;
  className: string;
  gradeOrder: number;
  /** このお子さまが注文できる商品 */
  productIds: string[];
};

export type OrderContext = {
  event: EventRow & { school: SchoolRow };
  window: OrderWindow;
  isLate: boolean;
  canOrder: boolean;
  products: ProductRow[];
  children: EligibleChild[];
  deliveryOptions: ("school" | "mail")[];
  shippingFee: number;
  paymentMethods: Exclude<PaymentMethod, "cash">[];
  /** この会員に支払い待ちの銀行振込の注文がある（銀行振込は1会員1件まで） */
  hasPendingBankTransfer: boolean;
};

/** 会員がその行事を見られれば、注文に必要な情報を返す。見られなければ null */
export async function loadOrderContext(memberId: string, eventId: string, now = new Date()): Promise<OrderContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("*, school:schools!inner(*)")
    .eq("id", eventId)
    .eq("status", "published")
    .maybeSingle();
  if (!event) return null;

  const [{ data: links }, { data: targets }, { data: products }, { data: member }] = await Promise.all([
    admin
      .from("member_children")
      .select("child_id, child:children!inner(id, full_name, full_name_kana)")
      .eq("member_id", memberId)
      .eq("fiscal_year", event.fiscal_year)
      .is("revoked_at", null),
    admin.from("event_targets").select("class_id").eq("event_id", eventId),
    admin
      .from("products")
      .select("*, product_targets(class_id)")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("created_at"),
    admin.from("members").select("withdrawn_at").eq("id", memberId).maybeSingle(),
  ]);
  if (!member || member.withdrawn_at) return null;

  const targetClasses = new Set((targets ?? []).map((t) => t.class_id));
  const childIds = (links ?? []).map((l) => l.child_id);
  const { data: enrollments } =
    childIds.length > 0
      ? await admin
          .from("child_enrollments")
          .select("child_id, class_id, class:classes!inner(grade_label, name, grade_order)")
          .in("child_id", childIds)
          .eq("fiscal_year", event.fiscal_year)
      : { data: [] };

  const onSale = (products ?? []).filter((p) => p.status === "on_sale");
  const children: EligibleChild[] = [];
  for (const link of links ?? []) {
    const enr = (enrollments ?? []).find((e) => e.child_id === link.child_id);
    if (!enr || !targetClasses.has(enr.class_id)) continue;
    const productIds = onSale
      .filter((p) => p.product_targets.length === 0 || p.product_targets.some((t) => t.class_id === enr.class_id))
      .map((p) => p.id);
    children.push({
      childId: link.child_id,
      fullName: link.child.full_name,
      fullNameKana: link.child.full_name_kana,
      classId: enr.class_id,
      gradeLabel: enr.class.grade_label,
      className: enr.class.name,
      gradeOrder: enr.class.grade_order,
      productIds,
    });
  }
  if (children.length === 0) return null;
  children.sort((a, b) => a.fullNameKana.localeCompare(b.fullNameKana, "ja"));

  const settings = await getSettings();
  const window = orderWindow(event, now);
  const isLate = window === "late";
  const deliveryOptions: ("school" | "mail")[] = isLate
    ? ["mail"]
    : event.delivery_method === "either"
      ? ["school", "mail"]
      : [event.delivery_method as "school" | "mail"];
  const pm = settings.payment_methods;
  const paymentMethods = (["card", "paypay", "konbini", "bank_transfer"] as const).filter((m) => pm[m]);

  const { count } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("payment_method", "bank_transfer")
    .eq("payment_status", "pending");

  return {
    event,
    window,
    isLate,
    canOrder: (window === "open" || window === "late") && children.some((c) => c.productIds.length > 0),
    products: (products ?? []).map(({ product_targets: _t, ...p }) => p),
    children,
    deliveryOptions,
    shippingFee: event.shipping_fee ?? settings.default_shipping_fee,
    paymentMethods,
    hasPendingBankTransfer: (count ?? 0) > 0,
  };
}

/** 会員が見られる行事の一覧（M01）。注文できる行事を先に、締切の近い順 */
export async function listMemberEvents(memberId: string, now = new Date()) {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("member_children")
    .select("child_id, fiscal_year, child:children!inner(full_name)")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  if (!links || links.length === 0) return { hasChildren: false, events: [] as ListedEvent[] };

  const { data: enrollments } = await admin
    .from("child_enrollments")
    .select("child_id, fiscal_year, class_id")
    .in(
      "child_id",
      links.map((l) => l.child_id),
    );
  const myEnrollments = (enrollments ?? []).filter((e) =>
    links.some((l) => l.child_id === e.child_id && l.fiscal_year === e.fiscal_year),
  );
  const classIds = [...new Set(myEnrollments.map((e) => e.class_id))];
  if (classIds.length === 0) return { hasChildren: true, events: [] as ListedEvent[] };

  const { data: targets } = await admin
    .from("event_targets")
    .select("event_id, class_id, event:events!inner(*, school:schools!inner(name))")
    .in("class_id", classIds)
    .eq("event.status", "published");

  const byEvent = new Map<string, ListedEvent>();
  for (const t of targets ?? []) {
    const ev = t.event;
    const childNames = myEnrollments
      .filter((e) => e.class_id === t.class_id && e.fiscal_year === ev.fiscal_year)
      .map((e) => links.find((l) => l.child_id === e.child_id && l.fiscal_year === e.fiscal_year)?.child.full_name)
      .filter((n): n is string => Boolean(n));
    if (childNames.length === 0) continue;
    const existing = byEvent.get(ev.id);
    if (existing) {
      existing.childNames = [...new Set([...existing.childNames, ...childNames])];
      continue;
    }
    byEvent.set(ev.id, {
      id: ev.id,
      name: ev.name,
      schoolName: ev.school.name,
      heldOn: ev.held_on,
      saleStartsAt: ev.sale_starts_at,
      deadlineAt: ev.deadline_at,
      lateUntil: ev.late_enabled ? ev.late_until : null,
      deliveryMethod: ev.delivery_method as "school" | "mail" | "either",
      window: orderWindow(ev, now),
      childNames,
    });
  }
  const order: Record<OrderWindow, number> = { open: 0, late: 1, before_sale: 2, closed: 3 };
  const events = [...byEvent.values()].sort(
    (a, b) => order[a.window] - order[b.window] || a.deadlineAt.localeCompare(b.deadlineAt),
  );
  return { hasChildren: true, events };
}

export type ListedEvent = {
  id: string;
  name: string;
  schoolName: string;
  heldOn: string | null;
  saleStartsAt: string;
  deadlineAt: string;
  lateUntil: string | null;
  deliveryMethod: "school" | "mail" | "either";
  window: OrderWindow;
  childNames: string[];
};
