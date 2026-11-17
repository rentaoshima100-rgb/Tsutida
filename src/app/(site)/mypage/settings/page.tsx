import type { Metadata } from "next";
import { requireMember } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";
import { ConsentForm, EmailForm, PasswordForm, ProfileForm, WithdrawForm } from "./forms";

export const metadata: Metadata = { title: "会員情報・設定" };

// M09 会員情報・設定
export default async function SettingsPage() {
  const member = await requireMember("/mypage/settings");
  const settings = await getSettings();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">会員情報・設定</h1>
      <ProfileForm
        initial={{
          fullName: member.full_name,
          fullNameKana: member.full_name_kana,
          phone: member.phone ?? "",
          postalCode: member.postal_code ?? "",
          address: member.address ?? "",
        }}
      />
      <EmailForm current={member.email} />
      <PasswordForm />
      <ConsentForm optIn={member.marketing_opt_in} label={settings.consent_wording.label} />
      <WithdrawForm />
    </div>
  );
}
