// 管理者・保守のアカウントを作る（最初の1人を作るとき・管理画面に入れないとき用）
// 使い方：
//   node --env-file=.env.local scripts/create-staff.mts --email admin@example.com --name "土田" --role admin [--password ...]
// パスワードを渡さなければ、本人が /admin/login の「パスワードを設定する」（確認番号）から決める。
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", default: "admin" },
    password: { type: "string" },
  },
});
if (!values.email || !values.name || !["admin", "maintainer"].includes(values.role!)) {
  console.error("--email と --name が必要です。--role は admin か maintainer です");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SECRET_KEY!;
const admin = createClient(url, key, { auth: { persistSession: false } });

const email = values.email.toLowerCase();
let userId: string | undefined;
const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password: values.password,
  email_confirm: true,
  user_metadata: { signup_kind: "staff" },
});
if (error) {
  if (!/already/i.test(error.message)) throw error;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  userId = list.users.find((u) => u.email === email)?.id;
} else {
  userId = created.user.id;
}
if (!userId) throw new Error("ユーザーが見つかりません");
const { error: staffError } = await admin
  .from("staff")
  .upsert({ user_id: userId, name: values.name, email, role: values.role!, active: true });
if (staffError) throw staffError;
console.log(`作成しました：${email}（${values.role}）`);
if (!values.password) console.log("パスワードは /admin/login の「パスワードを設定する」から決めてください。");
