// メールの文面の差し込みと末尾（11章）。文面は email_templates、末尾はプログラムで付ける。

export class MissingVariableError extends Error {
  constructor(public readonly missing: string[]) {
    super(`差し込む値がありません: ${missing.join(", ")}`);
  }
}

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;

/** テンプレートに使われている差し込みの名前 */
export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

/** {{name}} を置き換える。値がない差し込みがあれば MissingVariableError（送らずにエラーを記録する） */
export function fill(text: string, vars: Record<string, string | number | null | undefined>): string {
  const missing = placeholders(text).filter((k) => vars[k] === undefined || vars[k] === null);
  if (missing.length > 0) throw new MissingVariableError(missing);
  return text.replace(PLACEHOLDER, (_, k: string) => String(vars[k]));
}

export type FooterInfo = {
  businessName: string;
  postalCode: string;
  address: string;
  phone: string;
  hours: string;
  email: string;
  contactUrl: string;
};

export function footer(info: FooterInfo, unsubscribeUrl?: string): string {
  const lines = [
    "――――――――――――――――――――",
    info.businessName,
    [info.postalCode ? `〒${info.postalCode}` : "", info.address].filter(Boolean).join(" "),
    info.phone ? `TEL ${info.phone}${info.hours ? `（受付時間：${info.hours}）` : ""}` : "",
    info.email,
    `お問い合わせ：${info.contactUrl}`,
    "このメールは送信専用のアドレスから送っています。",
  ];
  if (unsubscribeUrl) {
    lines.push(
      "",
      "このお知らせの配信を止める場合は、次のページから手続きしてください（ログインは要りません）。",
      unsubscribeUrl,
      "ご注文・お支払い・お届けに関するメールは、配信を止めても届きます。",
    );
  }
  return lines.filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n");
}

export function renderEmail(params: {
  subject: string;
  body: string;
  vars: Record<string, string | number | null | undefined>;
  footer: FooterInfo;
  unsubscribeUrl?: string;
}): { subject: string; body: string } {
  const subject = fill(params.subject, params.vars).replace(/[\r\n]+/g, " ").trim();
  const body = `${fill(params.body, params.vars).trimEnd()}\n\n${footer(params.footer, params.unsubscribeUrl)}\n`;
  return { subject, body };
}
