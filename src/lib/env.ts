import "server-only";
import { z } from "zod";

// 環境変数（15章）。サーバーでだけ読む。足りないときは起動時ではなく、使う時点でわかりやすく落とす。

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  CRON_SECRET: z.string().min(16),
  UNSUBSCRIBE_SIGNING_SECRET: z.string().min(16),
  // 登録コードの入力の記録に残す IP のハッシュの鍵（14章：IP はハッシュで持つ）
  IP_HASH_SECRET: z.string().min(16),

  // 決済。PAYMENT_GATEWAY=fake は開発・自動テスト用の擬似決済（本番では使えない）
  PAYMENT_GATEWAY: z.enum(["stripe", "fake"]).default("stripe"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // メール。ses：本番・テスト環境、smtp：開発（ローカルの Mailpit）、log：送らずに記録だけ
  MAIL_TRANSPORT: z.enum(["ses", "smtp", "log"]).default("ses"),
  AWS_REGION: z.string().default("ap-northeast-1"),
  SES_CONFIGURATION_SET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  // テスト環境では、このドメインのアドレスにだけ送る（2章：開発者のアドレスだけに送る）
  MAIL_ALLOWED_DOMAINS: z.string().optional(),

  // SES からの配信結果の通知（SNS）。トピックの ARN を決めておき、ほかのトピックからの通知を受けない
  SES_SNS_TOPIC_ARN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`環境変数が足りないか、形式が正しくありません: ${names}`);
  }
  if (parsed.data.PAYMENT_GATEWAY === "fake" && process.env.VERCEL_ENV === "production") {
    throw new Error("PAYMENT_GATEWAY=fake は本番では使えません");
  }
  cached = parsed.data;
  return cached;
}

export function appUrl(path = "/"): string {
  return new URL(path, env().APP_BASE_URL).toString();
}
