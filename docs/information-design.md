# ツチダ映像様 DVD・Blu-ray ネット注文サイト 情報設計書（エンジニア向け）

Nov 3, 2026 · NORTIQLAB株式会社

## 1. この文書について

この文書は、仕様書 v1.1（2026年10月8日）を、実装する人がそのまま使える形（画面・URL・データ・状態・外部連携・定期処理）に組み直したものです。仕様の正は仕様書 v1.1 で、食い違いがあれば仕様書に合わせてこの文書を直します。

- 読む人：このサイトを実装・保守するエンジニア。AIのコーディングツールに渡しても読める書き方にしています
- 範囲：保護者向けサイト（公開ページ・会員ページ）、管理画面、決済・メール・定期処理。来年度の写真データ販売は、今回用意しておく拡張点だけを16章に書きます
- 画面IDは G（公開）・M（会員）・A（管理）、定期処理は J で始めます

| 表記 | ルール |
| --- | --- |
| 日時 | DBは timestamptz（UTC）で保存し、画面・メール・期限の判定はすべて日本時間（Asia/Tokyo）で扱う |
| 年度 | 4月始まり。fiscal\_year = 2026 は2026年4月〜2027年3月 |
| 金額 | 税込の整数（円）。計算の途中でも割り算をせず、端数を出さない |
| ID | 主キーはUUID。人が読む番号（注文番号など）は別のカラムに持つ |
| 名前 | テーブル・カラム・値は英語の snake\_case、画面とメールの文言は日本語 |
| （案） | 仕様書にない、実装のための決めごと。変えてよいが、変えたらこの文書も直す |
| 未決 | 仕様書で決まっていない値。仮の値で実装を進め、17章で管理する |

## 2. システム構成

画面と処理はNext.js（Vercel）、データと会員認証はSupabase、決済はStripe、メールはAmazon SESが受け持ち、決済以外のデータは東京リージョンに置きます。各サービスの契約名義はツチダ映像様とし、当社は管理者として参加する案です（17章）。

&#91;embedded content: システム構成 · 4つのサービスとつながり\]

外部のサービスとやりとりするのは Vercel 上のサーバー処理だけで、ブラウザから Supabase へ直接書き込むことはありません。

| 役割 | サービス | このサイトでの使い方 | リージョン・プラン |
| --- | --- | --- | --- |
| 画面・API・定期処理 | Vercel（Next.js App Router、TypeScript、Node.js 24） | 公開・会員・管理の画面、Webhookの受け口、Vercel Cronによる定期処理 | Functionsは東京（hnd1）、Pro |
| データベース・認証 | Supabase（PostgreSQL・Auth・RLS） | 全データ、会員と管理者のログイン、管理者のTOTP | 東京、Pro（毎日のバックアップを7日分） |
| 決済 | Stripe（Checkout・PaymentIntent・Refund・Webhook） | カード・コンビニ払い・PayPay・銀行振込と返金 | ツチダ映像様名義のアカウント |
| メール | Amazon SES ＋ SNS | 全メールの送信（確認番号を含む）、配信結果（バウンス・苦情）の通知 | 東京（ap-northeast-1）、本番利用の申請が必要 |
| ドメイン | t-eizou.com のサブドメイン（例：order.t-eizou.com） | サイトのURL、メールの送信元 | DNSの設定権限を共有してもらう |

| 環境 | URL | Supabase | Stripe | メール |
| --- | --- | --- | --- | --- |
| 本番 | order.t-eizou.com（未決） | 本番プロジェクト | 本番モード | 実際の宛先へ |
| テスト | Vercelのプレビュー用URL | 2つ目のプロジェクト（本番の個人情報は入れない） | テストモード | 開発者のアドレスだけに送る（案） |

主なライブラリ（案）：UIは Tailwind CSS と shadcn/ui、入力の検証は zod、DBの変更は Supabase CLI のマイグレーション、PDFは @react-pdf/renderer（日本語フォントは Noto Sans JP）、QRコードは qrcode、テストは Vitest と Playwright。

## 3. ロールと権限

ロールは4つで、会員が見られるのは自分の情報と、その年度につながっているお子さまが対象の行事だけです。書き込みはすべてサーバー側の処理を通し、ブラウザからDBへ直接は書かせません。

| ロール | 誰 | ログイン | 見られるもの | できること |
| --- | --- | --- | --- | --- |
| 訪問者 | だれでも | なし | 公開ページ（G01〜G13） | 問い合わせ、会員登録の開始 |
| 会員 | 保護者・祖父母など | メール＋パスワード（登録時に確認番号） | 自分の会員情報と注文、つながっているお子さま、そのお子さまが対象の行事と商品 | お子さまの登録、注文と支払い、締切前のキャンセル、領収書、設定の変更、退会 |
| 管理者 | ツチダ映像様のスタッフ（複数） | メール＋パスワード＋TOTP（2段階） | すべて | 管理画面の全機能 |
| 保守 | NORTIQLAB（個人ごとのアカウント） | 管理者と同じ | すべて（保守の目的に限る） | 管理画面の全機能。操作はすべて監査ログに残る |

- 全テーブルでRLSを有効にする。会員（authenticated）に許すのは SELECT だけで、行の条件は下の表のとおり
- INSERT・UPDATE・DELETE は、サーバー（Route Handler・Server Action）が secret key で行う。書く前に、ログイン中の会員がその行を扱えるかをサーバーで確かめる
- 管理の画面とAPIは、staff に有効な行があり、認証レベルが aal2（TOTP済み）のときだけ通す
- 公開ページは、サーバー側で settings の公開用の値（is\_public）だけを読む。anon ロールにはどのテーブルも開けない

| テーブル | 会員が SELECT できる行 |
| --- | --- |
| members | 自分（id = auth.uid()） |
| member\_children | 自分の行で、revoked\_at が空 |
| children・child\_enrollments | 自分とつながっているお子さまの行 |
| schools・classes | つながっているお子さまの在籍先 |
| events・products | 公開中で、can\_view\_event() が真の行（9.1） |
| orders・order\_items・shipments・refunds | 自分が注文したもの（orders.member\_id = auth.uid()）。家族の注文は見えない |
| それ以外（staff、audit\_logs、email\_messages、marketing\_consents、settings、stripe\_events、code\_attempts など） | 見られない |

## 4. URL設計

URLは公開・会員・管理・APIの4つに分け、ログインの確認はグループごとにミドルウェアで行います。ログインが必要なのは行事のページと「注文する」から先、マイページ、管理画面だけで、画面ごとのURLは5章にあります。

