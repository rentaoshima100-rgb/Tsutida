import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";

// 設定（settings テーブル）。プログラムに直接書かず、管理画面（A16）で変えられる値（仕様書11章）

const businessInfo = z.object({
  name: z.string().default("ツチダ映像"),
  representative: z.string().default(""),
  postal_code: z.string().default(""),
  address: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  hours: z.string().default(""),
  url: z.string().default(""),
});

const paymentMethods = z.object({
  card: z.boolean().default(true),
  paypay: z.boolean().default(false),
  konbini: z.boolean().default(false),
  bank_transfer: z.boolean().default(true),
});

export const settingsSchema = z.object({
  default_shipping_fee: z.number().int().nonnegative().default(0),
  payment_methods: paymentMethods.default({ card: true, paypay: false, konbini: false, bank_transfer: true }),
  max_accounts_per_child: z.number().int().min(1).max(10).default(3),
  code_attempt_limit: z
    .object({ max_failures: z.number().int().min(1), window_minutes: z.number().int().min(1) })
    .default({ max_failures: 5, window_minutes: 15 }),
  new_year_mail_date: z
    .string()
    .regex(/^\d{2}-\d{2}$/)
    .default("04-10"),
  business_info: businessInfo.default(businessInfo.parse({})),
  contact_inbox: z.string().default(""),
  maintainer_email: z.string().default(""),
  mail_sender: z
    .object({ from_name: z.string(), from_address: z.string(), reply_to: z.string().default("") })
    .default({ from_name: "ツチダ映像", from_address: "no-reply@order.t-eizou.com", reply_to: "" }),
  ses_max_send_rate: z.number().positive().default(10),
  snapsnap_url: z.string().default(""),
  delivery_note_default: z.string().default(""),
  late_delivery_note_default: z.string().default(""),
  consent_wording: z
    .object({ version: z.string(), label: z.string() })
    .default({ version: "v1", label: "お知らせをメールで受け取る" }),
  receipt: z.object({ proviso: z.string() }).default({ proviso: "DVD・Blu-ray代として" }),
  playback_note: z.string().default(""),
  page_top: z
    .object({ lead: z.string().default(""), why_login: z.string().default(""), notice: z.string().default("") })
    .default({ lead: "", why_login: "", notice: "" }),
  page_guide: z.string().default(""),
  page_products: z.string().default(""),
  page_faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  legal_tokushoho: z.string().default(""),
  legal_terms: z.string().default(""),
  legal_privacy: z.string().default(""),
  legal_cancel: z.string().default(""),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof Settings;
export type BusinessInfo = z.infer<typeof businessInfo>;
export type PaymentMethodsSetting = z.infer<typeof paymentMethods>;

async function load(onlyPublic: boolean): Promise<Settings> {
  const admin = createAdminClient();
  let query = admin.from("settings").select("key, value");
  if (onlyPublic) query = query.eq("is_public", true);
  const { data, error } = await query;
  if (error) throw error;
  const raw: Record<string, unknown> = {};
  for (const row of data ?? []) raw[row.key] = row.value;
  // 形式の崩れた値は初期値に戻して動かし続ける（管理画面の保存時にも検証する）
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema.shape) as SettingKey[]) {
    const field = settingsSchema.shape[key];
    const parsed = field.safeParse(raw[key]);
    out[key] = parsed.success ? parsed.data : field.parse(undefined);
  }
  return out as Settings;
}

/** すべての設定（サーバーの処理・管理画面用）。1回のリクエストの中では1度だけ読む */
export const getSettings = cache(() => load(false));

/** 公開ページ用：is_public の値だけ（3章）。公開でない値は初期値になる */
export const getPublicSettings = cache(() => load(true));

/** 文面の差し込み（{{business_name}} など）に使う値 */
export function textVariables(s: Pick<Settings, "business_info" | "default_shipping_fee">): Record<string, string> {
  const b = s.business_info;
  return {
    business_name: b.name,
    business_representative: b.representative,
    business_postal_code: b.postal_code,
    business_address: b.address,
    business_phone: b.phone,
    business_email: b.email,
    business_hours: b.hours,
    business_url: b.url,
    default_shipping_fee: s.default_shipping_fee.toLocaleString("ja-JP"),
  };
}

/** {{name}} を置き換える（公開ページの文面用。値がなければ空にする） */
export function fillText(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");
}
