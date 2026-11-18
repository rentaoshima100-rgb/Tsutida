import "server-only";
import { randomBytes } from "node:crypto";
import { isDemo } from "@/lib/demo";
import { ensureMemberRow } from "@/lib/server/auth";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

// デモ用のログイン。isDemo() のときだけ呼ぶ（呼ぶ側でも、ここでも確かめる）

const DEMO_MEMBER_EMAIL = "demo-member@example.com";
const DEMO_ADMIN_EMAIL = "demo-admin@example.com";

function assertDemo() {
  if (!isDemo()) throw new Error("デモ用のログインは、デモ環境でしか使えません");
}

function randomPassword() {
  return randomBytes(24).toString("base64url");
}

/**
 * すでにあるアカウントとして、パスワードなしでログインする（メールは送らない）。
 * アカウントが無いメールアドレスでは呼ばない（Supabase が中身のないアカウントを作ってしまう）
 */
async function signInAs(email: string): Promise<string | null> {
  assertDemo();
  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return null;
  const supabase = await createUserClient();
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verifyError || !verified.user) return null;
  return verified.user.id;
}

/** 会員登録（デモ）：メールを送らずに、確認済みのアカウントを作る。登録済みなら何もしない */
export async function demoCreateMember(input: {
  email: string;
  password: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  assertDemo();
  await createAdminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.metadata,
  });
}

/**
 * 会員としてログインする（デモ）。入力されたメールアドレスの会員がいればその会員、
 * いなければ共用の「デモ会員」になる
 */
export async function demoMemberSignIn(typedEmail: string): Promise<boolean> {
  assertDemo();
  const admin = createAdminClient();
  const email = typedEmail.trim().toLowerCase();
  if (email) {
    const { data: member } = await admin.from("members").select("id, withdrawn_at").eq("email", email).maybeSingle();
    if (member && !member.withdrawn_at) return (await signInAs(email)) !== null;
    // 登録だけ済んでいて、会員の行がまだない人（確認番号の入力の直前）
    const { data: staff } = await admin.from("staff").select("user_id").eq("email", email).maybeSingle();
    if (!staff && (await pendingSignupExists(email))) {
      const userId = await signInAs(email);
      if (userId && (await ensureMemberRow(userId))) return true;
    }
  }
  await admin.auth.admin.createUser({
    email: DEMO_MEMBER_EMAIL,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: {
      signup_kind: "member",
      full_name: "デモ 花子",
      full_name_kana: "でも はなこ",
      phone: "090-0000-0000",
      marketing_opt_in: false,
    },
  });
  const userId = await signInAs(DEMO_MEMBER_EMAIL);
  if (!userId) return false;
  return (await ensureMemberRow(userId)) !== null;
}

/** 会員登録の情報を持ったアカウントがあるか（メールアドレスで探す） */
async function pendingSignupExists(email: string): Promise<boolean> {
  const admin = createAdminClient();
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return false;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return (hit.user_metadata as { signup_kind?: string } | null)?.signup_kind === "member";
    if (data.users.length < 200) return false;
  }
  return false;
}

/** 管理者としてログインする（デモ）。共用の「デモ管理者」になる。2段階認証は通ったものとして扱う */
export async function demoAdminSignIn(): Promise<boolean> {
  assertDemo();
  const admin = createAdminClient();
  await admin.auth.admin.createUser({ email: DEMO_ADMIN_EMAIL, password: randomPassword(), email_confirm: true });
  const userId = await signInAs(DEMO_ADMIN_EMAIL);
  if (!userId) return false;
  const { error } = await admin
    .from("staff")
    .upsert({ user_id: userId, name: "デモ管理者", email: DEMO_ADMIN_EMAIL, role: "admin", active: true }, { onConflict: "user_id" });
  return !error;
}