| グループ | パス | ログインの確認 |
| --- | --- | --- |
| 公開 | /、/guide、/products、/sample、/faq、/legal/*、/contact、/r、/signup、/verify、/login、/password/*、/unsubscribe、/payment/return | なし |
| 会員 | /events/*、/orders/*、/mypage/\* | 会員としてログイン済み。未ログインは /login?next=（元のURL）へ |
| 管理 | /admin/\*（/admin/login を除く） | staff に有効な行があり、認証レベルが aal2 |
| API | /api/webhooks/stripe、/api/webhooks/ses、/api/cron/*、/api/admin/* | Stripe・SNSの署名、CRON\_SECRET、管理者のセッション |

- 登録コードのQRは https://order.t-eizou.com/r?openExternalBrowser=1#（コード）。コードを # 以降に置き、サーバーのログやリファラーに残さない
- /r はブラウザでコードを読み、sessionStorage に一時保存して会員登録・ログインへ進む。ログイン後に M08 で入力済みにし、POST で送る（案）
- openExternalBrowser=1 は、LINEのアプリ内ブラウザで開かれたときに標準のブラウザで開き直す指定。# 以降が引き継がれるかは実機で確かめる
- 告知文やチラシのURLにも openExternalBrowser=1 を付ける。LINE以外のアプリ内ブラウザでは、ログインの前に「Safari／Chromeで開く」案内を出す
- next に入れてよいのは、自サイトの相対パスだけ（外部への転送を防ぐ）
- 注文のURLには人が読める注文番号（例：T0001234）を使い、その注文の持ち主かどうかはサーバーで確かめる
- 決済の戻り先は /payment/return?session\_id={CHECKOUT\_SESSION\_ID}。ログインなしでも開け、出すのは「支払い完了／支払い待ち」と「詳しくはメールをご確認ください」だけ。PayPayアプリから別のブラウザに戻った場合の対策

## 5. 画面一覧

画面は公開13・会員9・管理18の計40画面です。見本（G04）と行事のページ（M02）は同じ部品で作り、見本だけ架空のデータを流します。

**公開（ログイン不要）**

| ID | 画面 | URL | 主な要素と操作 |
| --- | --- | --- | --- |
| G01 | トップ | / | サイトの説明、ご利用の流れ・商品と価格・FAQへのリンク、問い合わせ先と受付時間、スナップスナップの写真ページへのリンク、ログイン・会員登録。Stripeに登録するURLはここ |
| G02 | ご利用の流れ | /guide | 登録コード→会員登録→注文→支払い→お届け。支払い方法ごとの払い方と期限 |
| G03 | 商品と価格 | /products | 行事の種類ごとの収録例・時間の目安・ディスクとケースの仕様・再生機器の注意、標準の価格（税込）・2枚目以降・締切後の価格、送料、お届けの時期、受け取り方法。中身は settings |
| G04 | 見本の商品ページ | /sample | M02と同じ部品で、架空の行事と子どもが写らない見本画像。「注文する」はログインへ |
| G05 | よくある質問 | /faq | 登録コード、メールが届かないとき、支払い方法、キャンセル・交換、行事を在籍のご家庭に限る理由 |
| G06 | 規約類 | /legal/tokushoho、/legal/terms、/legal/privacy、/legal/cancel | 特商法の表記、利用規約、プライバシーポリシー、キャンセル・交換の規定。文面は settings |
| G07 | お問い合わせ | /contact | 名前・メール・内容（ログイン中は注文を選べる）。ツチダ映像様の受信アドレスにメールで届く（DBには保存しない。案） |
| G08 | 登録コードの入口 | /r | # のコードを読み、未ログインなら G09、ログイン済みなら M08 へ |
| G09 | 会員登録 | /signup | メール、パスワード、氏名・ふりがな、電話、規約への同意、お知らせの受信同意（別のチェック欄）。送信で確認番号を送る |
| G10 | 確認番号の入力 | /verify | 6桁の入力、再送（60秒あける）、有効期限1時間。完了後に、ツチダ映像様のアドレスからのメールを受け取れるようにする案内 |
| G11 | ログイン・パスワード再設定 | /login、/password/reset | 再設定も確認番号で行う |
| G12 | 配信停止 | /unsubscribe | 署名付きリンクで、ログインなしでお知らせを止める |
| G13 | 決済からの戻り先 | /payment/return | 支払い完了／支払い待ちの表示だけ（4章）。ログイン中なら M05 へ |

**会員（ログインが必要）**

| ID | 画面 | URL | 主な要素と操作 |
| --- | --- | --- | --- |
| M01 | 販売中の行事 | /events | つながっているお子さまが対象の行事（締切・受け取り方法・お子さまの名前）。お子さまがいなければ M08 へ案内 |
| M02 | 行事のページ | /events/\[eventId\] | ジャケット画像、収録内容、DVD・Blu-rayの価格、締切、受け取り方法、お届け予定、再生機器の注意、「注文する」。受付が終わったら「受付終了」 |
| M03 | 注文手続き | /events/\[eventId\]/order | 商品×お子さまごとの枚数、受け取り方法（選択制のとき）、お届け先（郵送のとき。会員の住所を初期値）、支払い方法（settings で有効なもの） |
| M04 | 最終確認 | /events/\[eventId\]/order/confirm | 明細ごとのお子さまの名前と学年・クラス、数量・金額、送料、合計、支払いの時期と方法、お届けの時期、申込みの期限、キャンセルと返品の条件（特商法12条の6）。「注文を確定して支払う」で Stripe へ |
| M05 | 注文完了 | /orders/\[orderNo\]/complete | 注文番号と内容。コンビニ払い・銀行振込は払い方と期限 |
| M06 | 注文履歴 | /mypage | 注文の一覧と状態（8章の表示） |
| M07 | 注文の詳細 | /mypage/orders/\[orderNo\] | 明細・状態・追跡番号、締切前のキャンセル（明細ごと、支払い待ちは注文ごと）、領収書PDF |
| M08 | お子さまの登録 | /mypage/children | 登録コードの入力（1人目は氏名・ふりがな、家族の2人目以降は氏名の一致）、新年度のコード（どのお子さまのコードかを選ぶ）、お子さまごとのつながっているアカウントの数 |
| M09 | 会員情報・設定 | /mypage/settings | 氏名・電話・住所、メールアドレスの変更（確認番号）、パスワード、お知らせの受信（同意・停止）、退会 |

**管理（管理者・保守。TOTP必須）**

| ID | 画面 | URL | 主な要素と操作 |
| --- | --- | --- | --- |
| A00 | ログイン | /admin/login | メール＋パスワード、TOTPの登録と入力 |
| A01 | ダッシュボード | /admin | 販売中の行事、今日の注文数、支払い待ちの件数、締切が近い行事、メールが届いていない会員の数 |
| A02 | 学校・園 | /admin/schools | 登録・編集（名前、種別、住所、メモ）、年度ごとの学年・クラス名と人数 |
| A03 | 登録コード | /admin/codes | クラスごとに人数分を発行、カードPDF、使用状況（未使用・使用中・つながっている数）、再発行・無効化、つながりの解除、予備コード |
| A04 | 年度の切り替え | /admin/years | 前年のクラスをコピー、新しいコードの発行、入力のお願いメールの日付 |
| A05 | 行事 | /admin/events、/admin/events/\[eventId\] | 行事の項目、商品と価格、対象の学年・クラス、公開・非公開、前年からコピー、締切の延長（お知らせの有無）、行事・商品の中止 |
| A06 | 案内チラシ・告知文 | /admin/flyers | 行事ごとのA4チラシPDF、連絡アプリに貼る告知文とURL |
| A07 | 注文一覧 | /admin/orders | 行事・学校・園・クラス・状態・支払い方法で絞り込み、名前・メール・注文番号で検索 |
| A08 | 注文の詳細 | /admin/orders/\[orderNo\] | 明細ごとの取り消し・返金、交換対応の記録（交換品の発送日）、メモ、現金の入金確認 |
| A09 | 代理注文 | /admin/orders/new | 電話・紙の注文を作る。コンビニ払いの払込票・銀行振込の振込先を印刷。移行期間は現金も |
| A10 | 集計・制作 | /admin/production | 行事・商品ごとの本数、本数の確定の表示、「制作中」へ一括変更。締切後の注文は別に集計 |
| A11 | 仕分け | /admin/sorting | クラス別・名前順の仕分けリスト（PDF・CSV）、お届けラベル、納品書、「納品済み」へ一括変更 |
| A12 | 発送 | /admin/shipping | 宛名ラベル・宛名CSV、追跡番号CSVの取り込み、「発送済み」へ一括変更 |
| A13 | 会員 | /admin/members、/admin/members/\[memberId\] | 検索と閲覧（登録内容・つながっているお子さま・注文履歴）、メールが届いていない会員の一覧、つながりの解除 |
| A14 | メール | /admin/mail | テンプレートの編集、送信予定と送信履歴、届かなかったメールと配信停止の状況、個別のお知らせ |
| A15 | 売上 | /admin/sales | 行事別・学校・園別・月別の売上と本数、注文の割合、会計ソフト用CSV |
| A16 | 設定 | /admin/settings | 管理者アカウント、送料の初期値、支払い方法のオン・オフ、つなげるアカウント数、事業者情報と規約類の文面、問い合わせの受信アドレス、新年度メールの日付 |
| A17 | 操作の記録 | /admin/audit | 誰がいつ何をしたか（注文の状態・返金・コードの再発行・つながりの解除・設定） |

## 6. 主要フロー

保護者の操作は「QRから登録」と「行事ごとの注文」の2本で、注文は支払い方法によって「支払い済み」に直行するか「支払い待ち」を経由するかが分かれます。

### 6.1 初回登録（QRコードから）

1. QRを読む → G08（/r）がコードを一時保存する。LINEなら標準のブラウザで開き直す
2. 未ログインなら G09 で会員登録 → 確認番号メール → G10 で入力。members を作り、お知らせに同意した人は marketing\_consents に grant を記録する
3. M08 をコードが入った状態で開き、コードの状態で分かれる
   - 未使用：お子さまの氏名・ふりがなを入力 → children・child\_enrollments・member\_children を作り、コードを「使用中」にする（1つのトランザクション）
   - 使用中（家族が先に登録済み）：ふりがなの一致を確かめて（9.9）member\_children を作り、先につながっていた会員へ account\_linked を送る
   - 無効・存在しない：エラーにし、失敗の回数を数える（14章）
4. next があればそこへ、なければ M01 へ戻る

### 6.2 注文と支払い

1. M01 → M02 →「注文する」→ M03 で入力 → M04 で最終確認
2. 「注文を確定して支払う」で、サーバーが受付の条件（9.1）と金額（9.2）を計算し直し、orders（draft）と order\_items を作って Stripe Checkout へ送る
3. 支払い方法で分かれる（下の図）。カード・PayPay は完了した時点で paid、コンビニ払い・銀行振込は pending を経て入金で paid、途中でやめたものは消える
4. カード・PayPay は Stripe から G13 に戻り、ログイン中なら M05 を表示する。コンビニ払い・銀行振込は Stripe の払込票・振込先のページに移り、サイトには戻らない（案内はメールで送る）。状態の更新は戻り先ではなく Webhook で行う

&#91;embedded content: 注文と支払い · 支払い方法で分かれる流れ\]

状態はどれも Webhook で進み、戻り先のページ（G13）では状態を変えません。期限切れの扱いは9.3と定期処理の J4 のとおりです。

### 6.3 新年度の切り替え（毎年4月）

1. 管理者が A04 で前年のクラスをコピーして新年度のクラスを作り、人数分のコードを発行・印刷して、学校・園で配ってもらう
2. 設定した日に、定期処理（J7）が全会員へ new\_year\_code を送る
3. 会員が M08 で新しいコードを入力し、どのお子さまのコードかを選ぶ。未使用ならそのお子さまに新年度の child\_enrollments と member\_children を作る。家族が先に入力していれば、ふりがなの一致でつながる
4. 新しいコードが配られない卒園・卒業のお子さまは、新年度の行事が見えない。在籍した年度の行事は、販売期間が終わるまで買える

### 6.4 代理注文（電話・紙）

1. 管理者が A09 で、行事、お子さま（学校・園、学年・クラス、氏名・ふりがな）、商品と枚数、受け取り方法、注文者の連絡先を入力する
2. お子さまは、同じクラスでふりがなが一致する children があればそれを使い、なければ会員とつながらない children を作る（案）
3. 支払いはコンビニ払い・銀行振込（移行期間は現金も）。コンビニ払い・銀行振込はサーバーで PaymentIntent を作り、払込票・振込先を印刷して渡す（10章）
4. 現金は、入金を確認した時点で管理者が paid にする
5. 代理注文（orders.channel = 'proxy'）も、ネットの注文と一緒に集計・仕分けされる

## 7. データモデル

お子さま（children）を中心に、年度ごとの在籍（child\_enrollments）と会員とのつながり（member\_children）を分けて持ち、注文の明細はお子さま単位で作ります。登録コードは「その年度の在籍に加わるための鍵」で、コードを無効にしても、すでにつながった会員はそのままです。

&#91;embedded content: ER図 · 主な11テーブル\]

会員は年度ごとに member\_children でお子さまとつながり、注文の明細（order\_items）は注文した会員ではなくお子さまを指すので、家族が別々に注文しても仕分けは1人分にまとまります。

| テーブル | 主なカラム | 制約・メモ |
| --- | --- | --- |
| schools | id, name, kind, address, memo, created\_at, updated\_at | kind：preschool（園）／elementary（小学校） |
| classes | id, school\_id, fiscal\_year, grade\_label, grade\_order, name, capacity | unique(school\_id, fiscal\_year, grade\_label, name)。capacity はコードの発行数 |
| registration\_codes | id, code, serial\_no, class\_id, child\_id（null可）, status, purpose, issued\_at, revoked\_at, replaced\_by | code は unique。status：unused／active／revoked。purpose：normal／spare（予備）／review（審査用） |
| children | id, full\_name, full\_name\_kana, name\_key, created\_at | name\_key は照合用に正規化したふりがな（9.9） |
| child\_enrollments | id, child\_id, fiscal\_year, class\_id, registration\_code\_id, created\_at | unique(child\_id, fiscal\_year)。その年度の在籍 |
| members | id（= auth.users.id）, email, full\_name, full\_name\_kana, phone, postal\_code, address, marketing\_opt\_in, email\_status, email\_status\_at, stripe\_customer\_id, withdrawn\_at, created\_at, updated\_at | email\_status：ok／bounced／complained。stripe\_customer\_id は銀行振込で使う |
| member\_children | id, member\_id, child\_id, fiscal\_year, registration\_code\_id, linked\_at, revoked\_at, revoked\_by | revoked\_at が空の行で unique(member\_id, child\_id, fiscal\_year)。年度ごとのつながり |
| marketing\_consents | id, member\_id, action, source, wording\_version, created\_at | action：grant／revoke。追記のみ（更新・削除しない） |
| events | id, school\_id, fiscal\_year, name, held\_on, sale\_starts\_at, deadline\_at, delivery\_method, shipping\_fee（null可）, delivery\_note, late\_enabled, late\_until, late\_delivery\_note, jacket\_image\_path, contents, status, sale\_start\_notified\_at, production\_fixed\_at, late\_production\_fixed\_at, created\_at, updated\_at | delivery\_method：school／mail／either。status：draft／published／canceled。shipping\_fee が null なら設定の初期値 |
| event\_targets | event\_id, class\_id | 主キーは2列。学年で選んだらその学年の全クラスを入れる |
| event\_deadline\_changes | id, event\_id, old\_deadline\_at, new\_deadline\_at, notify, changed\_by, created\_at | 締切の延長の履歴 |
| products | id, event\_id, kind, media, name, price, second\_price（null可）, late\_price（null可）, status, sort\_order | kind：disc／data。media：dvd／bluray／photo\_data。status：on\_sale／canceled |
| product\_targets | product\_id, class\_id | 行がない商品は、行事の対象と同じ |
| orders | id, order\_no, event\_id, member\_id（null可）, channel, is\_late, delivery\_method, ship\_name, ship\_postal\_code, ship\_address, ship\_phone, buyer\_name, buyer\_kana, buyer\_phone, buyer\_email, payment\_method, payment\_status, subtotal, shipping\_fee, total, amount\_received, payment\_due\_at, paid\_at, canceled\_at, cancel\_reason, stripe\_checkout\_session\_id, stripe\_payment\_intent\_id, created\_by, memo, created\_at, updated\_at | order\_no は unique（T＋7桁、案）。channel：web／proxy。payment\_method：card／konbini／paypay／bank\_transfer／cash。payment\_status は8章。amount\_received は銀行振込の入金済み額。buyer\_\* は代理注文の注文者 |
| order\_items | id, order\_id, product\_id, child\_id, class\_id, grade\_label\_snapshot, class\_name\_snapshot, quantity, amount, fulfillment\_status（null可）, canceled\_at, exchange\_note, exchange\_shipped\_at, photo\_id（null可）, created\_at | amount は行の金額（9.2の配分）。注文時点の学年・クラスを写して持つ。photo\_id は来年度用 |
| refunds | id, order\_id, amount, reason, item\_ids, method, stripe\_refund\_id, status, created\_by, created\_at | method：stripe／manual（現金）。status：pending／succeeded／failed |
| shipments | id, order\_id, kind, shipped\_at, tracking\_no, carrier, created\_at | kind：original／exchange（交換品） |
| email\_templates | key, subject, body, is\_marketing, updated\_by, updated\_at | 主キーは key（11章）。確認番号メールは Supabase Auth 側のテンプレート |
| email\_messages | id, template\_key, to\_email, member\_id, order\_id, event\_id, dedupe\_key, status, ses\_message\_id, error, queued\_at, sent\_at | dedupe\_key は unique。status：queued／sent／delivered／bounced／complained／failed |
| staff | user\_id（= auth.users.id）, name, role, active, created\_at | role：admin（ツチダ映像様）／maintainer（当社） |
| audit\_logs | id, actor\_id, action, target\_type, target\_id, detail（jsonb）, created\_at | 追記のみ |
| settings | key, value（jsonb）, is\_public, updated\_by, updated\_at | 送料の初期値、支払い方法のオン・オフ、つなげるアカウント数、事業者情報、規約類の文面など |
| stripe\_events | id（StripeのイベントID）, type, received\_at, processed\_at, error | Webhookの二重処理を防ぐ（10章） |
| code\_attempts | id, member\_id, ip\_hash, succeeded, created\_at | 登録コードの総当たり対策（14章） |

- 型の決めごと：id は uuid（gen\_random\_uuid()）、\*\_at は timestamptz、金額と枚数は integer、列挙の値は text ＋ check 制約。\_id で終わる列は外部キー
- 履歴を崩さないため、注文・明細・返金・同意・監査ログは物理削除しない（決済前に消える draft の注文だけは削除する）
- 主な索引：orders(event\_id, payment\_status)、orders(member\_id)、order\_items(order\_id)、order\_items(child\_id)、member\_children(child\_id, fiscal\_year)、child\_enrollments(class\_id)、email\_messages(dedupe\_key)

## 8. 状態遷移

支払いの状態は注文（orders.payment\_status）に、お届けの状態は明細（order\_items.fulfillment\_status）に持ち、状態を変えるのはWebhook・定期処理・画面の操作だけです。どの更新も、今の状態からその遷移が許されるときだけ通る条件付きUPDATE（WHERE payment\_status = '…'）で書きます。

&#91;embedded content: 状態遷移 · 支払いとお届け\]

点線は今回は残らない行（削除）と、来年度のデータ商品です。それぞれの遷移のきっかけと処理する場所は下の表にあります。

**支払いの状態（注文ごと）**

| 遷移 | きっかけ | 処理する場所 |
| --- | --- | --- |
| （なし）→ draft | 「注文を確定して支払う」 | M04 のサーバー処理 |
| draft → paid | カード・PayPay の Checkout 完了 | Webhook |
| draft → pending | コンビニ払い・銀行振込の Checkout 完了（未入金） | Webhook |
| draft →（削除） | Checkout の期限切れ、作成から2時間たった draft | Webhook・J6 |
| pending → paid | 全額の入金 | Webhook |
| pending → canceled | 支払期限切れ、会員の取り消し（注文ごと）、管理者の取り消し | J4・Webhook・M07・A08 |
| paid → partially\_refunded | 一部の明細の取り消しと差額の返金 | M07・A08・A05（中止） |
| paid・partially\_refunded → refunded | 残りの明細をすべて取り消して返金 | M07・A08・A05（中止） |
| （代理注文）→ pending | 払込票・振込先の発行 | A09 |
| （代理注文）pending → paid | Stripe の入金、または現金の入金確認 | Webhook・A08 |

**お届けの状態（明細ごと）**

| 遷移 | きっかけ | 処理する場所 |
| --- | --- | --- |
| （null）→ accepted | 注文が paid になった | Webhook・A08（現金） |
| accepted → in\_production | 本数の確定後、管理者が一括で変更 | A10 |
| in\_production → delivered | 学校・園に届けた | A11 |
| in\_production → shipped | 追跡番号を取り込んだ | A12 |
| accepted・in\_production → canceled | 締切前のキャンセル、管理者の取り消し、行事・商品の中止 | M07・A08・A05 |
| （null）→ provided | データ商品の支払い（来年度） | Webhook |

- 支払い待ちの間、明細の fulfillment\_status は null。本数の集計では、確定までは pending の明細も「見込み」として別に数える
- 交換は状態を変えず、exchange\_note・exchange\_shipped\_at と shipments（kind = exchange）に残す
- refunded・canceled・delivered・shipped・provided は終わりの状態で、そこから先へは動かさない

**マイページの表示**

| 表示 | 状態の組み合わせ |
| --- | --- |
| お支払い待ち（○月○日まで） | pending |
| ご注文を受け付けました | paid ＋ accepted |
| 制作中 | paid ＋ in\_production |
| 学校・園にお届けしました | delivered |
| 発送しました（追跡番号） | shipped |
| 取り消し | canceled（支払いの前） |
| 取り消し（返金済み） | 明細が canceled ＋ 注文が refunded または partially\_refunded |

## 9. 業務ルールと計算

金額・期限・可否の判定は、サーバーの共通関数（calcOrder、canViewEvent、canOrder など）の1か所だけで行い、画面・Checkout・取り消し・定期処理のすべてで同じ関数を使います。ブラウザから送られた金額は信用せず、必ず計算し直します。

### 9.1 見られる・注文できる条件

- 見られる（canViewEvent）：行事が published で、会員にその行事の年度の member\_children（revoked\_at が空）があり、そのお子さまの同じ年度の child\_enrollments.class\_id が event\_targets に入っていること。RLS でも同じ条件を SQL 関数 can\_view\_event() で使う
- 注文できる（canOrder）：見られることに加えて、通常は sale\_starts\_at ≤ 今 ≤ deadline\_at。締切後は late\_enabled が真で deadline\_at < 今 ≤ late\_until、受け取りは郵送だけ
- 商品：status が on\_sale。product\_targets がある商品は、お子さまのクラスが入っていること
- 支払い方法：settings で有効なもの。コンビニ払いは合計120円以上30万円以下、銀行振込はその会員に支払い待ちの銀行振込がないときだけ
- M01 には注文できる行事を出す。受付が終わった行事は M02 で「受付終了」と出し、過去の注文はマイページで見られる

### 9.2 金額（calcOrder）

1. 単価：通常の注文は price、締切後の注文は late\_price（2枚目以降の価格は使わない。未決）
2. 2枚目以降：同じ商品の枚数を注文全体で数え、1枚目は price、2枚目からは second\_price（null なら price）
3. 行への配分：明細を作った順に並べ、商品ごとの1枚目を最初の行に割り当てる。行の金額（amount）＝その行の枚数分の単価の合計
4. 送料：受け取りが郵送で、ディスク（kind = disc）の明細があれば events.shipping\_fee（null なら settings の初期値）。学校・園での受け取りは0円
5. 合計＝行の金額の合計＋送料

例（金額は説明用）：DVD 3,000円・2枚目以降2,500円で、お子さまAの分1枚、お子さまBの分2枚を学校・園で受け取る → Aの行3,000円、Bの行5,000円、合計8,000円。

### 9.3 支払い期限（コンビニ払い・銀行振込）

- 期限＝注文日の3日後の23:59（日本時間）。ただし、締切日（締切後の注文は受付期限の日）の2日後の23:59を超えない
- 日数 N＝min(3, 締切日＋2日 − 注文日)。受付は締切までなので、N は必ず2以上になる
- コンビニ払いは Checkout の expires\_after\_days に N を入れる（Stripe 側もその日の23:59:59に失効する）
- 銀行振込は Stripe 側に期限がないので、J4 が期限を過ぎた PaymentIntent を取り消す
- 銀行振込の不足：pending のまま amount\_received を記録し、期限前日のお知らせで残額を伝える。多すぎた分は管理画面から返す
- 締切を延ばしても、発行済みのコンビニの払込票の期限は変わらない

### 9.4 本数の確定

- 通常の注文：締切日の2日後の23:59を過ぎた最初の定期処理で production\_fixed\_at を記録する。その時点で支払い待ちの注文は、すべて入金済みか取り消しになっている
- 締切後の注文：受付期限の日の2日後の23:59で late\_production\_fixed\_at を記録する
- 確定後に管理者が A10 で「制作中」へ一括で変える。確定前の A10 は、accepted の本数と pending の見込みを分けて出す

### 9.5 キャンセルと差額の返金

| 誰が | いつまで | 単位 | お金 |
| --- | --- | --- | --- |
| 会員（支払い済みの注文） | 締切まで（締切後の注文は受付期限まで） | 明細ごと | 取り消し後の内容で calcOrder をやり直し、差額を返金 |
| 会員（支払い待ちの注文） | 同上 | 注文ごと（払込票の金額を変えられないため） | 返金なし。PaymentIntent を取り消す |
| 管理者 | いつでも | 明細・注文・行事・商品 | 差額または全額を返金 |

- 全部の明細を取り消したら送料も返し、payment\_status は refunded にする
- 返金は Stripe の Refund を差額で1件作る。カード・PayPay は元の支払い方法へ（PayPay は購入から365日以内）。コンビニ払い・銀行振込は、Stripe がお客様に返金先の口座を聞くメールを送る（1件250円＋税）
- 返金しても元の決済手数料は戻らない。現金の注文は Stripe を使わず、refunds.method = manual で記録する

### 9.6 締切の延長と行事の中止

- 延長：deadline\_at を上書きし、event\_deadline\_changes に記録する。定期処理は毎回 deadline\_at から判定するので、締切前のお知らせ・本数の確定・新しい注文の支払い期限は自動で計算し直される。延長のお知らせ（deadline\_extended）を送るかは管理者が選ぶ
- 中止：行事または商品ごとに、取り消し以外の明細をすべて canceled にし、支払い済みは返金、支払い待ちは取り消して、event\_canceled を送る

### 9.7 「まだ注文していない」の判定

- お子さま単位で判定する。その行事で、そのお子さまの明細（canceled 以外）を含む注文が paid または pending なら「注文済み」。だれの注文かは問わない
- 締切前のお知らせ（D-3・D-1・延長・締切後受付）の宛先：対象のクラスのお子さまにつながる会員のうち、marketing\_opt\_in が真で、つながっているお子さまに「注文済みでない」お子さまが1人でもいる人（案。17章）
- email\_status が ok 以外の会員には送らず、管理画面の「メールが届いていない会員」に出す

### 9.8 登録コード

- 12文字の Crockford Base32（0〜9と、I・L・O・U を除く英字。約60ビット）。カードには4文字ずつハイフンで区切って印字する（案）
- 入力は大文字にし、ハイフンと空白を除き、O を0、I と L を1に読み替えてから照合する
- 紛失：A03 で古いコードを revoked にし、同じお子さま・年度の新しいコード（status = active、child\_id 入り）を発行する。すでにつながっている会員はそのまま

### 9.9 お子さまとアカウントのつながり

- ふりがなの照合キー（name\_key）：NFKC で正規化 → カタカナをひらがなに → 空白を除く
- 未使用のコード（1人目）：会員が「新年度のコード」としてお子さまを選べばそのお子さまにつなぐ。選ばなければ新しい children を作る
- 新しく作る前に、同じ学校・園の前年度に同じ name\_key のお子さまが1人だけいて、今年度の在籍がまだなければ、そのお子さまにつなぐ（同じお子さまを2件作らないため。案）
- 使用中のコード（2人目以降）：入力したふりがなの name\_key がコードのお子さまと一致すればつなぐ。一致しなければ失敗として数える
- 上限：同じお子さま・年度の有効な member\_children が settings.max\_accounts\_per\_child（案：3）に達していたらつながない
- つながったら、同じお子さま・年度に先につながっていた会員へ account\_linked を送る
- 管理者は A03・A13 でつながりを解除できる（revoked\_at・revoked\_by を入れ、監査ログに残す）

## 10. 決済連携（Stripe）

会員の注文は Stripe Checkout（Stripe の決済画面）、代理注文は PaymentIntent を直接作り、支払いの確定・入金・失効・返金はすべて Webhook で反映します。カード情報はサイトを通らず、Stripe に渡す個人情報は注文者の氏名とメールまでで、お子さまの名前は渡しません。

### 10.1 Checkout Session の作り方

- payment\_method\_types には、M03 で選んだ支払い方法を1つだけ入れる（画面の選択と Stripe の表示を一致させるため）
  - 【実装時の注記 2026-11】Stripe API 2026-09-30 以降、この項目は allowed\_payment\_method\_types に名前が変わった（Checkout Session・PaymentIntent とも）。実装は新しい名前で作っている（Stripe SDK 23.1.0、API 2026-10-28）
- 共通：mode = payment、locale = ja、customer\_email は会員のメール、metadata に order\_id と order\_no、expires\_at は作成から30分（設定できる最短の値。案）、作成時の Idempotency-Key は order\_id
- line\_items は明細ごとに1行（名前は「運動会 DVD（2枚）」のように商品と枚数だけ、unit\_amount = 行の金額、quantity = 1）と、送料の1行
- success\_url は /payment/return?session\_id={CHECKOUT\_SESSION\_ID}、cancel\_url は M04

| 支払い方法 | payment\_method\_types | 支払い方法ごとの設定 | Checkout 完了時 |
| --- | --- | --- | --- |
| カード（Apple Pay・Google Pay を含む） | card | 3Dセキュアは Stripe が判定する | paid |
| PayPay | paypay | なし。PayPay 側の承認は遷移から5分、Stripe 側の試行は1時間で失効する | paid |
| コンビニ払い | konbini | payment\_method\_options.konbini.expires\_after\_days = 9.3 の N（1〜60。その日の23:59:59 JST に失効） | pending。払込票のページ（hosted\_voucher\_url）に移り、success\_url には戻らない |
| 銀行振込 | customer\_balance | customer（members.stripe\_customer\_id。なければ作る）が必須。payment\_method\_options.customer\_balance = { funding\_type: bank\_transfer, bank\_transfer: { type: jp\_bank\_transfer } } | pending。振込先のページ（hosted\_instructions\_url）に移る |

### 10.2 Webhook で受けるイベント

| イベント | 処理 |
| --- | --- |
| checkout.session.completed（payment\_status = paid） | draft → paid、明細を accepted、paid\_at を記録。order\_completed を送る |
| checkout.session.completed（payment\_status = unpaid） | draft → pending。PaymentIntent の next\_action から払込票のURL（konbini\_display\_details.hosted\_voucher\_url）または振込先（display\_bank\_transfer\_instructions）を読み、payment\_instructions を送る |
| checkout.session.async\_payment\_succeeded | pending → paid、明細を accepted。payment\_received を送る |
| checkout.session.async\_payment\_failed | pending → canceled（コンビニの払込票の失効など）。order\_auto\_canceled を送る |
| checkout.session.expired | draft の注文を削除する（注文に数えない） |
| payment\_intent.partially\_funded | 銀行振込の不足。amount\_received を更新する（イベント名は実装時に確認） |
| payment\_intent.succeeded／payment\_failed／canceled | 代理注文（Checkout を使わない注文）の paid／canceled |
| refund.updated／refund.failed | refunds.status を更新。failed は管理画面に出し、別の方法で返す |
| charge.dispute.created | カードのチャージバック。管理画面に出し、ツチダ映像様へメールで知らせる（案） |

- 受け取ったら署名を検証し、stripe\_events に event.id を INSERT する。重複なら何もせず 200 を返す
- 処理に失敗したら error を記録して 500 を返す（Stripe が再送する）。J8 が失敗を保守担当に知らせる
- イベントの順番は保証されない。状態は8章の条件付き UPDATE で進め、必要なら Stripe から最新の状態を取り直す
- コンビニ払いは、失効の直前に発行された払込票で失効後に支払われることがあるため、J4 では取り消さず async\_payment\_failed を待つ
- 取り消した注文に入金の通知が来たら、状態を自動で戻さず、管理画面に「要対応」として出す（案）

### 10.3 代理注文（Checkout を使わない）

- コンビニ払い：サーバーで PaymentIntent（konbini、expires\_after\_days）を作り、注文者の氏名とメールを billing\_details に入れて確定する。next\_action.konbini\_display\_details の払込票（店ごとの払込番号と確認番号）を印刷して渡す。メールがない注文者の扱いは未決（17章）
- 銀行振込：注文者ごとに Stripe の顧客を作り、PaymentIntent（customer\_balance、jp\_bank\_transfer）を確定して、next\_action.display\_bank\_transfer\_instructions の振込先を印刷して渡す
- 現金：Stripe を使わない

### 10.4 返金

- Refund を差額で作る（payment\_intent、amount、metadata に order\_id と refund\_id、Idempotency-Key は refund\_id）
- カードは元のカードへ。PayPay は365日以内で、すぐに返る
- コンビニ払い・銀行振込は、Stripe が注文者のメールに口座の入力を頼み、入力後に振り込む。45日入力がなければ failed（refund.failed）になり、Stripe 以外の方法で返す。返金1件ごとに手数料がかかる
- 銀行振込で多く払われた分は、顧客の残高に残る。75日照合されなければ Stripe が返金を試みるので、その前に管理画面から返す

参考：[Stripe コンビニ払い（Checkout）](https://docs.stripe.com/payments/konbini/accept-a-payment?payment-ui=checkout)、[Stripe コンビニ払いの概要](https://docs.stripe.com/payments/konbini)、[Stripe 銀行振込（Checkout）](https://docs.stripe.com/payments/bank-transfers/accept-a-payment?payment-ui=checkout)、[Stripe 銀行振込と顧客残高](https://docs.stripe.com/payments/bank-transfers)、[Stripe PayPay](https://docs.stripe.com/payments/paypay)

## 11. メール

メールはすべて Amazon SES から送り、お知らせ（広告に当たるもの）は同意した会員だけに、配信停止のリンクと送信者の名称・住所を付けて送ります。送信は email\_messages に1通1行で記録し、dedupe\_key で二重送信を防ぎます。

| キー | 送るとき | 宛先 | 種別 |
| --- | --- | --- | --- |
| auth（Supabase Auth のテンプレート） | 会員登録・パスワード再設定・メールアドレスの変更 | 手続きをした人 | 取引 |
| account\_linked | 2人目以降のアカウントがつながった | 同じお子さま・年度に先につながっていた会員 | 取引 |
| sale\_started | 行事の販売開始日時 | 対象のお子さまにつながる会員 | お知らせ |
| deadline\_d3 | 締切の3日前 | 9.7 の宛先 | お知らせ |
| deadline\_d1 | 締切の前日 | 9.7 の宛先 | お知らせ |
| deadline\_extended | 締切を延ばし、送ると選んだとき | 9.7 の宛先 | お知らせ |
| late\_order\_open | 締切後の受付を管理者が知らせるとき | 9.7 の宛先 | お知らせ |
| order\_completed | カード・PayPay の支払い完了 | 注文者 | 取引 |
| payment\_instructions | コンビニ払い・銀行振込の注文（払込票のURL・振込先と期限） | 注文者 | 取引 |
| payment\_due\_reminder | 支払期限の前日 | 未入金の注文者（不足があれば残額） | 取引 |
| payment\_received | 入金の確認 | 注文者 | 取引 |
| order\_auto\_canceled | 支払期限切れの取り消し | 注文者 | 取引 |
| order\_canceled | キャンセル・返金の処理（明細ごとを含む） | 注文者 | 取引 |
| event\_canceled | 行事・商品の中止と返金 | 注文者 | 取引 |
| shipped | 発送済みにした（追跡番号つき） | 郵送の注文者 | 取引 |
| delivered\_to\_school | 学校・園に納品済みにした | 学校・園で受け取る注文者 | 取引 |
| new\_year\_code | 毎年4月の設定日 | 全会員 | 取引（手続きのお願い） |
| admin\_message | 管理者の個別のお知らせ | 選んだ会員 | 管理者が選ぶ |

- order\_completed と payment\_received には、前払いの通信販売で求められる事項（特商法13条：申込みを受けた旨、事業者の名称・住所・電話、受け取った金額と日、商品と数量、お届けの時期）を入れる。文面は弁護士が確認中
- お知らせには、送信者（ツチダ映像様）の名称・住所、配信停止のリンク（署名付き、ログイン不要）、問い合わせ先を入れ、List-Unsubscribe と List-Unsubscribe-Post（ワンクリック停止）のヘッダーも付ける（案）
- 文面は email\_templates に持ち、管理画面で編集できる。差し込みは {{school\_name}}、{{event\_name}}、{{deadline}}、{{order\_no}}、{{order\_lines}}、{{total}}、{{payment\_due}}、{{tracking\_no}}、{{unsubscribe\_url}} など。差し込む値がなければ送らずにエラーを記録する（案）
- 送信の時刻：D-3・D-1・支払期限の前日は、その日の9時以降の最初の実行で送る。販売開始は、sale\_starts\_at が21時〜翌8時なら翌朝8時に送る（案）
- 確認番号メール：Supabase Auth のテンプレートに {{ .Token }}（6桁）だけを入れ、リンクは載せない。有効期限は1時間

**SES の設定**

- 送信元のドメイン（例：order.t-eizou.com）を SES の ID にし、Easy DKIM、カスタム MAIL FROM ドメイン（SPF）、t-eizou.com の DMARC（最初は p=none）を設定する
- 設定セットを作り、Bounce・Complaint・Delivery・Reject を SNS のトピックへ送る。SNS から /api/webhooks/ses に HTTPS で届け、署名を検証する
- 送信元の ID に既定の設定セットを紐づけ、Supabase Auth（SMTP）経由の確認番号メールも同じように記録されるようにする
- アカウントの送信停止リスト（サプレッションリスト）を有効にし、本番利用の申請を行う。Supabase Auth のメール送信の上限（独自の SMTP の初期値は1時間30通）を引き上げる
- ハードバウンス・苦情は members.email\_status を更新し、管理画面の「メールが届いていない会員」に出す。苦情（迷惑メール報告）を受けた会員は、お知らせの同意を自動で取り消す（案）

## 12. 定期処理

Vercel Cron で1時間ごとに /api/cron/hourly を呼んでジョブを順に実行し、メールの実際の送信だけは5分ごとの /api/cron/send がキューから送ります（案）。どのジョブも何回実行しても結果が同じになるよう、送信は dedupe\_key、状態の変更は条件付き UPDATE で書きます。

| ID | ジョブ | 対象 | 処理 | 二重実行の防止 |
| --- | --- | --- | --- | --- |
| J1 | 販売開始のお知らせ | published で sale\_starts\_at ≤ 今、sale\_start\_notified\_at が空 | sale\_started を対象の会員（同意あり）のキューに入れ、sale\_start\_notified\_at を記録 | sale\_start\_notified\_at と dedupe\_key |
| J2 | 締切前のお知らせ | 締切日の3日前・前日の9時以降で、締切前 | deadline\_d3・deadline\_d1 を 9.7 の宛先のキューに入れる | dedupe\_key に締切日時を含める（延長後は新しい締切で送り直す） |
| J3 | 支払期限の前日のお知らせ | pending で、支払期限の前日の9時以降 | payment\_due\_reminder（不足があれば残額） | dedupe\_key |
| J4 | 期限切れの取り消し | pending の銀行振込・代理注文で payment\_due\_at < 今 | PaymentIntent を取り消して canceled にし、order\_auto\_canceled を送る。コンビニ払いは Stripe の失効の通知を待ち、期限から3日たっても通知がなければ Stripe の状態を取り直す（案） | WHERE payment\_status = 'pending' |
| J5 | 本数の確定 | 締切日（締切後の注文は受付期限の日）の2日後の23:59を過ぎ、確定の記録が空 | production\_fixed\_at／late\_production\_fixed\_at を記録 | 記録が空のときだけ |
| J6 | 途中でやめた注文の掃除 | draft で作成から2時間以上 | 削除する（Stripe 側のセッションは期限切れ） | 条件付き DELETE |
| J7 | 新年度のお願い | settings の日付の日（毎年） | new\_year\_code を全会員のキューに入れる | dedupe\_key = new\_year:{年}:{会員} |
| J8 | 監視 | stripe\_events の error、失敗が続く送信 | 保守担当へ知らせる | 同じ知らせは1日1回 |
| S1 | メールの送信（5分ごと） | email\_messages の queued | SES の送信速度の上限内で、1回の実行時間に収まるだけ送る | 行ロック（FOR UPDATE SKIP LOCKED） |

- 各ジョブは pg\_try\_advisory\_lock で同時実行を防ぐ。日時の判定はすべて日本時間
- /api/cron/\* は CRON\_SECRET のヘッダーがなければ 401 を返す。スケジュールは vercel.json の crons（"0 \* \* \* *" と "*/5 \* \* \* \*"）
- 締切の延長や支払いの通知がどの順で来ても崩れないよう、ジョブは毎回その時点の DB の値から対象を選び直す

