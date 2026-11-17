import { cn } from "@/lib/utils";

/** ラベル・入力・説明・エラーをひとまとめにする（エラーは入力欄の近くに文字で出す） */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-center gap-2 font-bold">
        {label}
        {required ? (
          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-danger">必須</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const bigInput =
  "h-12 rounded-xl border-input px-3.5 text-base md:text-base aria-invalid:border-danger bg-white";
