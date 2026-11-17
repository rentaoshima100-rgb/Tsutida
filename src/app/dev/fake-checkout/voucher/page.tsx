import { notFound } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/lib/env";

export default async function FakeVoucherPage() {
  // ビルド時ではなく、リクエストのたびに環境変数で判定する
  await connection();
  if (env().PAYMENT_GATEWAY !== "fake") notFound();
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm font-bold">開発用の擬似決済です</p>
      <h1 className="text-2xl font-bold">払込票・振込先（見本）</h1>
      <p>本番では、ここに Stripe の払込票・振込先のページが開きます。</p>
    </main>
  );
}