## 13. 帳票・出力

PDFはサーバーの Route Handler（Node.js）でその場で作り、保存はしません。用紙の型番や取り込み先のCSV形式が決まっていないものは、行・列・余白や列の並びを設定として持ち、プログラムを変えずに合わせられるようにします。

| 帳票 | 形式 | 画面 | 載せる項目 | メモ |
| --- | --- | --- | --- | --- |
| 登録コードのカード | PDF（A4に面付け） | A03 | QRコード（4章のURL）、コード（4文字ずつ）、学校・園の名前、学年・クラス、対象の年度、カードの通し番号、登録の手順 | お子さまの名前は印字しない |
| 案内チラシ | PDF（A4） | A06 | 行事名、QRコード、価格、締切、注文の方法、問い合わせ先 | 広告に当たるため、載せる事項は弁護士確認中 |
| 告知文 | テキスト | A06 | 販売開始・締切の文と注文サイトのURL（openExternalBrowser=1 つき） | 学校・園の連絡アプリに貼る |
| 仕分けリスト | PDF・CSV | A11 | 学校・園、クラス、お子さまの名前（名前順）、商品と枚数 | 同じお子さまの分は、家族の別々の注文もまとめて1行 |
| お届けラベル | PDF（ラベル用紙） | A11 | お子さまの名前、学年・クラス、商品、枚数 | 用紙の型番は未決 |
| 納品書 | PDF | A11 | 学校・園、行事、クラスごとの本数 | 個人名は載せない |
| 宛名ラベル・宛名CSV | PDF・CSV | A12 | お届け先の氏名・郵便番号・住所・電話、注文番号 | CSVの形式は発送方法で決める（未決） |
| 追跡番号の取り込み | CSV（読み込み） | A12 | 注文番号、追跡番号 | 取り込むと発送済みにし、shipped を送る |
| 領収書 | PDF | M07 | 宛名（会員が入力）、金額、但し書き、発行日、注文番号、発行者（ツチダ映像様） | 支払い済みの注文だけ。適格請求書（インボイス）にするかは未決 |
| 売上CSV | CSV | A15 | 注文日、注文番号、行事、学校・園、商品、数量、金額、支払い方法、状態 | 会計ソフトに取り込める形 |

