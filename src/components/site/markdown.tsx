import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * 管理画面で編集する文面（規約類・ご利用の流れなど）を出す。
 * react-markdown は HTML をそのまま出さないので、文面に HTML が入っても実行されない
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("prose-site", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
