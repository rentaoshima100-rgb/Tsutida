import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

export type MemberRow = Database["public"]["Tables"]["members"]["Row"];
export type StaffRow = Database["public"]["Tables"]["staff"]["Row"];

/** 確かめた JWT の中身（ログインしていなければ null） */
export const getClaims = cache(async () => {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});

/** next に入れてよいのは自サイトの相対パスだけ（4章：外部への転送を防ぐ） */
export function safeNextPath(next: string | null | undefined, fallback = "/events"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * 会員としてログインしていること。会員の行がなければ、登録時の情報から作る
 * （確認番号の入力のあとに作れなかった場合の備え）
 */
export const getMember = cache(async (): Promise<MemberRow | null> => {
  const claims = await getClaims();
  if (!claims?.sub) return null;
  const supabase = await createUserClient();
  const { data } = await supabase.from("members").select("*").eq("id", claims.sub).maybeSingle();
  if (data) return data.withdrawn_at ? null : data;
  return ensureMemberRow(claims.sub);
});

export async function requireMember(nextPath?: string): Promise<MemberRow> {
  const member = await getMember();
  if (!member) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return member;
}

type SignupMetadata = {
  full_name?: string;
  full_name_kana?: string;
  phone?: string;
  marketing_opt_in?: boolean;
  consent_version?: string;
  signup_kind?: string;
};

/** 確認番号の入力が済んだ利用者の、会員の行を作る（6.1）。管理者のアカウントには作らない */
export async function ensureMemberRow(userId: string): Promise<MemberRow | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("members").select("*").eq("id", userId).maybeSingle();
  if (existing) return existing.withdrawn_at ? null : existing;

  const { data: staff } = await admin.from("staff").select("user_id").eq("user_id", userId).maybeSingle();
  if (staff) return null;

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (!user || !user.email || !user.email_confirmed_at) return null;
  const meta = (user.user_metadata ?? {}) as SignupMetadata;
  if (meta.signup_kind !== "member" || !meta.full_name || !meta.full_name_kana) return null;

  const { data: created, error } = await admin
    .from("members")
    .upsert(
      {
        id: userId,
        email: user.email,
        full_name: meta.full_name,
        full_name_kana: meta.full_name_kana,
        phone: meta.phone ?? null,
        marketing_opt_in: Boolean(meta.marketing_opt_in),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (created && meta.marketing_opt_in) {
    await admin.from("marketing_consents").insert({
      member_id: userId,
      action: "grant",
      source: "signup",
      wording_version: meta.consent_version ?? null,
    });
  }
  return created ?? (await admin.from("members").select("*").eq("id", userId).single()).data;
}

/** 管理者・保守としてログインし、TOTP 済み（aal2）であること（3章）。違えば null */
export const getStaff = cache(async (): Promise<StaffRow | null> => {
  const claims = await getClaims();
  // デモでは2段階認証を通ったものとして扱う（本番では isDemo() は必ず false）
  if (!claims?.sub || (claims.aal !== "aal2" && !isDemo())) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("staff").select("*").eq("user_id", claims.sub).eq("active", true).maybeSingle();
  return data ?? null;
});

export async function requireStaff(): Promise<StaffRow> {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");
  return staff;
}
