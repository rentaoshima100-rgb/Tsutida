import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// お知らせの枠。色だけに頼らず、アイコンと見出しの文字でも種類がわかるようにする

const STYLES = {
  info: { icon: Info, className: "border-[#b9c7e0] bg-[#eef3fb]", label: "ご案内" },
  success: { icon: CircleCheck, className: "border-[#a8d0b8] bg-ok-soft", label: "完了" },
  warning: { icon: TriangleAlert, className: "border-[#ecd18f] bg-warn-soft", label: "ご注意" },
  error: { icon: CircleAlert, className: "border-[#f1b3ac] bg-danger-soft", label: "エラー" },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof STYLES;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = STYLES[tone];
  const Icon = s.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-[0.95rem] leading-relaxed", s.className, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-bold">{title}</p> : <span className="sr-only">{s.label}</span>}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
