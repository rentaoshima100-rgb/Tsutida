// 登録コード（9.8）：12文字の Crockford Base32（0〜9と、I・L・O・U を除く英字。60ビット）

export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 12;

const VALID = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** 暗号論的な乱数で新しいコードを作る */
export function generateCode(randomBytes: (n: number) => Uint8Array = cryptoRandomBytes): string {
  const bytes = randomBytes(8); // 64ビットのうち60ビットを使う
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Number(bits & 31n)];
    bits >>= 5n;
  }
  return out;
}

function cryptoRandomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/**
 * 入力を照合用の形にする：全角を半角に、大文字にし、ハイフンと空白を除き、
 * O を 0 に、I と L を 1 に読み替える。12文字のコードにならなければ null
 */
export function normalizeCode(input: string): string | null {
  const s = input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐‑‒–—―ー－]/gu, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return VALID.test(s) ? s : null;
}

/** カードに印字する形：4文字ずつハイフンで区切る */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** QRコードに入れるURL。コードは # 以降に置き、サーバーのログやリファラーに残さない（4章） */
export function registrationUrl(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r?openExternalBrowser=1#${code}`;
}
