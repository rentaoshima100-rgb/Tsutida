# ツチダ映像 DVD・Blu-ray 注文サイト

学校・園の行事の DVD・Blu-ray を、保護者がスマートフォンから注文・支払いするサイトと、その管理画面です。
仕様と設計は `docs/` にあります。実装はこの2つに合わせています。

- `docs/spec-v1.1.md`：仕様書 v1.1
- `docs/information-design.md`：エンジニア向けの情報設計書（画面・データ・状態・決済・メール・定期処理）

## 構成

| 役割 | 使うもの |
| --- | --- |
| 画面・サーバー | Next.js 16（App Router、`src/proxy.ts` でログインを確認）、React 19、Tailwind CSS v4、shadcn/ui |
| データベース・ログイン | Supabase（Postgres、Auth のメール確認番号、管理者の TOTP 2段階認証、Storage） |
| 決済 | Stripe（Checkout：カード・PayPay・コンビニ払い・銀行振込。代理注文は PaymentIntent） |
| メール | Amazon SES（東京）。送る前にキュー（`email_messages`）に入れ、5分ごとに送る |
| 置き場所・定期処理 | Vercel（東京 `hnd1`、Vercel Cron） |
| PDF・CSV | @react-pdf/renderer と Noto Sans JP（`assets/fonts`、OFL）、BOM つき UTF-8／Shift_JIS |

```
src/app/(site)        保護者向けの画面（M01〜M08、規約、問い合わせ）
src/app/admin         管理画面（A01〜A17）
src/app/api           Webhook（Stripe・SES）、定期処理、管理用の PDF・CSV
src/lib/domain        金額・期限・コード・ふりがなの計算（画面とサーバーで共通。単体テストあり）
src/lib/server        注文・決済・メール・定期処理・集計などサーバーだけで動く処理
supabase/migrations   テーブル、RLS、関数、初期値、権限（最後の 0900 で権限をまとめて決める）
supabase/templates    Supabase Auth のメール（確認番号だけを送る）
tests/                単体テストと、データベースの権限（RLS）のテスト
e2e/                  画面を通したテスト（Playwright）
```

## 開発環境の準備

必要なもの：Node.js 22 以上、Docker（ローカルの Supabase を動かすため）。

```bash
npm install
npx supabase start            # Postgres・Auth・Storage・Mailpit（メールの受け箱）が起動する
cp .env.example .env.local    # 下の「開発用の値」を入れる
npm run db:reset              # マイグレーションと開発用データ（supabase/seed.sql）を入れ、型を作り直す
npm run staff:create -- --email admin@example.com --name "開発 管理者" --role admin --password admin-password-1234
npm run dev                   # http://localhost:3000
```

開発用の値（`.env.local`）：

- `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`・`SUPABASE_SECRET_KEY`：`npx supabase status -o env` に出る値
- `APP_BASE_URL=http://localhost:3000`
- `CRON_SECRET`・`UNSUBSCRIBE_SIGNING_SECRET`・`IP_HASH_SECRET`：16文字以上の任意の文字列
- `PAYMENT_GATEWAY=fake`：Stripe の代わりに擬似決済（`/dev/fake-checkout`）を使う。本番（`VERCEL_ENV=production`）では起動しない
- `DEMO_MODE=1`：先方に見てもらうためのデモ用ログイン。メールアドレスの欄に「A」で管理画面、「B」で会員の画面に入る。パスワード・確認番号・確認コードは何を入れても通り、メールは送らない。本番（`VERCEL_ENV=production`）では無効で、起動もしない
- `MAIL_TRANSPORT=smtp`、`SMTP_URL=smtp://127.0.0.1:54325`：メールは Mailpit（http://127.0.0.1:54324）に届く

開発用データ：

