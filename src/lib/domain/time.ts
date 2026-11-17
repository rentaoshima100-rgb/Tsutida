// 日本時間（Asia/Tokyo、UTC+9。夏時間なし）の日付と時刻の計算。
// DB には UTC（timestamptz）で保存し、期限の判定と表示はすべて日本時間で行う（1章）。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 日本時間の日付。'YYYY-MM-DD' の文字列で扱う */
export type JstDate = string;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 日本時間の年月日・時分 */
export function jstParts(value: Date | string) {
  const shifted = new Date(toDate(value).getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** その時刻の、日本時間での日付 */
export function jstDate(value: Date | string): JstDate {
  const p = jstParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function parseJstDate(date: JstDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`invalid date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** 日本時間の日付に日数を足す */
export function addDays(date: JstDate, days: number): JstDate {
  const { y, m, d } = parseJstDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** b − a の日数 */
export function diffDays(a: JstDate, b: JstDate): number {
  const pa = parseJstDate(a);
  const pb = parseJstDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}

/** 日本時間のある日の、指定した時刻 */
export function jstAt(date: JstDate, hour: number, minute = 0, second = 0): Date {
  const { y, m, d } = parseJstDate(date);
  return new Date(Date.UTC(y, m - 1, d, hour, minute, second) - JST_OFFSET_MS);
}

/** 日本時間のある日の 23:59:00（支払い期限・本数の確定の基準） */
export function jstEndOfDay(date: JstDate): Date {
  return jstAt(date, 23, 59, 0);
}

/** 日本時間の日時の入力値（datetime-local の 'YYYY-MM-DDTHH:mm'）を Date にする */
export function fromJstLocalInput(value: string): Date {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`invalid datetime: ${value}`);
  return jstAt(match[1], Number(match[2]), Number(match[3]));
}

/** Date を日本時間の datetime-local の入力値にする */
export function toJstLocalInput(value: Date | string): string {
  const p = jstParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** 年度（4月始まり）。2026年4月〜2027年3月は 2026 */
export function fiscalYearOf(value: Date | string): number {
  const p = jstParts(value);
  return p.month >= 4 ? p.year : p.year - 1;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026年11月5日（木） */
export function formatJstDate(value: Date | string): string {
  const p = jstParts(value);
  return `${p.year}年${p.month}月${p.day}日（${WEEKDAYS[p.weekday]}）`;
}

/** 11月5日（木） */
export function formatJstMonthDay(value: Date | string): string {
  const p = jstParts(value);
  return `${p.month}月${p.day}日（${WEEKDAYS[p.weekday]}）`;
}

/** 2026年11月5日（木）23:59 */
export function formatJstDateTime(value: Date | string): string {
  const p = jstParts(value);
  return `${formatJstDate(value)} ${p.hour}:${pad(p.minute)}`;
}

/** 11月5日（木）23:59 */
export function formatJstMonthDayTime(value: Date | string): string {
  const p = jstParts(value);
  return `${formatJstMonthDay(value)} ${p.hour}:${pad(p.minute)}`;
}

/** 2026/11/05 23:59（管理画面の一覧用） */
export function formatJstCompact(value: Date | string): string {
  const p = jstParts(value);
  return `${p.year}/${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 'YYYY-MM-DD' の日付（開催日など、時刻のない日付）を 2026年11月5日（木）にする */
export function formatDateOnly(date: JstDate): string {
  return formatJstDate(jstAt(date, 12));
}
