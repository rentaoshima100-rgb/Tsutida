import "server-only";
import path from "node:path";
import { Font, renderToBuffer, StyleSheet } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ReactElement } from "react";

// PDF はサーバーでその場で作り、保存しない（13章）。日本語フォントは Noto Sans JP（OFL）

// 全角の記号・かな・漢字（U+3000〜U+30FF、U+3400〜U+9FFF、U+F900〜U+FAFF、U+FF00〜U+FFEF）
const CJK = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const NO_LINE_START = new Set(Array.from("、。，．・：；？！）〕］｝〉》」』】ゝゞーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々…‥,.)]}!?％%"));
const NO_LINE_END = new Set(Array.from("（〔［｛〈《「『【([{"));

let registered = false;
export function ensureFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: path.join(dir, "NotoSansJP-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "NotoSansJP-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // 日本語は語の切れ目に空白がないので、1文字ずつ折り返せるようにする（ハイフンは付けない）。
  // 行頭に「）」「。」などが来ない・行末に「（」などが残らないよう、その文字は前の文字とまとめる（禁則）
  Font.registerHyphenationCallback((word) => {
    if (!CJK.test(word)) return [word];
    const parts: string[] = [];
    for (const c of Array.from(word)) {
      const prev = parts[parts.length - 1];
      if (prev !== undefined && (NO_LINE_START.has(c) || NO_LINE_END.has(prev.slice(-1)))) parts[parts.length - 1] = prev + c;
      else parts.push(c);
    }
    return parts.flatMap((p) => [p, ""]);
  });
  registered = true;
}

export const base = StyleSheet.create({
  page: { fontFamily: "NotoSansJP", fontSize: 10, color: "#1d2a44", padding: 36 },
  h1: { fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  h2: { fontSize: 12, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  muted: { color: "#556070" },
  small: { fontSize: 8 },
  bold: { fontWeight: "bold" },
});

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 1, width: 300 });
}

export async function renderPdf(doc: ReactElement): Promise<Buffer> {
  ensureFonts();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(doc as any);
}

export function pdfResponse(buffer: Buffer, filename: string, inline = true): Response {
  return new Response(new Uint8Array(buffer) as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** CSV（Excel 向けは BOM つき UTF-8、発送サービスによっては Shift_JIS。13章） */
export async function csvResponse(rows: (string | number | null | undefined)[][], filename: string, encoding: "utf8bom" | "sjis" = "utf8bom"): Promise<Response> {
  const text = rows
    .map((r) =>
      r
        .map((v) => {
          const s = v === null || v === undefined ? "" : String(v);
          // 表計算ソフトの数式として読まれないようにする
          const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(","),
    )
    .join("\r\n");
  let body: Buffer;
  if (encoding === "sjis") {
    const iconv = await import("iconv-lite");
    body = iconv.default.encode(text + "\r\n", "Shift_JIS");
  } else {
    body = Buffer.from("\uFEFF" + text + "\r\n", "utf8");
  }
  return new Response(new Uint8Array(body) as unknown as BodyInit, {
    headers: {
      "Content-Type": `text/csv; charset=${encoding === "sjis" ? "Shift_JIS" : "UTF-8"}`,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
