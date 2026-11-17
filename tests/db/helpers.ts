// DB のテストの道具。ローカルの Supabase（npx supabase start）の DB に直接つなぐ。
// テストはそれぞれ1つのトランザクションの中で行い、最後に ROLLBACK して元に戻す。

import { Pool, type PoolClient } from "pg";
import { randomUUID } from "node:crypto";

export const pool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});

/**
 * このトランザクションの中だけ、開発用データ（seed.sql）の状態に戻す。
 * 画面のテスト（E2E）や手で試した会員・注文が同じローカルの DB に残っていても、DB のテストが同じ結果になるようにする。
 * 追記のみ・削除禁止のトリガーは、ここでだけ止める（ROLLBACK するので、実際の行は消えない）
 */
const PRISTINE = `
  set local session_replication_role = replica;
  delete from public.refunds;
  delete from public.shipments;
  delete from public.email_messages;
  delete from public.order_items;
  delete from public.orders;
  delete from public.code_attempts;
  delete from public.member_children;
  delete from public.child_enrollments;
  delete from public.registration_codes where code !~ '^(TEST|REVW)';
  update public.registration_codes set status = 'unused', child_id = null, revoked_at = null, replaced_by = null;
  delete from public.children;
  delete from public.marketing_consents;
  delete from public.members;
  delete from public.event_deadline_changes;
  update public.events set production_fixed_at = null, late_production_fixed_at = null, sale_start_notified_at = null;
  set local session_replication_role = origin;
`;

/** トランザクションの中で fn を実行し、必ず ROLLBACK する */
export async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(PRISTINE);
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

/** 以降の文を、その会員（authenticated）として実行する */
export async function asMember(c: PoolClient, memberId: string) {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: memberId, role: "authenticated" }),
  ]);
  await c.query("set local role authenticated");
}

/** 以降の文を、サーバー（service_role）として実行する */
export async function asService(c: PoolClient) {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', '', true)");
  await c.query("set local role service_role");
}

export async function asAnon(c: PoolClient) {
  await c.query("reset role");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  await c.query("set local role anon");
}

/** auth.users と members に会員を作る（postgres のまま呼ぶ） */
export async function createMember(c: PoolClient, name = "テスト 会員", opts: { optIn?: boolean } = {}) {
  const id = randomUUID();
  const email = `${id.slice(0, 8)}@example.com`;
  await c.query("insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')", [
    id,
    email,
  ]);
  await c.query(
    "insert into public.members (id, email, full_name, full_name_kana, marketing_opt_in) values ($1, $2, $3, 'てすと かいいん', $4)",
    [id, email, name, opts.optIn ?? true],
  );
  return { id, email };
}

export const IDS = {
  sakura: "00000000-0000-4000-8000-000000000001",
  hikari: "00000000-0000-4000-8000-000000000002",
  momo2026: "00000000-0000-4000-8000-000000000101",
  risu2026: "00000000-0000-4000-8000-000000000102",
  kirin2026: "00000000-0000-4000-8000-000000000103",
  kirin2025: "00000000-0000-4000-8000-000000000105",
  hikari1kumi: "00000000-0000-4000-8000-000000000201",
  undokai: "00000000-0000-4000-8000-000000001001",
  happyokai: "00000000-0000-4000-8000-000000001002",
  natsumatsuri: "00000000-0000-4000-8000-000000001003",
  gakushu: "00000000-0000-4000-8000-000000001004",
  undokaiDvd: "00000000-0000-4000-8000-000000002001",
  undokaiBd: "00000000-0000-4000-8000-000000002002",
};

export type RegisterArgs = {
  memberId: string;
  code: string;
  fullName?: string | null;
  kana: string;
  targetChildId?: string | null;
  ipHash?: string | null;
  maxAccounts?: number;
};

export async function registerCode(c: PoolClient, a: RegisterArgs) {
  const r = await c.query(
    "select public.register_code($1, $2, $3, $4, $5, $6, $7) as r",
    [a.memberId, a.code, a.fullName ?? null, a.kana, a.targetChildId ?? null, a.ipHash ?? null, a.maxAccounts ?? 3],
  );
  return r.rows[0].r as {
    result: string;
    child_id?: string;
    fiscal_year?: number;
    notify_member_ids?: string[];
    created_child?: boolean;
  };
}
