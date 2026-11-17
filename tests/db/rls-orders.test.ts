import { afterAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asAnon, asMember, asService, createMember, IDS, inTx, pool, registerCode } from "./helpers";

afterAll(() => pool.end());

async function setupFamily(c: PoolClient) {
  const a = await createMember(c, "母");
  const b = await createMember(c, "他の家庭");
  await asService(c);
  const reg = await registerCode(c, { memberId: a.id, code: "TEST0M000001", fullName: "山田 花子", kana: "やまだ はなこ" });
  const regB = await registerCode(c, { memberId: b.id, code: "TEST0H000001", fullName: "田中 一", kana: "たなか はじめ" });
  await c.query("reset role");
  return { a, b, childA: reg.child_id!, childB: regB.child_id! };
}

async function createOrder(
  c: PoolClient,
  memberId: string,
  childId: string,
  opts: { method?: string; status?: string; items?: { product: string; qty: number; amount: number }[] } = {},
) {
  const items = opts.items ?? [{ product: IDS.undokaiDvd, qty: 1, amount: 3000 }];
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const r = await c.query("select * from public.create_order($1, $2)", [
    {
      event_id: IDS.undokai,
      member_id: memberId,
      channel: "web",
      delivery_method: "school",
      payment_method: opts.method ?? "card",
      payment_status: opts.status ?? "draft",
      subtotal,
      shipping_fee: 0,
      total: subtotal,
    },
    JSON.stringify(
      items.map((i) => ({
        product_id: i.product,
        child_id: childId,
        class_id: IDS.momo2026,
        grade_label_snapshot: "年少",
        class_name_snapshot: "もも組",
        quantity: i.qty,
        amount: i.amount,
      })),
    ),
  ]);
  return r.rows[0] as { order_id: string; order_no: string };
}

describe("RLS：会員が見られる行（3章）", () => {
  it("つながっているお子さまが対象の行事だけが見える", () =>
    inTx(async (c) => {
      const { a } = await setupFamily(c);
      await asMember(c, a.id);
      const events = await c.query("select id from events order by name");
      expect(events.rows.map((r) => r.id).sort()).toEqual([IDS.natsumatsuri, IDS.undokai].sort());
      // 下書き（発表会）と、他の学校の行事は見えない
      const products = await c.query("select event_id from products");
      expect(new Set(products.rows.map((r) => r.event_id))).toEqual(new Set([IDS.undokai, IDS.natsumatsuri]));
    }));

  it("会員・お子さま・学校・クラスは自分に関係する行だけ", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asMember(c, a.id);
      expect((await c.query("select id from members")).rows).toEqual([{ id: a.id }]);
      expect((await c.query("select id from children")).rows).toEqual([{ id: childA }]);
      expect((await c.query("select id from classes")).rows).toEqual([{ id: IDS.momo2026 }]);
      expect((await c.query("select id from schools")).rows).toEqual([{ id: IDS.sakura }]);
    }));

  it("注文は自分のものだけ。家族の注文と draft は見えない", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      const spouse = await createMember(c, "父");
      await asService(c);
      await registerCode(c, { memberId: spouse.id, code: "TEST0M000001", kana: "やまだはなこ" });
      const mine = await createOrder(c, a.id, childA);
      await c.query("select public.mark_order_paid($1, array['draft'])", [mine.order_id]);
      const draft = await createOrder(c, a.id, childA, { items: [{ product: IDS.undokaiBd, qty: 1, amount: 3500 }] });
      const spouses = await createOrder(c, spouse.id, childA);
      await c.query("select public.mark_order_paid($1, array['draft'])", [spouses.order_id]);

      await asMember(c, a.id);
      const orders = await c.query("select id from orders");
      expect(orders.rows.map((r) => r.id)).toEqual([mine.order_id]);
      const items = await c.query("select order_id from order_items");
      expect(items.rows.every((r) => r.order_id === mine.order_id)).toBe(true);
      expect(draft.order_id).toBeTruthy();
    }));

  it("会員は書き込めず、管理用のテーブルは読めない", () =>
    inTx(async (c) => {
      const { a } = await setupFamily(c);
      await asMember(c, a.id);
      for (const sql of [
        "update members set full_name = 'x'",
        "insert into children (full_name, full_name_kana) values ('x', 'x')",
        "select * from staff",
        "select * from settings",
        "select * from email_messages",
        "select * from audit_logs",
        "select public.mark_order_paid(gen_random_uuid(), array['draft'])",
        "select public.register_code(gen_random_uuid(), 'TEST0M000002', 'x', 'x', null, null, 3)",
      ]) {
        await c.query("savepoint s");
        await expect(c.query(sql), sql).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
    }));

  it("anon はどのテーブルも読めない", () =>
    inTx(async (c) => {
      await asAnon(c);
      for (const t of ["events", "products", "settings", "members", "schools"]) {
        await c.query("savepoint s");
        await expect(c.query(`select * from ${t}`), t).rejects.toThrow(/permission denied/);
        await c.query("rollback to savepoint s");
      }
    }));
});

