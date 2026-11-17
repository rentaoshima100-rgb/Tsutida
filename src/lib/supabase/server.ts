import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * ログイン中の利用者として DB を読むクライアント（publishable key ＋ セッション）。
 * RLS がかかるので、会員の画面の読み取りはこれを使う（3章）
 */
export async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Server Component から呼ばれたときは書けない。セッションの更新は proxy が行う
          }
        },
      },
    },
  );
}

/**
 * サーバーの処理用のクライアント（secret key。RLS を通らない）。
 * 書き込みと、権限を確かめたあとの読み取りに使う。ブラウザには絶対に渡さない
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
export type UserClient = Awaited<ReturnType<typeof createUserClient>>;