- 行事：運動会（受付中・学校／郵送）、発表会（下書き）、夏まつり（締切後の受付中・郵送のみ）、学習発表会（小学校・郵送のみ）
- 登録コード：`TEST0M000001`〜`TEST0M000003`（年少 もも組）、`TEST0K000001`・`TEST0K000002`（年長 きりん組）、`TEST0Z000001`（年長 ぞう組）、`TEST0H000001`（1年 1組）、`TEST0S000001`（予備）、`REVW0000000A`（Stripe の審査用）
- 管理画面は `/admin/login`。初回は認証アプリ（TOTP）の登録の画面が出る

メールの送信と定期処理は、ローカルでは自動で動きません。必要なときに呼びます。

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send     # S1 メールを送る
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/hourly   # J1〜J8
```

## テスト

```bash
npm run typecheck   # ルートの型を作ってから tsc
npm test            # 単体テストと RLS のテスト（ローカルの Supabase が必要）
npm run test:e2e    # 画面を通したテスト（開発サーバー・Supabase・Mailpit が必要。PAYMENT_GATEWAY=fake）
```

- 画面のテストは iPhone 13 の大きさで、会員登録 → 確認番号 → 登録コード → 注文 → 擬似決済 → メール、コンビニ払いの入金、管理者の TOTP ログイン、代理注文（コンビニ払い・銀行振込・現金）、チラシ PDF、売上 CSV、定期処理の認証までを通す
- 管理者の TOTP は、テストの最初に前回の登録を消してから登録し直す（`e2e/helpers.ts` の `resetAdminMfa`）。決まった秘密の値を使うときは `E2E_ADMIN_TOTP_SECRET` を渡す
- 画面の写真は `test-results/shots/` に出る

## 本番の準備

### 1. Supabase（東京リージョン）

1. プロジェクトを作り、`npx supabase link --project-ref <ref>`、`npx supabase db push` でマイグレーションを入れる（`supabase/seed.sql` は本番に入れない）
2. Auth の設定（`supabase/config.toml` と同じにする）
   - Site URL：`https://<本番のドメイン>`、Redirect URLs：同じドメイン
   - メールの確認：オン。確認番号は6桁・有効1時間・再送は60秒あける
   - メールアドレスの変更：「Secure email change」はオフ（新しいアドレスだけに確認番号を送る）
   - メールの文面：`supabase/templates/` の5つ（確認番号だけを載せ、リンクは載せない）
   - SMTP：Amazon SES の SMTP の認証情報を入れる（送信元は SES で認証したドメイン）
   - 送信の上限（Rate limits）：メールの送信数を、学校・園の配布の山に合わせて上げる
   - 2段階認証：TOTP をオン（管理者だけが使う。管理画面は aal2 でなければ入れない）
3. Storage：ジャケット画像の非公開バケット `jackets` はマイグレーション（0700）で作られる
4. 最初の管理者：`node --env-file=.env.production.local scripts/create-staff.mts --email <メール> --name <名前> --role admin`（パスワードを渡さなければ、本人が `/admin/login` の「パスワードを設定する」から決める）

### 2. Stripe

1. 支払い方法を有効にする：カード、PayPay、コンビニ払い、銀行振込（customer_balance・jp_bank_transfer）。有効にしたものだけを管理画面 A16 の「支払い方法」でオンにする
2. Webhook：`https://<ドメイン>/api/webhooks/stripe`。受けるイベント：
   `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`payment_intent.succeeded`、`payment_intent.payment_failed`、`payment_intent.canceled`、`payment_intent.partially_funded`、`refund.updated`、`refund.failed`、`charge.dispute.created`
3. 署名の鍵を `STRIPE_WEBHOOK_SECRET` に入れる。API のバージョンは SDK に合わせる（stripe 23.1.0 ＝ `2026-10-28.endive`。支払い方法の指定は `allowed_payment_method_types`）

### 3. Amazon SES（東京）

1. 送信元のドメインを認証する（DKIM、カスタム MAIL FROM で SPF、DMARC）。本番の送信の申請（サンドボックスの解除）をする
2. 設定セット（`SES_CONFIGURATION_SET`）を作り、配信・バウンス・苦情のイベントを SNS のトピックに送る
3. SNS のトピックに HTTPS の購読 `https://<ドメイン>/api/webhooks/ses` を足す（確認は自動。署名とトピックの ARN を確かめる）
4. SES の送信だけを許可した IAM ユーザーのアクセスキーを `AWS_ACCESS_KEY_ID`・`AWS_SECRET_ACCESS_KEY` に入れる

