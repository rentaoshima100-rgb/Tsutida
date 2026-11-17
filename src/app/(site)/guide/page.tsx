import type { Metadata } from "next";
import { Markdown } from "@/components/site/markdown";
import { fillText, getPublicSettings, textVariables } from "@/lib/server/settings";

export const metadata: Metadata = { title: "ご利用の流れ" };

// G02 ご利用の流れ。文面は settings.page_guide（A16 で編集）
export default async function GuidePage() {
  const s = await getPublicSettings();
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-bold">ご利用の流れ</h1>
      <Markdown text={fillText(s.page_guide, textVariables(s))} />
    </article>
  );
}
