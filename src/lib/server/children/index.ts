import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/server";
import { formatJstDateTime } from "@/lib/domain/time";
import { enqueueMails } from "@/lib/server/mail/queue";

// 会員とお子さまのつながり（9.9）

/** IP はハッシュで持つ（14章） */
export async function requestIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "";
  if (!ip) return null;
  return createHmac("sha256", env().IP_HASH_SECRET).update(ip).digest("hex").slice(0, 32);
}

export type LinkedChild = {
  childId: string;
  fullName: string;
  fullNameKana: string;
  years: {
    fiscalYear: number;
    schoolName: string;
    gradeLabel: string;
    className: string;
    accounts: number;
  }[];
};

/** 会員につながっているお子さまと、年度ごとの在籍・つながっているアカウントの数（M08） */
export async function listLinkedChildren(memberId: string): Promise<LinkedChild[]> {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("member_children")
    .select("child_id, fiscal_year, child:children!inner(full_name, full_name_kana)")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  if (!links || links.length === 0) return [];
  const childIds = [...new Set(links.map((l) => l.child_id))];
  const [{ data: enrollments }, { data: allLinks }] = await Promise.all([
    admin
      .from("child_enrollments")
      .select("child_id, fiscal_year, class:classes!inner(grade_label, name, school:schools!inner(name))")
      .in("child_id", childIds),
    admin.from("member_children").select("child_id, fiscal_year").in("child_id", childIds).is("revoked_at", null),
  ]);
  const byChild = new Map<string, LinkedChild>();
  for (const l of links) {
    const c = byChild.get(l.child_id) ?? {
      childId: l.child_id,
      fullName: l.child.full_name,
      fullNameKana: l.child.full_name_kana,
      years: [],
    };
    const enr = (enrollments ?? []).find((e) => e.child_id === l.child_id && e.fiscal_year === l.fiscal_year);
    if (enr) {
      c.years.push({
        fiscalYear: l.fiscal_year,
        schoolName: enr.class.school.name,
        gradeLabel: enr.class.grade_label,
        className: enr.class.name,
        accounts: (allLinks ?? []).filter((x) => x.child_id === l.child_id && x.fiscal_year === l.fiscal_year).length,
      });
    }
    byChild.set(l.child_id, c);
  }
  const list = [...byChild.values()];
  for (const c of list) c.years.sort((a, b) => b.fiscalYear - a.fiscalYear);
  return list.sort((a, b) => a.fullNameKana.localeCompare(b.fullNameKana, "ja"));
}

/** 2人目以降のアカウントがつながったことを、先につながっていた会員に知らせる（account_linked） */
export async function notifyAccountLinked(params: {
  childId: string;
  fiscalYear: number;
  newMemberId: string;
  notifyMemberIds: string[];
}) {
  if (params.notifyMemberIds.length === 0) return;
  const admin = createAdminClient();
  const [{ data: child }, { data: newMember }, { data: recipients }, { data: enr }] = await Promise.all([
    admin.from("children").select("full_name").eq("id", params.childId).single(),
    admin.from("members").select("full_name").eq("id", params.newMemberId).single(),
    admin.from("members").select("id, email, full_name").in("id", params.notifyMemberIds),
    admin
      .from("child_enrollments")
      .select("class:classes!inner(grade_label, name, school:schools!inner(name))")
      .eq("child_id", params.childId)
      .eq("fiscal_year", params.fiscalYear)
      .maybeSingle(),
  ]);
  if (!child || !newMember) return;
  const now = new Date();
  await enqueueMails(
    "account_linked",
    (recipients ?? []).map((r) => ({
      to: r.email,
      memberId: r.id,
      dedupeKey: `account_linked:${params.childId}:${params.fiscalYear}:${params.newMemberId}:${r.id}`,
      vars: {
        member_name: r.full_name,
        child_name: child.full_name,
        school_name: enr?.class.school.name ?? "",
        class_label: enr ? `${enr.class.grade_label} ${enr.class.name}` : "",
        linked_member_name: newMember.full_name,
        linked_at: formatJstDateTime(now),
      },
    })),
  );
}
