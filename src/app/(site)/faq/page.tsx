import type { Metadata } from "next";
import { fillText, getPublicSettings, textVariables } from "@/lib/server/settings";

export const metadata: Metadata = { title: "よくある質問" };

// G05 よくある質問（settings.page_faq）
export default async function FaqPage() {
  const s = await getPublicSettings();
  const vars = textVariables(s);
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-bold">よくある質問</h1>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {s.page_faq.map((item) => (
          <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-bold">
              <span>{fillText(item.q, vars)}</span>
              <span aria-hidden className="mt-0.5 text-brand group-open:rotate-45 motion-safe:transition-transform">
                ＋
              </span>
            </summary>
            <p className="mt-3 leading-8">{fillText(item.a, vars)}</p>
          </details>
        ))}
      </div>
    </article>
  );
}
