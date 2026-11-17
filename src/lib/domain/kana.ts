// ふりがなの照合キー（9.9）：NFKC で正規化 → カタカナをひらがなに → 空白を除く。
// DB の public.kana_name_key() と同じ結果になること（tests/db で確かめる）。

const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const ITERATION_START = 0x30fd; // ヽ
const ITERATION_END = 0x30fe; // ヾ
const KANA_OFFSET = 0x60;

export function katakanaToHiragana(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (
      (code >= KATAKANA_START && code <= KATAKANA_END) ||
      (code >= ITERATION_START && code <= ITERATION_END)
    ) {
      out += String.fromCodePoint(code - KANA_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

export function nameKey(input: string): string {
  return katakanaToHiragana(input.normalize("NFKC")).replace(/\s+/gu, "");
}

/** ふりがなとして受け付ける文字（ひらがな・カタカナ・長音・空白） */
export function isKana(input: string): boolean {
  const normalized = input.normalize("NFKC").trim();
  if (normalized.length === 0) return false;
  return /^[ぁ-ゖゝゞァ-ヺー-ヾ\s]+$/u.test(normalized);
}

/** 入力されたふりがなを、表示・保存用に整える（前後と連続の空白をそろえる） */
export function tidyKana(input: string): string {
  return input.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
