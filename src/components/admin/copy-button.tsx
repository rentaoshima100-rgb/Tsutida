"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 文をコピーする。コピーできたら、アイコンと文字で知らせる */
export function CopyButton({ text, label = "コピーする" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check aria-hidden /> : <Copy aria-hidden />}
      {done ? "コピーしました" : label}
    </Button>
  );
}