describe("注文と状態の遷移（8章・9.5）", () => {
  it("支払い済みにすると明細が受付済みになる。2回目は何もしない", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asService(c);
      const o = await createOrder(c, a.id, childA);
      const first = await c.query("select public.mark_order_paid($1, array['draft']) ok", [o.order_id]);
      const second = await c.query("select public.mark_order_paid($1, array['draft']) ok", [o.order_id]);
      expect([first.rows[0].ok, second.rows[0].ok]).toEqual([true, false]);
      const row = await c.query("select payment_status, paid_amount from orders where id = $1", [o.order_id]);
      expect(row.rows[0]).toEqual({ payment_status: "paid", paid_amount: 3000 });
      const items = await c.query("select fulfillment_status from order_items where order_id = $1", [o.order_id]);
      expect(items.rows).toEqual([{ fulfillment_status: "accepted" }]);
      expect(o.order_no).toMatch(/^T\d{7}$/);
    }));

  it("許されない遷移と、支払い後の削除はエラー", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asService(c);
      const o = await createOrder(c, a.id, childA);
      await c.query("select public.mark_order_paid($1, array['draft'])", [o.order_id]);
      await c.query("savepoint s");
      await expect(c.query("update orders set payment_status = 'pending' where id = $1", [o.order_id])).rejects.toThrow(
        /not allowed/,
      );
      await c.query("rollback to savepoint s");
      await expect(c.query("delete from orders where id = $1", [o.order_id])).rejects.toThrow(/only draft/);
    }));

  it("明細の取り消しと差額の返金：残りの明細の金額と合計を計算し直す", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asService(c);
      const o = await createOrder(c, a.id, childA, {
        items: [
          { product: IDS.undokaiDvd, qty: 1, amount: 3000 },
          { product: IDS.undokaiBd, qty: 1, amount: 3500 },
        ],
      });
      await c.query("select public.mark_order_paid($1, array['draft'])", [o.order_id]);
      const items = await c.query("select id, line_no from order_items where order_id = $1 order by line_no", [o.order_id]);
      const r = await c.query(
        "select public.apply_paid_cancellation($1, $2, $3, $4, $5, $6, $7, $8, $9) refund_id",
        [o.order_id, [items.rows[0].id], JSON.stringify([{ id: items.rows[1].id, amount: 3500 }]), 3500, 0, 6500, "会員の取り消し", "stripe", a.id],
      );
      const refund = await c.query("select amount, status, item_ids from refunds where id = $1", [r.rows[0].refund_id]);
      expect(refund.rows[0]).toEqual({ amount: 3000, status: "pending", item_ids: [items.rows[0].id] });
      const order = await c.query("select payment_status, subtotal, total, paid_amount from orders where id = $1", [o.order_id]);
      expect(order.rows[0]).toEqual({ payment_status: "partially_refunded", subtotal: 3500, total: 3500, paid_amount: 6500 });
      const canceled = await c.query("select amount, canceled_amount, fulfillment_status from order_items where id = $1", [
        items.rows[0].id,
      ]);
      expect(canceled.rows[0]).toEqual({ amount: 0, canceled_amount: 3000, fulfillment_status: "canceled" });

      // 計算した時点から合計が変わっていたら止める
      await c.query("savepoint s");
      await expect(
        c.query("select public.apply_paid_cancellation($1, $2, '[]', 0, 0, 6500, 'x', 'stripe', null)", [
          o.order_id,
          [items.rows[1].id],
        ]),
      ).rejects.toThrow(/changed/);
      await c.query("rollback to savepoint s");

      // 残りを全部取り消すと返金済み
      await c.query("select public.apply_paid_cancellation($1, $2, '[]', 0, 0, 3500, 'x', 'manual', null)", [
        o.order_id,
        [items.rows[1].id],
      ]);
      const done = await c.query("select payment_status, total from orders where id = $1", [o.order_id]);
      expect(done.rows[0]).toEqual({ payment_status: "refunded", total: 0 });
    }));

  it("支払い待ちの銀行振込は1会員1件まで", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asService(c);
      await createOrder(c, a.id, childA, { method: "bank_transfer", status: "pending" });
      await expect(createOrder(c, a.id, childA, { method: "bank_transfer" })).rejects.toThrow(/pending_bank_transfer_exists/);
    }));

  it("支払い待ちの取り消しは明細もまとめて取り消す", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      await asService(c);
      const o = await createOrder(c, a.id, childA, { method: "konbini" });
      await c.query("select public.mark_order_pending($1, 'pi_test', '{}'::jsonb)", [o.order_id]);
      const ok = await c.query("select public.cancel_unpaid_order($1, '支払期限切れ') ok", [o.order_id]);
      expect(ok.rows[0].ok).toBe(true);
      const items = await c.query("select canceled_at is not null c from order_items where order_id = $1", [o.order_id]);
      expect(items.rows).toEqual([{ c: true }]);
    }));
});

