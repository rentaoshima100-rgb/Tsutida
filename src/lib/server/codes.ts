import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCode, generateCode, registrationUrl } from "@/lib/domain/codes";
import { appUrl } from "@/lib/env";
import { qrDataUrl } from "@/lib/server/pdf/base";
import type { CardData } from "@/lib/server/pdf/code-cards";

// 登録コードの発行・再発行（A03）

export async function issueCodes(classId: string, count: number, purpose: "normal" | "spare" | "review") {
  if (!Number.isInteger(count) || count < 1 || count > 300) throw new Error("発行する数は1〜300にしてください");
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = Array.from({ length: count }, () => ({ code: generateCode(), class_id: classId, purpose }));
    const { data, error } = await admin.from("registration_codes").insert(rows).select("id");
    if (!error) return data?.length ?? 0;
    if (error.code !== "23505") throw error; // まれなコードの重なりなら作り直す
  }
  throw new Error("コードを発行できませんでした");
}

export async function reissueCode(codeId: string): Promise<string> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await admin.rpc("reissue_code", { p_code_id: codeId, p_new_code: generateCode() });
    if (!error) return data as string;
    if (error.code !== "23505") throw error;
  }
  throw new Error("再発行できませんでした");
}

/** カードの PDF に載せる値（クラスごと、または選んだコード） */
export async function cardDataFor(params: { classId?: string; codeIds?: string[]; onlyUnused?: boolean }): Promise<CardData[]> {
  const admin = createAdminClient();
  let q = admin
    .from("registration_codes")
    .select("id, code, serial_no, status, purpose, class:classes!inner(fiscal_year, grade_label, name, school:schools!inner(name))")
    .neq("status", "revoked")
    .order("serial_no");
  if (params.classId) q = q.eq("class_id", params.classId);
  if (params.codeIds && params.codeIds.length > 0) q = q.in("id", params.codeIds);
  if (params.onlyUnused) q = q.eq("status", "unused");
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  const site = appUrl("/").replace(/\/$/, "");
  return Promise.all(
    (data ?? []).map(async (c) => ({
      serialNo: c.serial_no,
      code: formatCode(c.code),
      qr: await qrDataUrl(registrationUrl(site, c.code)),
      schoolName: c.class.school.name,
      classLabel: `${c.class.grade_label} ${c.class.name}`,
      fiscalYear: c.class.fiscal_year,
      siteUrl: site.replace(/^https?:\/\//, ""),
      purpose: c.purpose,
    })),
  );
}
