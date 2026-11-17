import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/site/markdown";
import { fillText, getPublicSettings, textVariables, type SettingKey } from "@/lib/server/settings";

// G06 規約類。文面は settings（A16 で編集）

const PAGES: Record<string, { title: string; key: SettingKey }> = {
  tokushoho: { title: "特定商取引法に基づく表記", key: "legal_tokushoho" },
  terms: { title: "利用規約", key: "legal_terms" },
  privacy: { title: "プライバシーポリシー", key: "legal_privacy" },
  cancel: { title: "キャンセル・交換について", key: "legal_cancel" },
};

export async function generateMetadata(props: PageProps<"/legal/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  return { title: PAGES[slug]?.title ?? "規約" };
}

export default async function LegalPage(props: PageProps<"/legal/[slug]">) {
  const { slug } = await props.params;
  const page = PAGES[slug];
  if (!page) notFound();
  const s = await getPublicSettings();
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-bold">{page.title}</h1>
      <Markdown text={fillText(String(s[page.key]), textVariables(s))} />
    </article>
  );
}
