import { afterAll, describe, expect, it } from "vitest";
import { asService, createMember, IDS, inTx, pool, registerCode } from "./helpers";
import { nameKey } from "@/lib/domain/kana";

afterAll(() => pool.end());

describe("登録コードの入力（register_code）", () => {
  it("未使用のコード：お子さま・在籍・つながりを作り、コードを使用中にする", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      await asService(c);
      const r = await registerCode(c, { memberId: a.id, code: "TEST0M000001", fullName: "山田 花子", kana: "やまだ はなこ" });
      expect(r.result).toBe("linked");
      expect(r.created_child).toBe(true);
      expect(r.fiscal_year).toBe(2026);
      expect(r.notify_member_ids).toEqual([]);

      const code = await c.query("select status, child_id from registration_codes where code = 'TEST0M000001'");
      expect(code.rows[0]).toEqual({ status: "active", child_id: r.child_id });
      const enr = await c.query("select class_id from child_enrollments where child_id = $1 and fiscal_year = 2026", [
        r.child_id,
      ]);
      expect(enr.rows[0].class_id).toBe(IDS.momo2026);
      const child = await c.query("select name_key from children where id = $1", [r.child_id]);
      expect(child.rows[0].name_key).toBe("やまだはなこ");
    }));

  it("1人目なのに名前がなければ needs_name（失敗には数えない）", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      await asService(c);
      expect((await registerCode(c, { memberId: a.id, code: "TEST0M000001", kana: "やまだ はなこ" })).result).toBe(
        "needs_name",
      );
      const n = await c.query("select count(*)::int n from code_attempts where member_id = $1", [a.id]);
      expect(n.rows[0].n).toBe(0);
    }));

  it("使用中のコード：ふりがなが一致すれば家族がつながり、先の会員に知らせる", () =>
    inTx(async (c) => {
      const a = await createMember(c, "母");
      const b = await createMember(c, "父");
      await asService(c);
      const first = await registerCode(c, { memberId: a.id, code: "TEST0M000001", fullName: "山田 花子", kana: "やまだ はなこ" });
      // カタカナ・全角空白でも一致する
      const second = await registerCode(c, { memberId: b.id, code: "TEST-0M00-0001".replace(/-/g, ""), kana: "ヤマダ　ハナコ" });
      expect(second.result).toBe("linked");
      expect(second.child_id).toBe(first.child_id);
      expect(second.notify_member_ids).toEqual([a.id]);
      // もう一度入れても二重にはならない
      expect((await registerCode(c, { memberId: b.id, code: "TEST0M000001", kana: "やまだはなこ" })).result).toBe(
        "already_linked",
      );
    }));

  it("ふりがなが一致しなければ失敗として数え、5回で受け付けなくなる", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      const b = await createMember(c);
      await asService(c);
      await registerCode(c, { memberId: a.id, code: "TEST0M000001", fullName: "山田 花子", kana: "やまだ はなこ" });
      for (let i = 0; i < 4; i++) {
        expect((await registerCode(c, { memberId: b.id, code: "TEST0M000001", kana: "やまだ たろう" })).result).toBe(
          "name_mismatch",
        );
      }
      expect((await registerCode(c, { memberId: b.id, code: "ZZZZZZZZZZZZ", kana: "やまだ たろう" })).result).toBe(
        "invalid",
      );
      // 5回失敗したので、正しい入力でも受け付けない
      expect((await registerCode(c, { memberId: b.id, code: "TEST0M000001", kana: "やまだ はなこ" })).result).toBe(
        "locked",
      );
    }));

  it("同じIPからの失敗も数える", () =>
    inTx(async (c) => {
      await asService(c);
      for (let i = 0; i < 5; i++) {
        await c.query("reset role");
        const m = await createMember(c);
        await asService(c);
        await registerCode(c, { memberId: m.id, code: "ZZZZZZZZZZZZ", kana: "あ", ipHash: "ip-1" });
      }
      await c.query("reset role");
      const m = await createMember(c);
      await asService(c);
      expect(
        (await registerCode(c, { memberId: m.id, code: "TEST0M000002", fullName: "a", kana: "あ", ipHash: "ip-1" })).result,
      ).toBe("locked");
    }));

  it("つなげるアカウントの上限", () =>
    inTx(async (c) => {
      const ms = [await createMember(c), await createMember(c), await createMember(c)];
      await asService(c);
      expect(
        (await registerCode(c, { memberId: ms[0].id, code: "TEST0M000001", fullName: "子", kana: "こ", maxAccounts: 2 }))
          .result,
      ).toBe("linked");
      expect((await registerCode(c, { memberId: ms[1].id, code: "TEST0M000001", kana: "こ", maxAccounts: 2 })).result).toBe(
        "linked",
      );
      expect((await registerCode(c, { memberId: ms[2].id, code: "TEST0M000001", kana: "こ", maxAccounts: 2 })).result).toBe(
        "limit_reached",
      );
    }));

  it("無効にしたコードは使えない。すでにつながった会員はそのまま", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      const b = await createMember(c);
      await asService(c);
      await registerCode(c, { memberId: a.id, code: "TEST0M000001", fullName: "子", kana: "こ" });
      await c.query("update registration_codes set status = 'revoked', revoked_at = now() where code = 'TEST0M000001'");
      expect((await registerCode(c, { memberId: b.id, code: "TEST0M000001", kana: "こ" })).result).toBe("revoked");
      const links = await c.query("select count(*)::int n from member_children where member_id = $1 and revoked_at is null", [
        a.id,
      ]);
      expect(links.rows[0].n).toBe(1);
    }));

  it("前年度に同じ学校・園・同じふりがなのお子さまが1人だけいれば、そのお子さまにつなぐ（9.9）", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      const child = await c.query(
        "insert into children (full_name, full_name_kana) values ('佐藤 一郎', 'さとう いちろう') returning id",
      );
      await c.query("insert into child_enrollments (child_id, fiscal_year, class_id) values ($1, 2025, $2)", [
        child.rows[0].id,
        IDS.kirin2025,
      ]);
      await asService(c);
      const r = await registerCode(c, { memberId: a.id, code: "TEST0K000001", fullName: "佐藤 一郎", kana: "サトウ イチロウ" });
      expect(r.result).toBe("linked");
      expect(r.created_child).toBe(false);
      expect(r.child_id).toBe(child.rows[0].id);
    }));

  it("代理注文で作った同じクラスのお子さまに、コードを付ける（6.4）", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      const child = await c.query(
        "insert into children (full_name, full_name_kana) values ('鈴木 二郎', 'すずき じろう') returning id",
      );
      await c.query("insert into child_enrollments (child_id, fiscal_year, class_id) values ($1, 2026, $2)", [
        child.rows[0].id,
        IDS.momo2026,
      ]);
      await asService(c);
      const r = await registerCode(c, { memberId: a.id, code: "TEST0M000003", fullName: "鈴木 二郎", kana: "すずき じろう" });
      expect(r.result).toBe("linked");
      expect(r.child_id).toBe(child.rows[0].id);
      const enr = await c.query("select count(*)::int n, max(registration_code_id::text) code from child_enrollments where child_id = $1", [
        child.rows[0].id,
      ]);
      expect(enr.rows[0].n).toBe(1);
      expect(enr.rows[0].code).not.toBeNull();
    }));

  it("新年度のコード：どのお子さまのコードかを選んでつなぐ", () =>
    inTx(async (c) => {
      const a = await createMember(c);
      const child = await c.query(
        "insert into children (full_name, full_name_kana) values ('高橋 三郎', 'たかはし さぶろう') returning id",
      );
      await c.query("insert into child_enrollments (child_id, fiscal_year, class_id) values ($1, 2025, $2)", [
        child.rows[0].id,
        IDS.kirin2025,
      ]);
      await c.query("insert into member_children (member_id, child_id, fiscal_year) values ($1, $2, 2025)", [
        a.id,
        child.rows[0].id,
      ]);
      await asService(c);
      const r = await registerCode(c, {
        memberId: a.id,
        code: "TEST0Z000001",
        kana: "",
        targetChildId: child.rows[0].id,
      });
      expect(r.result).toBe("linked");
      expect(r.child_id).toBe(child.rows[0].id);
      // つながっていないお子さまは選べない
      const b = await (async () => {
        await c.query("reset role");
        const m = await createMember(c);
        await asService(c);
        return m;
      })();
      expect(
        (await registerCode(c, { memberId: b.id, code: "TEST0K000002", kana: "", targetChildId: child.rows[0].id })).result,
      ).toBe("child_not_linked");
    }));

  it("SQL の kana_name_key と TypeScript の nameKey は同じ結果", () =>
    inTx(async (c) => {
      const samples = ["ヤマダ　タロウ", "ﾔﾏﾀﾞ ﾀﾛｳ", " やまだ たろう ", "ヴィヴィ", "ヽヾ", "ｶﾞｷﾞｸﾞ", "コウ　タ ロ ウ", "はーと"];
      for (const s of samples) {
        const r = await c.query("select public.kana_name_key($1) k", [s]);
        expect(r.rows[0].k, s).toBe(nameKey(s));
      }
    }));
});
