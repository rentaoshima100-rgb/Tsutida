import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// 会員のお知らせの同意（11章）。同意・取り消しは marketing_consents に追記で残す

export type ConsentSource = "signup" | "settings" | "unsubscribe_link" | "complaint" | "withdrawal" | "admin";

export async function setMarketingConsent(params: {
  memberId: string;
  optIn: boolean;
  source: ConsentSource;
  wordingVersion?: string | null;
}) {
  const admin = createAdminClient();
  const { data: member } = await admin.from("members").select("marketing_opt_in").eq("id", params.memberId).maybeSingle();
  if (!member) return false;
  if (member.marketing_opt_in === params.optIn) return false;
  const { error } = await admin.from("members").update({ marketing_opt_in: params.optIn }).eq("id", params.memberId);
  if (error) throw error;
  await admin.from("marketing_consents").insert({
    member_id: params.memberId,
    action: params.optIn ? "grant" : "revoke",
    source: params.source,
    wording_version: params.wordingVersion ?? null,
  });
  return true;
}
