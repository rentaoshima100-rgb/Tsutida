import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/action-form";
import { PageHeader, Panel, inputClass, selectClass } from "@/components/admin/ui";
import { SubmitButton } from "@/components/forms/submit-button";
import { requireStaff } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { createAdminClient } from "@/lib/supabase/server";
import { addStaff, saveBusiness, saveOrdering, savePages, setStaffActive } from "./actions";

export const metadata: Metadata = { title: "設定" };

const F = ({ label, name, value, wide, hint }: { label: string; name: string; value: string | number; wide?: boolean; hint?: string }) => (
  <label className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
    <span className="block text-xs text-muted-foreground">{label}</span>
    <input name={name} defaultValue={value} className={`${inputClass} w-full`} />
    {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
  </label>
);
const T = ({ label, name, value, rows = 8 }: { label: string; name: string; value: string; rows?: number }) => (
  <label className="space-y-1 sm:col-span-2">
    <span className="block text-xs text-muted-foreground">{label}</span>
    <textarea name={name} defaultValue={value} rows={rows} className="w-full rounded-md border border-input bg-white p-2.5 font-mono text-xs leading-relaxed" />
  </label>
);

// A16 設定：管理者アカウント、送料の初期値、支払い方法、つなげるアカウント数、事業者情報と規約類、問い合わせの受信アドレス
export default async function SettingsAdminPage() {
  const me = await requireStaff();
  const s = await getSettings();
  const { data: staff } = await createAdminClient().from("staff").select("*").order("created_at");
  const b = s.business_info;
  const faqText = s.page_faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  return (
    <div className="space-y-5">
      <PageHeader title="設定" description="ここで変えた内容は、すぐにサイトとメールに反映されます。文面の {{business_name}} などは事業者情報に置き換わります" />

      <Panel title="事業者情報とメール">
        <ActionForm action={saveBusiness} className="grid gap-3 text-sm sm:grid-cols-2">
          <F label="事業者名（特商法の表記・メールの末尾）" name="name" value={b.name} />
          <F label="運営統括責任者" name="representative" value={b.representative} />
          <F label="郵便番号" name="postal_code" value={b.postal_code} />
          <F label="住所" name="address" value={b.address} />
          <F label="電話番号（固定電話）" name="phone" value={b.phone} />
          <F label="メールアドレス（公開）" name="email" value={b.email} />
          <F label="お問い合わせの受付時間" name="hours" value={b.hours} />
          <F label="ホームページ" name="url" value={b.url} />
          <F label="お問い合わせの受信アドレス" name="contact_inbox" value={s.contact_inbox} hint="お問い合わせフォームと、チャージバックなどの知らせが届きます" />
          <F label="保守担当への知らせの宛先" name="maintainer_email" value={s.maintainer_email} />
          <F label="メールの差出人名" name="from_name" value={s.mail_sender.from_name} />
          <F label="メールの送信元アドレス" name="from_address" value={s.mail_sender.from_address} hint="Amazon SES で認証したドメインのアドレス" />
          <F label="返信先（任意）" name="reply_to" value={s.mail_sender.reply_to} />
          <F label="スナップスナップの写真ページ" name="snapsnap_url" value={s.snapsnap_url} />
          <div className="sm:col-span-2"><SubmitButton>保存する</SubmitButton></div>
        </ActionForm>
      </Panel>

      <Panel title="注文と支払い">
        <ActionForm action={saveOrdering} className="grid gap-3 text-sm sm:grid-cols-2">
          <F label="送料の初期値（円・全国一律）" name="default_shipping_fee" value={s.default_shipping_fee} />
          <F label="1人のお子さまにつなげるアカウント数" name="max_accounts_per_child" value={s.max_accounts_per_child} />
          <fieldset className="space-y-1 sm:col-span-2">
            <legend className="text-xs text-muted-foreground">使える支払い方法（コンビニ払い・PayPay は Stripe の審査・申し込みのあとで有効にする）</legend>
            <div className="flex flex-wrap gap-4">
              {(["card", "paypay", "konbini", "bank_transfer"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5"><input type="checkbox" name={m} defaultChecked={s.payment_methods[m]} className="size-4" />{{ card: "クレジットカード", paypay: "PayPay", konbini: "コンビニ払い", bank_transfer: "銀行振込" }[m]}</label>
              ))}
            </div>
          </fieldset>
          <F label="お届け予定の初期値" name="delivery_note_default" value={s.delivery_note_default} wide />
          <F label="締切後の注文のお届け予定の初期値" name="late_delivery_note_default" value={s.late_delivery_note_default} wide />
          <F label="領収書の但し書き" name="proviso" value={s.receipt.proviso} />
          <F label="お知らせの同意欄の版（文言を変えたら上げる）" name="consent_version" value={s.consent_wording.version} />
          <F label="お知らせの同意欄の文言" name="consent_label" value={s.consent_wording.label} wide />
          <T label="再生機器の注意（行事のページ・商品と価格に出す）" name="playback_note" value={s.playback_note} rows={3} />
          <div className="sm:col-span-2"><SubmitButton>保存する</SubmitButton></div>
        </ActionForm>
      </Panel>

      <Panel title="公開ページと規約類の文面">
        <ActionForm action={savePages} className="grid gap-3 text-sm sm:grid-cols-2">
          <T label="トップ：説明" name="top_lead" value={s.page_top.lead} rows={2} />
          <T label="トップ：行事のページを在籍のご家庭に限る理由" name="top_why_login" value={s.page_top.why_login} rows={3} />
          <T label="トップ：お知らせ（空なら出さない）" name="top_notice" value={s.page_top.notice} rows={2} />
          <T label="ご利用の流れ（Markdown）" name="page_guide" value={s.page_guide} />
          <T label="商品と価格（Markdown）" name="page_products" value={s.page_products} />
          <T label="よくある質問（「Q: 質問」「A: 答え」の行で書く）" name="page_faq" value={faqText} rows={12} />
          <T label="特定商取引法に基づく表記（Markdown）" name="legal_tokushoho" value={s.legal_tokushoho} />
          <T label="利用規約（Markdown）" name="legal_terms" value={s.legal_terms} />
          <T label="プライバシーポリシー（Markdown）" name="legal_privacy" value={s.legal_privacy} />
          <T label="キャンセル・交換について（Markdown）" name="legal_cancel" value={s.legal_cancel} />
          <div className="sm:col-span-2"><SubmitButton>保存する</SubmitButton></div>
        </ActionForm>
      </Panel>

      <Panel title="管理者アカウント">
        <table className="mb-4 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">名前</th><th>メール</th><th>役割</th><th>状態</th><th /></tr></thead>
          <tbody>
            {(staff ?? []).map((st) => (
              <tr key={st.user_id} className="border-t">
                <td className="py-2">{st.name}</td>
                <td>{st.email}</td>
                <td>{st.role === "maintainer" ? "保守（NORTIQLAB）" : "管理者"}</td>
                <td>{st.active ? "使用中" : "停止"}</td>
                <td className="text-right">
                  {st.user_id !== me.user_id ? (
                    <ActionForm action={setStaffActive.bind(null, st.user_id, !st.active)} confirm={st.active ? `${st.name} さんのアカウントを止めます` : `${st.name} さんのアカウントを使えるようにします`}>
                      <SubmitButton size="sm" variant="outline">{st.active ? "止める" : "使えるようにする"}</SubmitButton>
                    </ActionForm>
                  ) : <span className="text-xs text-muted-foreground">自分</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionForm action={addStaff} className="flex flex-wrap items-end gap-2 text-sm">
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">名前</span><input name="name" className={inputClass} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">メールアドレス</span><input name="email" type="email" className={`${inputClass} w-64`} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted-foreground">役割</span><select name="role" className={selectClass}><option value="admin">管理者</option><option value="maintainer">保守</option></select></label>
          <SubmitButton>追加する</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-xs text-muted-foreground">追加した方は、/admin/login の「パスワードを設定する」でメールに届く確認番号からパスワードを決め、認証アプリを登録してログインします。</p>
      </Panel>
    </div>
  );
}