- CSVの文字コードは取り込み先に合わせる（Excel 向けは BOM つき UTF-8。発送サービスによっては Shift\_JIS が必要）
- 何百枚ものカードを一度に作るときは、関数の実行時間の上限に注意し、クラスごとに分けて作る

## 14. セキュリティと個人情報

お子さまの氏名とクラスを扱うため、守りの中心は「登録コードを持たない人に行事を見せないこと」と「管理画面を乗っ取られないこと」です。個人情報の保存期間と削除の範囲は弁護士が確認中で、決まるまでは下の仮の扱いで実装します。

| 項目 | 実装 |
| --- | --- |
| 会員のログイン | Supabase Auth（メール＋パスワード）。登録とメール変更は6桁の確認番号で確かめる（リンクは使わない）。パスワードは8文字以上（案） |
| 管理者 | 個人ごとのアカウントとTOTPの2段階認証を必須にし、aal2 でないと /admin に入れない |
| 登録コードの総当たり | 約60ビットのコードに加え、会員ごと・IPごとに15分で5回失敗したら15分入力できなくする（案）。失敗は code\_attempts に記録し、IPはハッシュで持つ |
| データの権限 | 全テーブルでRLS。書き込みはサーバーだけで、secret key はサーバーの環境変数にだけ置く（3章） |
| 外からの通知 | Stripe と SNS の署名を検証する。定期処理は CRON\_SECRET で守る |
| 画面 | CSP、HSTS、X-Frame-Options（DENY）などのヘッダーを付ける。入力はすべて zod で検証する |
| ログ | 氏名・住所・電話・登録コードをアプリのログとエラー監視に出さない |
| 監査 | 注文の状態の変更、返金、登録コードの再発行、つながりの解除、設定の変更を audit\_logs に記録する |
| 外部に渡す情報 | Stripe には注文番号・金額・注文者の氏名とメールまで。お子さまの名前は渡さない |
| バックアップ | Supabase Pro の毎日のバックアップ（7日分）。年1回、テスト環境に戻せるか確かめる |
| テスト環境 | 本番の個人情報を入れない。テスト用のデータを作るスクリプト（seed）を用意する |
| 退会 | 仮の扱い：ログインを止め、お知らせの同意を取り消し、withdrawn\_at を入れる。消す情報と残す記録（注文・入金を7年、同意の記録を最後の送信から3年）の区分は弁護士の確認後に決める（17章） |
| 漏えいなどの事故 | 個人情報保護委員会への報告と本人への通知はツチダ映像様が行い、当社は事実の調査と報告を支える（契約で定める）。そのためのログと監査の記録を残す |