describe("お知らせの宛先（9.7 event_audience）", () => {
  it("お子さま単位で判定し、家族のだれかが注文済みなら送らない", () =>
    inTx(async (c) => {
      const { a, childA } = await setupFamily(c);
      const spouse = await createMember(c, "父");
      const noConsent = await createMember(c, "同意なし", { optIn: false });
      await asService(c);
      await registerCode(c, { memberId: spouse.id, code: "TEST0M000001", kana: "やまだはなこ" });
      await registerCode(c, { memberId: noConsent.id, code: "TEST0M000002", fullName: "同意 なし子", kana: "どうい なしこ" });

      const before = await c.query("select member_id from event_audience($1, true)", [IDS.undokai]);
      expect(before.rows.map((r) => r.member_id).sort()).toEqual([a.id, spouse.id].sort());

      const o = await createOrder(c, spouse.id, childA);
      await c.query("select public.mark_order_paid($1, array['draft'])", [o.order_id]);
      const after = await c.query("select member_id from event_audience($1, true)", [IDS.undokai]);
      expect(after.rows).toEqual([]);
      // 販売開始のお知らせ（未注文に限らない）は、同意した会員全員
      const all = await c.query("select member_id from event_audience($1, false)", [IDS.undokai]);
      expect(all.rows.map((r) => r.member_id).sort()).toEqual([a.id, spouse.id].sort());
    }));
});

describe("本数の確定（fix_production_counts）", () => {
  it("締切日の2日後の23:59を過ぎた行事に記録する", () =>
    inTx(async (c) => {
      await asService(c);
      // 夏まつり：締切は5日前 → 確定する。締切後の受付期限は7日後 → まだ
      const r = await c.query("select event_id, kind from public.fix_production_counts()");
      expect(r.rows).toEqual([{ event_id: IDS.natsumatsuri, kind: "normal" }]);
      const again = await c.query("select event_id from public.fix_production_counts()");
      expect(again.rows).toEqual([]);
    }));
});
