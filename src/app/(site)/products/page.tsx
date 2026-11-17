import type { Metadata } from "next";
import { Markdown } from "@/components/site/markdown";
import { Notice } from "@/components/site/notice";
import { fillText, getPublicSettings, textVariables } from "@/lib/server/settings";

export const metadata: Metadata = { title: "商品と価格" };

// G03 商品と価格。標準の価格・2枚目以降・締切後の価格・送料・お届けの時期・受け取り方法（仕様書3章）
export default async function ProductsPage() {
  const s = await getPublicSettings();
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-bold">商品と価格</h1>
      <Markdown text={fillText(s.page_products, textVariables(s))} />
      {s.playback_note ? (
        <Notice tone="warning" title="再生できる機器について">
          {s.playback_note}
        </Notice>
      ) : null}
      <p className="text-sm text-muted-foreground">価格はすべて税込です。</p>
    </article>
  );
}