- お子さまの情報は、16歳未満の本人について同意・通知の相手を法定代理人とする個人情報保護法の改正（令和8年、主な部分は2028年7月までに施行）の対象になる。会員登録で「保護者または保護者が認めた家族であること」を確かめる文言を入れるかは、弁護士の確認を待つ

参考：[個人情報保護委員会「令和8年 改正個人情報保護法について」](https://www.ppc.go.jp/personalinfo/legal/r8kaiseihogohou)（2026年7月10日成立、7月17日公布）

## 15. 非機能と運用

一番負荷がかかるのは締切の直前で、数百人が同時に注文しても止まらないことを目標にします。保守は年6時間までなので、人が見なくても異常に気づける監視と、更新を安全に入れられる自動テストを最初から用意します。

| 項目 | 要件 |
| --- | --- |
| 同時アクセス | 締切前に数百人が同時に注文しても止まらない。注文の作成は1つのトランザクションで行い、DBには Supabase の接続プールを通してつなぐ |
| 対応環境 | iPhone の Safari、Android の Chrome（最新版とその1つ前）、パソコンの Chrome・Edge・Safari（最新版）。LINE などのアプリ内ブラウザでも注文と支払いができることを確かめる |
| 見やすさ | 祖父母世代でも迷わないよう、本文16px以上、ボタンの高さ48px以上（案） |
| 監視 | 停止（外形監視）、エラーの急増（エラー監視。例：Sentry）、Stripe からの通知の失敗、メール送信の失敗を、保守担当に知らせる |
| テスト | 会員登録 → コードの入力 → 注文 → テスト決済（カード・コンビニ・銀行振込）を Playwright で通して確かめる。calcOrder と期限の計算は Vitest で細かく確かめる |
| 更新 | 部品（ライブラリ）の更新は Renovate か Dependabot で知らせ、テストが通ってから取り込む。Next.js は脆弱性の修正が入った最新版を使う |
| デプロイ | main へのマージで本番。プルリクエストごとにプレビュー（テスト環境の Supabase と Stripe テストモード）。DBの変更は Supabase CLI のマイグレーションで管理する |

| 環境変数 | 用途 | 扱い |
| --- | --- | --- |
| NEXT\_PUBLIC\_SUPABASE\_URL | Supabase のURL | 公開してよい |
| NEXT\_PUBLIC\_SUPABASE\_PUBLISHABLE\_KEY | ブラウザ用のキー（新しい形式） | 公開してよい |
| SUPABASE\_SECRET\_KEY | サーバー用のキー（新しい形式） | 秘密 |
| STRIPE\_SECRET\_KEY・STRIPE\_WEBHOOK\_SECRET | 決済と Webhook の署名の検証 | 秘密 |
| AWS\_REGION・SES の認証情報 | SES での送信。できれば Vercel の OIDC で IAM ロールを使い、アクセスキーを置かない | 秘密 |
| SES\_CONFIGURATION\_SET | 配信結果の通知に使う設定セット | — |
| CRON\_SECRET | 定期処理の保護 | 秘密 |
| UNSUBSCRIBE\_SIGNING\_SECRET | 配信停止リンクの署名 | 秘密 |
| APP\_BASE\_URL | メールやQRに入れるサイトのURL | — |

## 16. 来年度の写真データ販売への備え

写真データの販売は来年度に別の契約で足す予定で、そのときに作り直しが要らないよう、今回は次の部分だけを先に用意します。今回は画面も画像の保存先も作りません。

| 今回用意するもの | 来年度に足すもの |
| --- | --- |
| products.kind = data、media = photo\_data を値として持つ | 写真の一覧と購入（1枚ずつ、行事ごとのまとめなど） |
| 送料と受け取り方法は、ディスクの明細だけで計算する（9.2） | — |
| お届けの状態に provided（提供済み）を用意する | 支払い済みになった時点で provided にし、ダウンロード（期限つきのリンク）を開く |
| order\_items.photo\_id（null可）を用意する | photos テーブルと、画像の保存・配信（Cloudflare R2 など） |
| 行事を写真と映像の共通の単位にする | 行事ごとの写真の一括アップロード、見本画像（縮小・透かし）の自動作成 |
| 1回の注文にディスクとデータを混ぜられる | マイページの注文の詳細に「ダウンロード」の欄 |
| 会員・お子さま・登録コード・決済・メールはそのまま使う | 管理画面：写真の入稿・公開・非公開、掲載をやめてほしい写真への対応 |

- 顔検索は、顔の特徴データを使うため個人識別符号に当たり、個人情報保護法の令和8年の改正で新しい規律の対象になる見込み。保護者の同意と学校・園の了承を得る形で、来年度に別に設計する
- 今回のプライバシーポリシーは、写真データを足すときに改定する前提で作る

## 17. 未決事項と実装への影響

実装は下の仮の値で進め、決まったら設定や文面を差し替えます。ほとんどは settings か文面なので、決まってもプログラムの変更は要りません（締切後の価格の計算と、宛名CSVの形式を除く）。

| 項目 | 仮の値（実装で使う） | 影響する箇所 | 決める人・時期 |
| --- | --- | --- | --- |
| 標準の価格・2枚目以降・締切後の価格 | 仮の金額で seed | products、G03、9.2 | ツチダ映像様（11月上旬） |
| 締切後の注文に2枚目以降の価格を使うか | 使わない（全枚数を締切後の価格） | calcOrder | ツチダ映像様 |
| 送料と発送方法 | 全国一律の仮の金額 | settings、宛名CSVの形式（A12） | ツチダ映像様（11月上旬） |
| お届け予定の目安 | 締切から約3週間後 | events.delivery\_note の初期値 | ツチダ映像様 |
| 1人のお子さまにつなげるアカウント数 | 3 | settings.max\_accounts\_per\_child | ツチダ映像様 |
| お知らせの宛先 | 同意した人だけ。お子さま単位で未注文を判定 | J1・J2・late\_order\_open | ツチダ映像様 |
| 不良品の交換 | 到着から14日以内、送料はツチダ映像様、交換品は郵送 | 規約、A08 の交換の記録 | ツチダ映像様・弁護士 |
| 返品特約・利用規約・プライバシーポリシーの文面 | 当社の下書き | G06、M04 の表示、特商法13条の通知メール | 弁護士（返品特約は11月中旬まで） |
| 退会時に消す情報と残す記録 | ログインの停止と同意の取り消しだけ | 退会の処理、保存期間 | 弁護士 |
| お知らせの同意欄の初期状態 | チェックなし | G09 | 弁護士 |
| 事業者情報、個人事業か法人か | — | G06、Stripe の申込み、コンビニ払いを使えるか | ツチダ映像様（11月上旬） |
| 各サービスの契約名義 | すべてツチダ映像様の名義、当社は管理者 | アカウントの準備 | ツチダ映像様 |
| 注文サイトのアドレスとメールの差出人名 | order.t-eizou.com | DNS、SES の ID、差出人 | ツチダ映像様（11月上旬） |
| ラベル用紙の型番 | — | お届けラベル・宛名ラベルのPDF | ツチダ映像様 |
| 行事のジャケット画像に顔が写るものを使うか | — | M02 の画像（公開ページには出さない） | ツチダ映像様 |
| 試験運用する学校・園と行事 | — | 初期データ、公開日 | ツチダ映像様 |
| 紙の受付を終える条件 | ネット注文の割合が9割を超えたら | A15 の注文の割合 | ツチダ映像様 |
| 代理注文のコンビニ払いで、注文者のメールがないとき | — | A09（Stripe はお客様の氏名とメールを求める） | 当社（実装時に確認） |
| 領収書を適格請求書（インボイス）にするか | 通常の領収書 | 領収書のPDF | ツチダ映像様 |
