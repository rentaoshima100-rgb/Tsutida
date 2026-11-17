import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { jstParts } from "@/lib/domain/time";

// A15 売上：その年度の行事の、支払われた注文（paid・partially_refunded・refunded）を集計する。
// 売上は返金後の額（orders.total。明細の取り消しのあとは計算し直した値）、返金は paid_amount − total

const PAID = ["paid", "partially_refunded", "refunded"];

export type SalesOrder = {
  id: string;
  order_no: string;
  created_at: string;
  paid_at: string | null;
  channel: string;
  payment_method: string;
  payment_status: string;
  total: number;
  paid_amount: number | null;
  shipping_fee: number;
  event_id: string;
  items: { child_id: string; product_name_snapshot: string; quantity: number; amount: number; canceled_amount: number | null; canceled_at: string | null }[];
};

export type SalesEvent = { id: string; name: string; school_id: string; school_name: string; capacity: number };

export type SalesSummary = {
  label: string;
  sub?: string;
  orders: number;
  web: number;
  proxy: number;
  units: number;
  revenue: number;
  refunds: number;
  orderedChildren?: number;
  capacity?: number;
};

export async function salesDataset(fiscalYear: number): Promise<{ events: SalesEvent[]; orders: SalesOrder[] }> {
  const admin = createAdminClient();
  const { data: evs, error } = await admin
    .from("events")
    .select("id, name, school_id, school:schools!inner(name), targets:event_targets(class:classes!inner(capacity))")
    .eq("fiscal_year", fiscalYear)
    .neq("status", "draft")
    .order("deadline_at");
  if (error) throw error;
  const events: SalesEvent[] = (evs ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    school_id: e.school_id,
    school_name: e.school.name,
    capacity: e.targets.reduce((s, t) => s + t.class.capacity, 0),
  }));
  const orders: SalesOrder[] = [];
  if (events.length > 0) {
    for (let from = 0; ; from += 1000) {
      const { data, error: e2 } = await admin
        .from("orders")
        .select(
          "id, order_no, created_at, paid_at, channel, payment_method, payment_status, total, paid_amount, shipping_fee, event_id, items:order_items(child_id, product_name_snapshot, quantity, amount, canceled_amount, canceled_at)",
        )
        .in("event_id", events.map((e) => e.id))
        .in("payment_status", PAID)
        .order("paid_at")
        .range(from, from + 999);
      if (e2) throw e2;
      orders.push(...((data ?? []) as SalesOrder[]));
      if (!data || data.length < 1000) break;
    }
  }
  return { events, orders };
}

function summarize(label: string, orders: SalesOrder[], sub?: string): SalesSummary {
  const active = orders.flatMap((o) => o.items.filter((i) => !i.canceled_at));
  return {
    label,
    sub,
    orders: orders.length,
    web: orders.filter((o) => o.channel === "web").length,
    proxy: orders.filter((o) => o.channel === "proxy").length,
    units: active.reduce((s, i) => s + i.quantity, 0),
    revenue: orders.reduce((s, o) => s + o.total, 0),
    refunds: orders.reduce((s, o) => s + Math.max(0, (o.paid_amount ?? o.total) - o.total), 0),
  };
}

export function byEvent(events: SalesEvent[], orders: SalesOrder[]): SalesSummary[] {
  return events.map((e) => {
    const os = orders.filter((o) => o.event_id === e.id);
    const children = new Set(os.flatMap((o) => o.items.filter((i) => !i.canceled_at).map((i) => i.child_id)));
    return { ...summarize(e.name, os, e.school_name), orderedChildren: children.size, capacity: e.capacity };
  });
}

export function bySchool(events: SalesEvent[], orders: SalesOrder[]): SalesSummary[] {
  const schools = new Map<string, string>();
  for (const e of events) schools.set(e.school_id, e.school_name);
  return [...schools.entries()]
    .map(([id, name]) => {
      const ids = new Set(events.filter((e) => e.school_id === id).map((e) => e.id));
      return summarize(name, orders.filter((o) => ids.has(o.event_id)), `行事 ${ids.size} 件`);
    })
    .sort((a, b) => b.revenue - a.revenue);
}

/** 月別（支払い日の月。日本時間） */
export function byMonth(orders: SalesOrder[]): SalesSummary[] {
  const months = new Map<string, SalesOrder[]>();
  for (const o of orders) {
    const p = jstParts(o.paid_at ?? o.created_at);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
    months.set(key, [...(months.get(key) ?? []), o]);
  }
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, os]) => summarize(`${Number(k.slice(0, 4))}年${Number(k.slice(5))}月`, os));
}

export function totalOf(rows: SalesSummary[]): SalesSummary {
  return rows.reduce<SalesSummary>(
    (t, r) => ({ ...t, orders: t.orders + r.orders, web: t.web + r.web, proxy: t.proxy + r.proxy, units: t.units + r.units, revenue: t.revenue + r.revenue, refunds: t.refunds + r.refunds }),
    { label: "合計", orders: 0, web: 0, proxy: 0, units: 0, revenue: 0, refunds: 0 },
  );
}

export function monthKey(value: string): string {
  const p = jstParts(value);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}
