import { formatYen } from "@/lib/domain/pricing";
import { formatJstDateTime } from "@/lib/domain/time";
import type { PaymentDetails } from "@/lib/server/payments/types";

// 払込票・振込先の案内（M05・M07）
export function PaymentInstructions({
  method,
  details,
  dueAt,
  amountDue,
}: {
  method: string;
  details: PaymentDetails | null;
  dueAt: string | null;
  amountDue: number;
}) {
  return (
    <section className="space-y-3 rounded-2xl border-2 border-ink p-5">
      <h2 className="text-lg font-bold">お支払いのご案内</h2>
      <p>
        <span className="font-bold">{dueAt ? `${formatJstDateTime(dueAt)}まで` : "期限まで"}</span>
        に、<span className="font-bold">{formatYen(amountDue)}</span>をお支払いください。期限を過ぎると、ご注文は自動で取り消されます。
      </p>
      {details?.kind === "konbini" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">ファミリーマート・ローソン・ミニストップ・セイコーマートで払えます（セブン-イレブンでは払えません）。</p>
          {details.stores.length > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {details.stores.map((s) => (
                <li key={s.store} className="px-4 py-3">
                  <p className="font-bold">{s.store}</p>
                  <p className="font-mono">お支払い番号 {s.paymentCode}{s.confirmationNumber ? `　確認番号 ${s.confirmationNumber}` : ""}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {details.hostedVoucherUrl ? (
            <a href={details.hostedVoucherUrl} target="_blank" rel="noopener" className="inline-block font-bold text-brand underline underline-offset-4 print:hidden">
              払込票を開く（Stripe）
            </a>
          ) : null}
        </div>
      ) : null}
      {details?.kind === "bank_transfer" ? (
        <div className="space-y-2">
          {details.bank ? (
            <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-xl bg-surface p-4">
              <dt className="font-bold">銀行</dt>
              <dd>{details.bank.bankName}</dd>
              <dt className="font-bold">支店</dt>
              <dd>{details.bank.branchName}</dd>
              <dt className="font-bold">口座</dt>
              <dd className="font-mono">{details.bank.accountType === "toza" ? "当座" : "普通"} {details.bank.accountNumber}</dd>
              <dt className="font-bold">名義</dt>
              <dd>{details.bank.accountHolderName}</dd>
            </dl>
          ) : null}
          <p className="text-sm text-muted-foreground">この振込先は、あなた専用です。振込手数料はお客様のご負担です。</p>
          {details.hostedInstructionsUrl ? (
            <a href={details.hostedInstructionsUrl} target="_blank" rel="noopener" className="inline-block font-bold text-brand underline underline-offset-4 print:hidden">
              振込先の案内を開く（Stripe）
            </a>
          ) : null}
        </div>
      ) : null}
      {!details ? (
        <p className="text-sm text-muted-foreground">
          {method === "konbini" ? "払込票" : "振込先"}は、お送りしたメールでご確認ください。
        </p>
      ) : null}
    </section>
  );
}