### 4. Vercel

1. プロジェクトを作り、`.env.example` のすべての値を Production（とテスト環境）に入れる。テスト環境では `MAIL_ALLOWED_DOMAINS` で送り先を開発者のドメインに絞る
2. 定期処理は、本番では毎時0分に J1〜J8、5分ごとにメールの送信 S1 を動かす。Hobby プランは1日1回までの Cron しかデプロイできないため、**いまの `vercel.json` はお試し用に1日1回（日本時間 6:00 に J1〜J8、6:30 に S1）にしてある**。本番運用の前に Pro 以上にして、`"0 * * * *"` と `"*/5 * * * *"` に戻す。お試しの間、メールをすぐ送りたいときは「開発環境の準備」の curl で `/api/cron/send` を呼ぶ
3. 本番のドメインを付け、`APP_BASE_URL` をそのドメインにする

### 5. 管理画面で入れるもの（A16 設定）

事業者の情報、特定商取引法に基づく表記・利用規約・プライバシーポリシー・キャンセルと交換の文面、問い合わせの受信アドレス、保守担当のアドレス、送料の初期値、支払い方法のオン・オフ、新年度メールの日付。

## 定期処理

| 名前 | いつ | すること |
| --- | --- | --- |
| S1 | 5分ごと | キューのメールを SES の送信速度の上限を守って送る（失敗は5回までやり直す） |
| J1 | 毎時 | 販売開始のお知らせ（21時〜翌8時に始まる行事は朝8時に） |
| J2 | 毎時 | 締切前のお知らせ（締切を延ばしたら新しい締切で送り直す） |
| J3 | 毎時 | 支払期限の前日のお知らせ |
| J4 | 毎時 | 期限切れの注文の取り消し |
| J5 | 毎時 | 本数の確定（締切日の2日後の23:59） |
| J6 | 毎時 | 途中でやめた注文（下書き）の掃除 |
| J7 | 毎時 | 新年度の登録コードの入力のお願い（年度に1回） |
| J8 | 毎時 | 監視（Stripe の通知の処理の失敗、メールの送信の失敗・滞り、Stripe に送れていない返金、定期処理のエラーを保守担当へ。同じ知らせは1日1回） |

同じ処理が重ならないよう、`job_locks` で15分の貸し出しをとってから動きます。

## 実装で決めたこと（設計書の「案」「未決」に対して）

- 代理注文のコンビニ払いは、注文者のメールアドレスを必須にした（Stripe が氏名とメールを求めるため。17章の未決）。メールがない方は銀行振込か現金で受ける
- 代理注文は、受付中（締切後の受付を含む）の行事だけに作れる。銀行振込は注文ごとに Stripe の顧客を作る（振込先の口座が注文ごとに分かれる）。現金は支払期限を持たず、自動では取り消さない
- 案内チラシには、お子さまが写ることがあるジャケット画像を載せない。チラシに載せる事項は弁護士の確認待ち（17章）
- 注文の明細に、注文時の商品名と価格を残す（あとで商品を変えても、取り消しの返金は注文時の価格で計算する）
- 管理画面の PDF・CSV は保存せず、その場で作る

## 画面の見た目について

画面の見た目は、色・文字・余白をまとめた仮のもの（`src/app/globals.css` の色の定義と shadcn/ui の部品）で作っています。
Claude Design で作ったデザインを受け取ったら、色・文字の定義と各画面の部品を差し替えます。画面の構成・文言・処理はそのまま使えます。
