/**
 * デモ用のログイン（DEMO_MODE=1）。メールアドレス・パスワード・確認番号は何を入れても通す。
 * 先方に画面を見てもらうためのもので、本番（VERCEL_ENV=production）では絶対に有効にならない。
 * proxy からも読むので、server-only にはしない（環境変数を読むだけ）
 */
/**
 * デモのログインで、メールアドレスの欄に入れた文字からどちらの画面に入るかを決める。
 * 「A」は管理画面、「B」は会員（保護者）の画面。それ以外は null（その画面の側に入る）
 */
export function demoSide(typed: string): "admin" | "member" | null {
  const v = typed.normalize("NFKC").trim().toLowerCase();
  if (v === "a") return "admin";
  if (v === "b") return "member";
  return null;
}

export function isDemo(): boolean {
  return process.env.DEMO_MODE === "1" && process.env.VERCEL_ENV !== "production";
}
