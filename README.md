# AIO Growth Partner

店舗業務効率化とAIO支援のためのSaaS基盤です。GitHub + Vercel + Supabase + OpenAI API を前提に、業態別の機能、文言、AIプロンプト、ダッシュボードを1つの共通基盤で切り替えられるように設計しています。

## Architecture

- Next.js App Router
- Vercel hosting
- Supabase Auth / PostgreSQL / RLS
- OpenAI API through server-side route handlers only
- `industry_type` による業態切替
- `feature_flags` による機能の表示・無効化
- `modules` / `ai_prompt_templates` / `dashboard_layouts` による共通基盤化

Phase 1の業態例:

- `general_store`: 汎用店舗
- `auto_repair`: 自動車修理

## Phase Scope

Phase 1:

- ログイン、店舗プロフィール、複数店舗管理、管理者画面
- 公開申し込みフォーム
- AI投稿文生成、AIクチコミ返信文生成、AIO診断
- Supabase DB設計、RLS、初期データ

Phase 2-A:

- 商品・部品・サービスCRUD
- 在庫CRUD
- 顧客CRUD
- 見積書CRUD
- 請求書CRUD
- `general_store` と `auto_repair` の業態別表示名切り替え

Phase 2-B:

- PDF出力
- 月次レポート
- PDFライブラリを使う場合は日本語フォント埋め込み前提。初期実装ではHTML印刷画面も許容します。
- `pdf_export` / `monthly_report` feature flag と module による表示制御

Phase 3-A:

- 投稿下書き管理
- Instagram投稿下書き生成
- Googleビジネスプロフィール向け投稿下書き生成
- 月次レポートからのAI改善提案
- 画像キャプション生成、需要予測・在庫アラートの拡張テーブル
- `marketing_drafts` / `instagram_draft_generation` / `google_business_profile_draft` / `ai_monthly_recommendations` / `image_caption_generation` / `demand_alerts` feature flag と module による表示制御

Phase 4-A:

- CSV / Excelからの外部売上データ取り込み
- 取り込み前プレビュー
- 列マッピングの確認・修正
- 成功行とエラー行の分離
- `source_row_hash` による重複取り込み防止
- 売上一覧、日別・月別・商品別・支払方法別の簡易集計
- `data_imports` / `csv_import` / `excel_import` / `column_mapping` / `sales_normalization` / `sales_reports` feature flag と module による表示制御

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

SupabaseとOpenAIの環境変数が未設定でも、デモデータとデモAI出力で画面確認できます。

## Environment Variables

```env
NEXT_PUBLIC_APP_URL=https://app.aioboost.jp
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=info@aioboost.jp
SENDGRID_FROM_NAME=AIO Growth Partner
ADMIN_NOTIFICATION_EMAIL=info@aioboost.jp
APP_BASE_URL=https://app.aioboost.jp
```

`SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY`、`SENDGRID_API_KEY`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` はサーバー側だけで使用します。クライアント側に露出させないため、`NEXT_PUBLIC_` を付けません。
GitHubにはキーの実値を含めず、ローカルでは `.env.local`、VercelではProject SettingsのEnvironment Variablesに設定します。

## SendGrid Email Notifications

公開申し込みフォームから導入相談が届いたときに、申込者への自動返信とAIO管理者への通知を送れます。管理者画面の申込詳細から、オンライン説明案内、請求書発行案内、入金確認・承認完了案内、利用開始案内も送信できます。

Vercel Productionに設定する環境変数:

```env
SENDGRID_API_KEY=SendGridで作成したAPI Key
SENDGRID_FROM_EMAIL=info@aioboost.jp
SENDGRID_FROM_NAME=AIO Growth Partner
ADMIN_NOTIFICATION_EMAIL=info@aioboost.jp
APP_BASE_URL=https://app.aioboost.jp
```

送信元 `info@aioboost.jp` は、SendGrid側でSender AuthenticationまたはSingle Sender Verificationを完了してから使います。送信履歴は `application_email_logs` に保存され、`/admin/applications/[applicationId]` で確認できます。

メール送信ポイント:

| タイミング | 宛先 | テンプレート | 送信方法 |
| --- | --- | --- | --- |
| 申し込み受付時 | 申込者 | 申込者自動返信 (`application_received`) | 自動送信 |
| 申し込み受付時 | 管理者 | 管理者通知 (`admin_new_application`) | 自動送信 |
| 説明予定 | 申込者 | オンライン説明案内 (`demo_invitation`) | 管理者が確認して送信 |
| 請求書発行済み | 申込者 | 請求書発行案内 (`invoice_issued`) | 管理者が確認して送信 |
| 入金確認済み / 承認済み | 申込者 | 入金確認・承認完了案内 (`payment_approved`) | 管理者が確認して送信 |
| アカウント発行済み | 申込者 | 利用開始案内 (`account_started`) | 管理者が確認して送信 |
| 必要に応じて | 申込者 | 各テンプレート | 管理者が再送 |

営業ステータス変更だけでは申込者への案内メールは自動送信しません。管理者が申込詳細で件名・本文を確認し、必要に応じて編集してから送信します。

反映手順:

1. Supabase SQL Editorで `database/migrations/phase-email-notifications-sendgrid.sql` を実行します。
2. Vercel Productionに上記環境変数を追加します。
3. ProductionをRedeployします。
4. `https://app.aioboost.jp/apply` からテスト申し込みを送信します。
5. 申込者向け自動返信、管理者通知、申込詳細のメール送信履歴を確認します。

## Production Domain

- 本番アプリURL: `https://app.aioboost.jp`
- 公開申し込みURL: `https://app.aioboost.jp/apply`
- 旧Vercel URL: `https://aio-growth-partner.vercel.app`
- 独自ドメイン: `app.aioboost.jp`
- DNS設定: `CNAME app -> 3c044fbdeb2dee1e.vercel-dns-017.com.`

通常の営業・導入案内では `https://app.aioboost.jp` を利用します。旧Vercel URLは移行期間中の確認用として残せますが、Google OAuthやユーザー案内テンプレートは独自ドメインを優先します。

本番URL確認:

- `https://app.aioboost.jp`
- `https://app.aioboost.jp/apply`
- `https://app.aioboost.jp/login`
- `https://app.aioboost.jp/settings`
- `https://app.aioboost.jp/beta-onboarding`
- `https://app.aioboost.jp/help`
- `https://app.aioboost.jp/legal`
- `https://app.aioboost.jp/stores/store-auto-demo/settings/google`
- `https://app.aioboost.jp/stores/store-auto-demo/growth-actions`
- `https://app.aioboost.jp/admin/applications` は未ログイン時に `/login` へ戻る

将来用の拡張ポイント:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_CLIENT_ID=
STRIPE_CONNECT_REDIRECT_URI=https://app.aioboost.jp/api/stripe/oauth/callback
FREEE_CLIENT_ID=
FREEE_CLIENT_SECRET=
FREEE_REDIRECT_URI=https://app.aioboost.jp/api/freee/oauth/callback
FREEE_TOKEN_ENCRYPTION_KEY=
```

## Supabase Setup

Supabase SQL Editorで以下を順に実行します。

1. `database/schema.sql`
2. `database/policies.sql`
3. `database/seed.sql`

Phase 3-Aでは `marketing_drafts`、`ai_recommendations`、`image_caption_jobs`、`demand_alerts` を追加します。
Phase 4-Aでは `external_data_sources`、`data_import_jobs`、`data_import_files`、`data_column_mappings`、`sales_transactions`、`sales_transaction_items`、`normalized_sales_summaries`、`import_error_rows` を追加します。
Phase 4-Bでは `sales_ai_reports`、`sales_ai_report_sections`、`sales_anomaly_flags` を追加します。
Phase 4-Cでは `demand_forecasts`、`inventory_alerts`、`recommended_actions` を追加します。
既存環境へ反映する場合も、更新後の `database/schema.sql`、`database/policies.sql`、`database/seed.sql` を順番に再実行してください。

CSV / Excelの元ファイル保存にはSupabase Storage bucketが必要です。SQLだけではStorage bucketを確実に作れないため、Supabase DashboardのStorageから以下を作成してください。

- Bucket name: `import-files`
- Public bucket: off
- 用途: CSV / Excel元ファイルの保存

`ai_generation_logs` には以下を保存します。

- `user_id`
- `organization_id`
- `store_id`
- `template_id`
- `input`
- `output`
- `model`
- `tokens`
- `status`
- `error_message`
- `created_at`

## Verification

```bash
pnpm build
pnpm check:secrets
```

`pnpm check:secrets` は、クライアント側コードに `OPENAI_API_KEY` や `SUPABASE_SERVICE_ROLE_KEY` などのサーバー専用環境変数参照がないかを確認します。

## Vercel Deploy

1. GitHubにリポジトリを作成
2. VercelでGitHubリポジトリをImport
3. Environment Variablesを設定
4. Supabase SQLを適用
5. Deploy

OpenAI APIは `app/api/ai/*` のRoute Handlerからのみ呼び出します。ブラウザから直接OpenAI APIを呼びません。

## Phase 1 Pages

- `/`
- `/apply`
- `/login`
- `/signup`
- `/dashboard`
- `/stores`
- `/stores/new`
- `/stores/[storeId]`
- `/stores/[storeId]/posts`
- `/stores/[storeId]/reviews`
- `/stores/[storeId]/diagnosis`
- `/settings`
- `/admin`
- `/admin/applications`
- `/admin/users`
- `/admin/organizations`
- `/admin/stores`
- `/admin/ai-logs`

## Phase 2-A Pages

- `/stores/[storeId]/items`
- `/stores/[storeId]/items/new`
- `/stores/[storeId]/items/[itemId]`
- `/stores/[storeId]/inventory`
- `/stores/[storeId]/customers`
- `/stores/[storeId]/customers/new`
- `/stores/[storeId]/customers/[customerId]`
- `/stores/[storeId]/estimates`
- `/stores/[storeId]/estimates/new`
- `/stores/[storeId]/estimates/[estimateId]`
- `/stores/[storeId]/invoices`
- `/stores/[storeId]/invoices/new`
- `/stores/[storeId]/invoices/[invoiceId]`

## Phase 2-B Pages

- `/stores/[storeId]/estimates/[estimateId]/pdf`
- `/stores/[storeId]/estimates/[estimateId]/pdf/download`
- `/stores/[storeId]/invoices/[invoiceId]/pdf`
- `/stores/[storeId]/invoices/[invoiceId]/pdf/download`
- `/stores/[storeId]/reports/monthly`

## Phase 3-A Pages

- `/stores/[storeId]/marketing`
- `/stores/[storeId]/marketing/drafts`
- `/stores/[storeId]/marketing/drafts/new`
- `/stores/[storeId]/marketing/drafts/[draftId]`
- `/stores/[storeId]/marketing/recommendations`
- `/stores/[storeId]/marketing/recommendations/[id]`
- `/stores/[storeId]/marketing/calendar`

## Phase 4-A Pages

- `/stores/[storeId]/data-imports`
- `/stores/[storeId]/data-imports/new`
- `/stores/[storeId]/data-imports/[importJobId]`
- `/stores/[storeId]/sales`
- `/stores/[storeId]/sales/reports`

## PDF Export

見積書・請求書の詳細画面にある「PDF出力」からPDFをダウンロードできます。
Phase 2-Bでは依存ライブラリを増やさず、VercelのNode runtimeでPDFを生成します。日本語はPDFの日本語CIDフォント指定で出力し、必要に応じて印刷プレビュー画面も利用できます。

使い方:

1. 見積書または請求書の詳細画面を開く
2. 「PDF出力」を押してPDFをダウンロードする
3. レイアウト確認やブラウザ印刷が必要な場合は「印刷プレビュー」を開く

将来PDFライブラリへ移行する場合は、日本語フォントをVercelに同梱し、サーバー側Route Handlerでフォント埋め込みPDFを生成します。

## Monthly Report

`/stores/[storeId]/reports/monthly` で店舗ごとの月次レポートを確認できます。
対象月を選択すると、見積金額、請求金額、入金済み金額、未入金金額、件数、顧客数、在庫注意数を集計します。

明細行はPhase 2-B時点では未実装のため、「よく使われる商品・部品」は在庫データの数量順で表示します。データが足りない場合は0または空状態で表示します。

## AI Marketing Support

`/stores/[storeId]/marketing` からAI集客支援機能を利用できます。
投稿下書きは店舗ごとに保存され、投稿先は `instagram`、`google_business_profile`、`other` を想定しています。

投稿下書きの使い方:

1. `/stores/[storeId]/marketing/drafts/new` を開く
2. 投稿先と投稿タイプを選んでAI生成する、または手入力で保存する
3. 一覧・詳細画面で本文、短縮版、ハッシュタグ、行動導線、画像案を編集する

AI改善提案の使い方:

1. `/stores/[storeId]/marketing/recommendations` を開く
2. 対象月を選んでAI改善提案を作成する
3. 良かった点、注意点、来月の打ち手、投稿テーマ、在庫・顧客対応の提案を確認する
4. 提案詳細から投稿下書きを作成する

OpenAI APIはサーバー側のみで使用します。`OPENAI_API_KEY` は `NEXT_PUBLIC_` を付けずにVercelの環境変数へ設定してください。
`ai_prompt_templates` の `template_key` と `industry_type_key` により、汎用店舗と自動車修理でプロンプトと文言を切り替えます。

## Data Imports

`/stores/[storeId]/data-imports/new` からCSV / Excelをアップロードできます。
Phase 4-Aでは、既存レジや販売管理ツールから出力したファイルを取り込み、売上データとして整理します。Airレジ、スマレジ、Square、Shopify、GoogleスプレッドシートAPIなどの直接連携は将来対応です。

取り込み手順:

1. データ元を選択する
2. CSV / Excelファイルをアップロードする
3. 元ファイル名、文字コード、区切り文字、検出列、サンプル行を確認する
4. 列マッピングを確認・修正する
5. 正規化プレビューで売上日、商品名、数量、金額、支払方法、エラー有無を確認する
6. 取り込みを実行する
7. `/stores/[storeId]/sales` と `/stores/[storeId]/sales/reports` で反映を確認する

対応範囲:

- CSV: UTF-8、UTF-8 BOM、Shift_JISに配慮
- CSV: カンマ区切り、タブ区切りを簡易自動判定
- Excel: 最初のシートを対象
- 重複防止: `source_row_hash` を保存
- エラー行: `import_error_rows` に保存し、成功行とは分けて扱う

Supabase Storage:

- Bucket: `import-files`
- 元CSV / ExcelはStorageへ保存
- DBには `storage_path` などの参照情報のみ保存
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用

Vercel注意点:

- Phase 4-Aは小〜中規模ファイル前提です。
- 大量ファイル、定期取り込み、API同期は将来 Supabase Edge Function や background job へ分離してください。
- Googleスプレッドシート連携は、将来 `external_data_sources.connection_type = google_sheets` とOAuth設定で追加します。
- POS API連携は、将来 `external_data_sources.connection_type = api` と `credentials_ref` を使って追加します。APIキー本体はDBに直接保存しません。

## Sales AI Reports

`/stores/[storeId]/sales/reports/monthly-ai` から、取り込んだ外部売上データを使ったAI月次売上レポートを生成できます。

使い方:

1. CSV / Excel取り込みを完了し、`/stores/[storeId]/sales/reports` に売上集計が表示されていることを確認する
2. `/stores/[storeId]/sales/reports/monthly-ai` を開く
3. 対象月を選んで「AIレポート生成」を押す
4. レポート詳細で、売上サマリー、前月比、商品・サービス別ランキング、支払方法別集計、日別・曜日別売上、AI改善提案、異常値・確認ポイントを確認する
5. 「印刷プレビュー」からブラウザ印刷またはPDF保存を行う

Phase 4-BのAI分析:

- OpenAI APIはサーバー側のみで使用します。
- `OPENAI_API_KEY` はVercel環境変数に設定し、`NEXT_PUBLIC_` を付けません。
- 未設定の場合はデモ出力で画面確認できます。
- 自動車修理では、オイル交換、タイヤ交換、車検、点検、部品在庫、リピート来店を意識した文言に切り替えます。
- 異常値検出は、前月比で大きく落ちた商品、急に増えた商品、極端な金額、数量が不自然な行、重複候補をまずルールベースで検出します。
- PDFはPhase 4-Bではブラウザ印刷方式です。将来、サーバー側PDF生成へ移行する場合は日本語フォント埋め込みを前提にしてください。

## Demand Forecasts And Actions

Phase 4-Cでは、取り込んだ外部売上データと商品・在庫データから、需要予測、在庫アラート、次アクション提案を作成します。

画面:

- `/stores/[storeId]/sales/forecast`
- `/stores/[storeId]/inventory/alerts`
- `/stores/[storeId]/actions`

使い方:

1. CSV / Excel取り込みを完了し、売上データと商品・在庫データを用意する
2. `/stores/[storeId]/sales/forecast` で対象月を選び、需要予測を生成する
3. `/stores/[storeId]/inventory/alerts` で在庫切れリスク、過剰在庫リスク、発注候補を確認する
4. `/stores/[storeId]/actions` でInstagram投稿案、Google投稿案、店頭POP、既存顧客案内、発注確認を確認する

Phase 4-Cの判定は、まず集計ベースです。

- 商品・サービス別の直近売上と前月比を見ます。
- 伸びている商品・部品と現在庫を照合します。
- 在庫が少ないものを在庫切れリスクまたは発注候補として表示します。
- 売上に紐づかず在庫が多いものを過剰在庫リスクとして表示します。
- OpenAI APIが設定されている場合、業態別の表現で販促アクション文を整えます。
- `OPENAI_API_KEY` が未設定の場合も、デモ提案で画面確認できます。

自動車修理では、点検、オイル交換、タイヤ交換、車検前点検、部品交換、リピート来店に寄せた文言に切り替えます。

## Growth Action Center

Phase 5-Aでは、需要予測、AI月次売上レポート、次アクション提案を、実際に使える集客・発信用の下書きに変換します。

画面:

- `/stores/[storeId]/growth-actions`
- `/stores/[storeId]/growth-actions/[actionId]`

生成される下書き:

- Googleビジネスプロフィール投稿案
- Instagram投稿案
- クチコミ返信案
- 既存顧客への案内文
- 店頭POP文
- LINE配信用文章

使い方:

1. `/stores/[storeId]/growth-actions` を開く
2. 「集客アクションを生成」を押す
3. 優先度、理由、推奨実行日、対象チャネル、ステータスを確認する
4. 詳細画面で文章を確認し、必要な本文をコピーする
5. ステータスを「未対応」「下書き作成済み」「実行済み」「保留」に変更する

Phase 5-Aでは外部API投稿は行いません。`external_provider` と `external_status` を保存し、将来のGoogle、Instagram、LINE API連携に備えます。
自動車修理では、車検、点検、オイル交換、タイヤ交換、部品交換、リピート来店に寄せた文言に切り替えます。

## Growth Calendar And Approval Flow

Phase 5-Bでは、生成した集客アクションを投稿・配信・返信の運用予定として管理します。外部APIへの実投稿はまだ行わず、いつ、どのチャネルで、どの文章を使うかを整理します。

画面:

- `/stores/[storeId]/growth-calendar`
- `/stores/[storeId]/growth-actions/[actionId]/edit`
- `/stores/[storeId]/growth-actions/[actionId]/preview`
- `/stores/[storeId]/settings/channels`

できること:

- 今日やること、今週やること、承認待ち、実行済み、保留を確認する
- Google投稿、Instagram、LINE、既存顧客案内、店頭POP、クチコミ返信をチャネル別に見る
- 下書きのタイトル、本文、短縮版、CTA、ハッシュタグ、メモを編集する
- 承認待ち、承認済み、差し戻しを保存する
- Google投稿風、Instagram投稿風、LINE配信風、クチコミ返信風、店頭POP風、既存顧客案内風のプレビューを見る
- 将来の外部連携に備え、チャネルごとの外部サービス名、アカウント名、外部アカウントIDを控える

Phase 5-BのDB更新は、全文の `schema.sql` / `policies.sql` / `seed.sql` ではなく、Phase 5-B差分SQLだけをSupabase SQL Editorで実行できます。

## Google Integrations Foundation

Phase 5-Cでは、Googleビジネスプロフィール、Gmail、Googleカレンダーへ安全に連携するための土台を追加します。OAuth接続、接続状態の見える化、送信前確認、ログ保存から始め、現在はGmail下書き作成とGoogleカレンダー予定作成まで本番確認済みです。Google Business ProfileはAPI承認の都合により手動投稿支援モードで運用します。

画面:

- `/stores/[storeId]/settings/google`
- `/stores/[storeId]/settings/google/business-profile`
- `/stores/[storeId]/settings/google/gmail`
- `/stores/[storeId]/settings/google/calendar`
- `/stores/[storeId]/growth-actions/[actionId]/send`

できること:

- Google OAuth開始URLを生成する
- callback routeで接続結果を保存する
- 接続済み、未接続、エラー、期限切れ、解除済みをDBで管理する
- Googleビジネスプロフィールのロケーション候補を控える
- Gmail下書きに使う送信元メール、送信者名、署名を控える
- Googleカレンダーに使うカレンダーID、カレンダー名、タイムゾーンを控える
- 集客アクションからGoogle投稿、Gmail、カレンダーへ送る前の確認内容を `external_publish_jobs` に保存する
- 連携の開始、保存、解除、送信準備を `external_integration_logs` に保存する

必要な環境変数:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_OAUTH_SCOPES`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

`GOOGLE_CLIENT_SECRET` と `GOOGLE_TOKEN_ENCRYPTION_KEY` はサーバー側だけで使用し、`NEXT_PUBLIC_` を付けません。`GOOGLE_TOKEN_ENCRYPTION_KEY` はrefresh tokenやaccess tokenを保存する前に暗号化するために必要です。

Vercel設定:

- Google Cloud ConsoleのOAuth callback URLは、Vercel本番URLの `/api/google/oauth/callback` を指定します。
- Vercel Environment Variablesに上記のGoogle環境変数を設定します。
- `GOOGLE_OAUTH_SCOPES` を空にした場合は、`openid email profile business.manage gmail.compose calendar.events` 相当のデフォルトスコープを使います。

Supabase更新:

- 全量反映する場合は `database/schema.sql`、`database/policies.sql`、`database/seed.sql` を順番に実行します。
- Phase 5-Cだけ反映する場合は `database/migrations/phase-5c-google-integrations.sql` をSupabase SQL Editorで実行します。

Google OAuth接続手順:

1. Google Cloud Consoleを開きます。
2. 新しいプロジェクトを作成します。
3. OAuth同意画面を設定します。テスト中は、利用するGoogleアカウントをテストユーザーに追加してください。
4. APIとサービスで Gmail API と Google Calendar API を有効化します。
5. OAuthクライアントIDを作成します。アプリケーションの種類は「ウェブ アプリケーション」を選びます。
6. 承認済みのJavaScript生成元に `https://app.aioboost.jp` を追加します。
7. 承認済みのリダイレクトURIに `https://app.aioboost.jp/api/google/oauth/callback` を追加します。
8. 移行期間中は、旧URL `https://aio-growth-partner.vercel.app/api/google/oauth/callback` も残しておくと安全です。
9. Client ID と Client Secret を取得します。
10. Vercel の Project Settings から Environment Variables を開き、次の値を追加します。
11. Vercelで本番環境をRedeployします。
12. AIO Growth Partnerの `/stores/store-auto-demo/settings/google` を開き、「Googleに接続」を押します。

Vercelに入れる値:

```env
GOOGLE_CLIENT_ID=Google Cloudで取得したClient ID
GOOGLE_CLIENT_SECRET=Google Cloudで取得したClient Secret
GOOGLE_REDIRECT_URI=https://app.aioboost.jp/api/google/oauth/callback
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events
GOOGLE_TOKEN_ENCRYPTION_KEY=ランダムな長い文字列
```

Google OAuthの本番運用URL:

- JavaScript生成元: `https://app.aioboost.jp`
- Redirect URI: `https://app.aioboost.jp/api/google/oauth/callback`
- 旧Redirect URI: `https://aio-growth-partner.vercel.app/api/google/oauth/callback`

`GOOGLE_REDIRECT_URI` を独自ドメインへ変更した場合は、VercelでRedeployしてください。Google Cloud側に新旧両方のredirect URIを登録しておくと、切り替え期間中にGoogle連携が壊れにくくなります。

Production確認結果:

- `GOOGLE_REDIRECT_URI=https://app.aioboost.jp/api/google/oauth/callback` をProduction / Previewに設定済みです。
- Google認証URLの `redirect_uri` が `https://app.aioboost.jp/api/google/oauth/callback` になることを確認済みです。
- Google認証後、callbackは `app.aioboost.jp` 側に戻り、AIO画面に「Google接続を保存しました」と表示されます。
- 接続メールは `waka.t.pro@gmail.com` で確認済みです。
- 旧redirect URIは移行期間用としてGoogle Cloud側に残します。
- Gmailは下書き作成のみを実行し、メール送信は行いません。
- Google Calendarは予定作成を実行できます。
- 2026/07/11 12:12 に Gmail下書き作成が成功済みです。件名は「点検時期のご案内」です。
- 2026/07/11 12:13 に Googleカレンダー予定作成が成功済みです。タイトルは「点検時期のご案内」、カレンダーは `primary` です。
- Google Business ProfileはAPI利用申請が承認されていないため、手動投稿支援モードで運用します。

OAuth接続時の動き:

- `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI` が未設定の場合は、Googleへ進まず設定画面へ戻します。
- OAuth `state` には店舗ID、nonce、作成日時、署名を含め、callbackで検証します。
- callbackでGoogleの `code` をtokenへ交換します。
- 取得できる場合はGoogleアカウントの `email`、`sub`、`name` を保存します。
- `GOOGLE_TOKEN_ENCRYPTION_KEY` がある場合はtokenを暗号化して保存します。
- `GOOGLE_TOKEN_ENCRYPTION_KEY` がない場合、token本体は保存せず、警告ログを `external_integration_logs` に残します。
- 接続成功時は `/stores/[storeId]/settings/google?connected=1` に戻します。
- 接続失敗時は `/stores/[storeId]/settings/google?error=...` に戻します。

重要:

- Phase 5-C-2までは、Google APIへの実投稿・実送信・実予定作成は行いません。
- Phase 5-C-3では、Gmail下書き作成とGoogleカレンダー予定作成のみ実APIを実行します。Gmailのメール送信とGoogleビジネスプロフィール投稿は行いません。
- 将来の実接続に備え、provider adapterとしてGoogleビジネスプロフィール、Gmail、Googleカレンダーのpayload作成を分けています。
- refresh tokenやclient secretはクライアント側に出さない設計です。

Phase 5-C-3:

- `/stores/[storeId]/growth-actions/[actionId]/send` から、接続済みGoogleアカウントを使ってGmail下書き作成とGoogleカレンダー予定作成を実行できます。
- Gmailは `gmail.compose` scopeを使い、下書きだけを作成します。メール送信は行いません。
- Googleカレンダーは `calendar.events` scopeを使い、指定したカレンダーに予定を作成します。
- Google Cloud側で Gmail API または Google Calendar API が未有効の場合、Googleから返る有効化案内URLを画面エラーと `external_integration_logs` に残します。
- Googleビジネスプロフィール投稿は、API制限、Google側の権限、審査要件を確認しながら次フェーズで扱います。
- 成功・失敗は `external_publish_jobs` と `external_integration_logs` に保存します。
- access token / refresh token はサーバー側だけで扱い、画面には表示しません。

Phase 5-C-4:

- Gmail下書き作成後は、外部IDとGmail下書き一覧へのリンクを送信前確認画面に表示します。
- Googleカレンダー予定作成後は、予定タイトル、予定日時、外部ID、Googleカレンダー側の確認リンクを表示します。
- `/stores/[storeId]/settings/google` にGoogle実行履歴を表示し、成功・失敗、外部ID、エラー内容を追跡できます。
- 同じ集客アクションから同じGmail下書きや同じカレンダー予定を重複作成しないよう、成功済みジョブがある場合は通常停止します。必要な場合だけ「同じ内容でも再作成する」にチェックして再作成します。
- Google APIの権限不足、API未有効、接続期限切れ、利用上限などは、初心者にも分かる日本語メッセージに変換して画面とログに残します。
- Googleビジネスプロフィール投稿は、Google Business Profile APIのロケーション取得、OAuth権限、投稿種別、審査・ポリシー要件を確認してから実投稿へ進みます。Google公式ドキュメントでは、投稿作成には `accounts/{accountId}/locations/{locationId}/localPosts` を使い、商品投稿はAPIから作成できない制限があります。

Phase 5-C-5:

- `/stores/[storeId]/settings/google/business-profile` で、接続済みGoogleアカウントからGoogleビジネスプロフィールのアカウント候補とロケーション候補を取得できます。
- アカウント一覧は Account Management API の `GET https://mybusinessaccountmanagement.googleapis.com/v1/accounts` を使います。
- ロケーション一覧は Business Information API の `GET https://mybusinessbusinessinformation.googleapis.com/v1/{parent=accounts/*}/locations` を使い、`readMask` で `name,title,storeCode,storefrontAddress,metadata` を取得します。
- 取得した候補は `google_business_profiles.metadata` に保存し、選択中の `google_account_id` / `location_id` / `location_name` / `address` にも反映します。
- 投稿可能形式は、まず `STANDARD`、`EVENT`、`OFFER` として扱います。CTAは `BOOK`、`ORDER`、`SHOP`、`LEARN_MORE`、`SIGN_UP`、`CALL` を前提にします。
- 商品投稿はGoogle公式ドキュメント上、APIから作成できないため、Phase 5-C-5では実投稿対象に含めません。
- Google Business Profile APIのquotaが0の場合は、Google側でBasic API Access申請が必要です。quota超過時は `429 Too Many Requests` または `RESOURCE_EXHAUSTED` が返る前提で、実投稿前に連続実行を避けます。
- Gmail下書き作成とGoogleカレンダー予定作成が成功していても、Googleビジネスプロフィール候補取得には別途、対象ビジネスプロフィールのオーナー/管理者権限とGoogle側のBasic API Access / quota付与が必要です。
- `codexwakazono@gmail.com` のような追加Googleアカウントは、OAuth接続の追加テストユーザーとして扱えます。ただし、そのアカウントが対象ビジネスプロフィールの管理者でない場合、GBP候補は取得できません。
- API有効化済みでもBasic API Access / quota未承認で候補取得が失敗する場合は、AIO Growth Partner側の不具合ではありません。Gmail / Calendar API と Google Business Profile API は審査・quotaが別で、Gmail下書き作成とGoogleカレンダー予定作成が成功していても、GBP候補取得だけ失敗することがあります。
- Basic API Access申請済みケースID `3-6455000041311` は、Google内部の品質チェックにより承認されていません。デモ店舗では `/stores/[storeId]/settings/google/business-profile` に「却下確認済み / 手動投稿支援モード」として記録します。
- 再申請前には、公式サイト情報、運営者情報、プライバシーポリシー、API利用目的、ユーザー承認フロー、投稿履歴・操作ログ、対象ビジネスプロフィールのオーナー/管理者権限を整理します。
- 承認後は同じ画面でAPI statusを「API承認済み」に変更し、`account_id` / `location_id` 候補取得へ戻ります。
- 参考: https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- 参考: https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list
- 参考: https://developers.google.com/my-business/content/posts-data
- 参考: https://developers.google.com/my-business/content/limits

Phase 5-C-6: GBP手動投稿支援:

- Google Business Profile APIのBasic API Access / quotaが未承認または却下確認済みの場合は、実API投稿ではなく手動投稿運用を行います。
- 手動投稿支援モードは一時的な代替ではなく、API制限がある状態でも使える正式な運用モードです。
- `/stores/[storeId]/growth-actions/[actionId]/manual-post` で、Googleビジネスプロフィール投稿用のコピー本文、投稿タイプ、CTA、プレビュー、投稿前チェックリストを確認できます。
- 「Google管理画面を開く」からGoogleビジネスプロフィール管理画面へ移動し、コピーした本文を手動投稿します。
- 手動投稿前に、投稿種別、CTA、URL、画像、対象店舗、古い営業時間・価格・期限が本文に残っていないかを確認します。
- 投稿文は本文だけでなく、タイトル、本文、ハッシュタグ、CTAをまとめたコピー欄でも確認できます。
- 手動投稿の進行状態は「投稿待ち」「承認待ち」「手動投稿済み」で管理できます。
- 手動投稿後は、投稿日時、担当者、投稿URLまたは管理メモ、対象店舗メモ、画像メモ、チェックリストを保存できます。
- 保存すると `growth_actions`、`growth_action_drafts`、`growth_action_schedule_items` に進行状態を反映し、`external_publish_jobs` にも `pending_manual_post` / `awaiting_approval` / `manual_published` として履歴を残します。
- 将来GBP API quotaが付与されたら、同じ下書き・承認・履歴データを使って実API投稿に切り替えます。

Phase 5-D: SNS投稿支援:

- Google Business Profile実APIの審査待ち中も、Instagram / LINE / X / Facebookへ展開できる手動投稿支援を行います。
- `/stores/[storeId]/growth-actions/[actionId]/sns-post` で、既存の集客アクション下書きから媒体別の投稿文を確認できます。
- Instagramは写真や整備風景と組み合わせやすい文体、LINEは既存顧客向けの短文、Xは短く即時性のある文体、Facebookは地域向けの説明文として整形します。
- 投稿目的は「新規集客」「既存顧客フォロー」「キャンペーン」「季節案内」「口コミ促進」「予約促進」から選べます。
- 投稿ステータスは「下書き」「承認待ち」「承認済み」「手動投稿済み」で管理します。
- 画像アップロードや画像URLを前提に、Phase 5-Dでは画像URL、画像メモ、画像キャプション設計メモを保存します。将来は画像アップロードからキャプション生成へ拡張します。
- 媒体別チェックリストとして、画像あり、CTAあり、URLあり、ハッシュタグあり、投稿前確認済みを保存できます。
- 保存内容は `growth_actions`、`growth_action_drafts`、`growth_action_schedule_items` に反映し、`external_publish_jobs` に `manual_instagram`、`manual_line`、`manual_x`、`manual_facebook` などの履歴を残します。
- 現段階ではSNS APIへの実投稿は行いません。将来Meta Graph APIやLINE APIへ接続できるよう、投稿先、外部ステータス、投稿URL、履歴を分けて保存します。

Phase 5-E: インボイス型・業務基盤強化:

- AIO Growth Partnerを、AI集客だけでなく、会計・受発注・決済・証跡管理を持つ店舗業務管理SaaSとして説明しやすくするための強化です。
- 補助金採択、ITツール登録、審査通過を保証するものではありません。あくまで、インボイス型・業務デジタル化の説明に耐える業務基盤として整理しています。
- 請求書には、適格請求書発行事業者登録番号、事業者名、取引日、請求書番号、10% / 8%の税率別内訳、税抜金額、消費税額、税込金額、発行日時、PDF発行日時を持てるようにしています。
- `/stores/[storeId]/settings/invoice` で、店舗ごとの請求書番号プレフィックスと次回番号を管理できます。
- `/stores/[storeId]/orders` と `/stores/[storeId]/orders/[orderId]` で、見積から受注化し、受注ステータス、作業ステータス、請求書作成、ステータス履歴を管理できます。
- `/stores/[storeId]/payments` で、未入金、一部入金、入金済み、取消と、現金、クレジットカード、QR決済、銀行振込、その他の支払方法を管理できます。
- 請求書PDFの発行・再発行は `invoice_pdf_issues` に保存し、再発行理由も残せます。
- `/stores/[storeId]/audit-logs` で、受注化、請求書作成、PDF発行、入金登録、CSV出力、ステータス変更などの証跡を確認できます。
- `/stores/[storeId]/accounting/exports` では、売上日、請求書番号、顧客名、摘要、税率、税抜金額、消費税額、税込金額、入金日、支払方法、ステータスを含む汎用CSVを出力し、出力履歴も保存します。
- `/stores/[storeId]/reports/subsidy-impact` では、請求書発行件数、PDF発行件数、入金管理件数、CSV出力件数、AI提案件数、Google/Gmail/Calendar支援件数、手作業削減見込みを表示します。
- freee、マネーフォワード、Stripeは実連携せず、`integration_configs` に将来拡張枠として保持します。
- Phase 5-Eだけを追加反映する場合は、`database/migrations/phase-5e-invoice-business-foundation.sql` をSupabase SQL Editorで実行してください。

Phase 6-A: 補助金説明を意識したインボイス対応強化:

- AIO Growth Partnerを「AI集客つきインボイス対応 店舗業務管理SaaS」として説明しやすくするため、会計・受発注・決済・データ連携・AI活用・証跡管理の機能整理を追加しました。
- `/stores/[storeId]/settings/invoice` で、登録番号、適格請求書発行事業者名、請求書番号プレフィックス、次の連番を管理できます。
- 請求書には、登録番号、事業者名、取引年月日、10% / 8% の税率別対象額と消費税額、入金状態、支払方法を保存できます。
- 請求書番号を空欄で保存した場合、店舗ごとの連番設定から自動採番します。既存番号を使いたい場合は手入力できます。
- `/stores/[storeId]/orders` で、見積から受注、作業中、作業完了、請求化済みまでの状態を管理できます。
- `/stores/[storeId]/payments` で、現金、クレジットカード、QR決済、銀行振込、その他の支払方法と入金履歴を管理できます。
- `/stores/[storeId]/accounting/exports` で、請求書、税率別内訳、入金状態、支払方法をCSV出力できます。freee、マネーフォワード、Stripeの直接連携はまだ行わず、将来接続しやすい構成にしています。
- 請求書PDFをダウンロードすると、`invoice_pdf_issues` に発行・再発行履歴を保存し、`audit_logs` に操作ログを残します。
- `/stores/[storeId]/audit-logs` で、PDF発行履歴、再発行履歴、操作ログを確認できます。
- `/stores/[storeId]/reports/subsidy-impact` で、電子化した請求書数、売上管理件数、入金管理件数、AI提案件数、PDF発行件数、手作業削減見込みを確認できます。
- `/stores/[storeId]/compliance/invoice-tool-map` で、会計、受発注、決済、データ連携、AI活用、証跡管理の機能を一覧できます。
- この機能マップは補助金説明に使いやすい機能整理です。補助金採択、ITツール登録、審査通過を保証するものではありません。
- SupabaseにPhase 6-Aだけを反映する場合は、`database/migrations/phase-6a-invoice-compliance.sql` をSQL Editorで実行してください。全量反映する場合は、従来どおり `database/schema.sql`、`database/policies.sql`、`database/seed.sql` の順に実行してください。

課金・外部連携の分離:

- AIO運営側の課金と、店舗ユーザー側のStripe/freee連携は絶対に混同しません。
- AIO運営側の課金は、AIO Growth PartnerのSaaS利用料を店舗から徴収するためのStripeです。AIO運営会社のStripeアカウントを使い、`plans`、`plan_limits`、`platform_billing_customers`、`platform_subscriptions` で管理します。
- `organizations.plan_key` は、店舗が契約しているAIO利用プランを示します。これは店舗のお客様からの決済ではありません。
- 店舗ユーザー側のStripe連携は、各店舗が自分のStripeアカウントを接続し、店舗のお客様から決済を受けるための領域です。将来のStripe Connectを前提に、`store_payment_integrations`、`store_payment_transactions`、`payments`、`invoices` で管理します。
- 店舗ユーザー側のfreee / マネーフォワード連携は、各店舗が自分の会計事業所へ請求、売上、入金、会計CSV、取引データを送るための領域です。`store_accounting_integrations`、`accounting_export_jobs`、`accounting_exports` で管理します。
- `integration_configs` は既存の将来拡張メモとして残しますが、正式実装では店舗側のStripe/freee接続情報は `store_payment_integrations` と `store_accounting_integrations` を優先します。
- 店舗側のOAuth token、refresh token、secretはstore_id / organization_id単位でサーバー側に保存します。クライアントへ返さず、暗号化キーを使う前提です。
- `/admin/billing-integrations` で、AIO運営側課金、店舗側Stripe決済連携、店舗側会計連携を分けて確認できます。
- この分離だけをSupabaseへ追加反映する場合は、`database/migrations/phase-mvp-billing-integration-separation.sql` をSQL Editorで実行してください。

店舗側Stripe Connect / freee連携:

- AIO運営側のStripe課金はMVP期間中、請求書ベースで運用します。Stripe Checkout / Subscription実装は後回しです。
- `/stores/[storeId]/settings/integrations` で、店舗側Stripe決済連携、店舗側freee会計連携、AIO運営側課金を分けて確認できます。
- `/stores/[storeId]/settings/payments/stripe` で、店舗自身のStripeアカウントをConnect OAuthで接続できます。接続後は `store_payment_integrations` に connected account ID、接続状態、決済受付・入金状態を保存します。
- Stripe側のConnect OAuthリダイレクトURLには `https://app.aioboost.jp/api/stripe/oauth/callback` を登録します。
- 店舗側Stripeは、店舗が自分のStripeアカウントで決済を受けるダイレクト支払い型です。AIO運営側の月額利用料課金とは分けて扱います。
- Connect OAuthを使わない場合や移行期間中は、店舗自身のStripe connected account ID、アカウント名、管理画面URL、接続状態を手動保存できます。
- `/stores/[storeId]/invoices/[invoiceId]` で、請求書ごとにStripe決済URLと外部決済IDを手動登録できます。決済URLはコピーでき、Stripe管理画面で決済済みを確認した後、AIO上で入金済みに変更できます。
- Stripe手動入金は `payments` と `store_payment_transactions` に保存します。Webhook自動反映は後続の安全確認後に有効化します。
- `/stores/[storeId]/payments/stripe-transactions` で、手動登録したStripe外部決済履歴を確認できます。
- `/stores/[storeId]/settings/accounting/freee` で、店舗自身のfreee事業所をOAuth接続できます。freee側の事業所選択画面を使い、選択された1つの事業所ID、事業所名、接続状態を `store_accounting_integrations` に保存します。
- `/stores/[storeId]/accounting/exports` から汎用CSVとfreee向けCSVを出力できます。freee向けCSVは、取引日、請求書番号、顧客名、摘要、税率、税抜金額、消費税額、税込金額、入金日、支払方法、ステータスを含みます。
- `/stores/[storeId]/settings/accounting/freee` でfreee送信に使う勘定科目ID、税区分コード、入出金口座IDを設定できます。
- `/stores/[storeId]/accounting/exports` から、未送信の請求書・入金情報をfreeeの取引として送信できます。送信結果は `accounting_export_jobs` に保存します。
- `/stores/[storeId]/accounting/receipts` で、AI読み取り済みの経費レシート候補をfreeeの経費取引として送信できます。送信結果は `expense_receipts.freee_status`、`freee_payload`、`freee_response` と `accounting_export_jobs` に保存します。
- Stripe Webhook自動入金反映は後続の安全確認後に有効化します。
- このMVP連携をSupabaseへ反映する場合は、`database/migrations/phase-store-integrations-a-manual-stripe-freee.sql` をSQL Editorで実行してください。
- Stripe Connect OAuthをSupabaseへ反映する場合は、`database/migrations/phase-store-integrations-b-stripe-connect-oauth.sql` をSQL Editorで実行してください。
- freee OAuthをSupabaseへ反映する場合は、`database/migrations/phase-store-integrations-b-freee-oauth.sql` をSQL Editorで実行してください。

Stripe Connectに必要なVercel環境変数:

```env
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CONNECT_CLIENT_ID=
STRIPE_CONNECT_REDIRECT_URI=https://app.aioboost.jp/api/stripe/oauth/callback
STRIPE_ACCOUNT_LINK_RETURN_URL=https://app.aioboost.jp
STRIPE_ACCOUNT_LINK_REFRESH_URL=https://app.aioboost.jp
STRIPE_WEBHOOK_SECRET=
STRIPE_TOKEN_ENCRYPTION_KEY=
APP_BASE_URL=https://app.aioboost.jp
```

`STRIPE_TOKEN_ENCRYPTION_KEY` はStripe OAuth tokenを保存する場合の暗号化キーです。未設定でもconnected account IDは保存できますが、token本体は保存しません。
Webhook endpointは `https://app.aioboost.jp/api/stripe/webhook` を登録します。まずは `checkout.session.completed`、`payment_intent.succeeded`、`payment_intent.payment_failed` を対象にします。

freee OAuthに必要なVercel環境変数:

```env
FREEE_CLIENT_ID=
FREEE_CLIENT_SECRET=
FREEE_REDIRECT_URI=https://app.aioboost.jp/api/freee/oauth/callback
FREEE_TOKEN_ENCRYPTION_KEY=
APP_BASE_URL=https://app.aioboost.jp
```

freeeアプリ側のコールバックURLには `https://app.aioboost.jp/api/freee/oauth/callback` を登録します。AIOはfreee公式の事業所選択画面を使い、店舗ユーザーが選んだ1つの事業所だけを店舗に保存します。`FREEE_TOKEN_ENCRYPTION_KEY` はfreee OAuth tokenを保存する場合の暗号化キーです。

freee API送信の確認手順:

1. `/stores/[storeId]/settings/accounting/freee` で店舗自身のfreee事業所を接続します。
2. 同じ画面で、売上用の勘定科目ID、売上用の税区分コード、経費用の勘定科目ID、経費用の税区分コードを設定します。
3. 入金・支払までfreeeへ反映したい場合は、入出金口座の種類と口座IDも設定します。未設定の場合は取引だけを作成します。
4. 請求書・入金は `/stores/[storeId]/accounting/exports` から「請求書・入金をfreeeへ送信」を実行します。
5. 経費レシートは `/stores/[storeId]/accounting/receipts` で読み取り結果を確認してから「freeeへ送信」を実行します。
6. 送信履歴、成功、一部失敗、失敗理由は `/stores/[storeId]/accounting/exports` の出力処理履歴で確認します。

## Vercel Notes

- PDF出力に追加のVercel環境変数は不要です。
- Phase 3-A以降のAI生成、Phase 4-BのAI月次売上レポート、Phase 4-Cの次アクション提案、Phase 5-A以降の集客アクション生成には `OPENAI_API_KEY` が必要です。未設定の場合はデモ出力で画面確認できます。
- Phase 5-CのGoogle OAuth接続には `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`、`GOOGLE_TOKEN_ENCRYPTION_KEY` が必要です。
- 店舗側Stripe Connect接続には `STRIPE_SECRET_KEY`、`STRIPE_PUBLISHABLE_KEY`、`STRIPE_CONNECT_CLIENT_ID`、`STRIPE_CONNECT_REDIRECT_URI`、`STRIPE_WEBHOOK_SECRET`、`STRIPE_TOKEN_ENCRYPTION_KEY` が必要です。Stripe側のConnect redirect URIは `https://app.aioboost.jp/api/stripe/oauth/callback` です。
- 店舗側freee OAuth接続には `FREEE_CLIENT_ID`、`FREEE_CLIENT_SECRET`、`FREEE_REDIRECT_URI`、`FREEE_TOKEN_ENCRYPTION_KEY` が必要です。freee側のコールバックURLは `https://app.aioboost.jp/api/freee/oauth/callback` です。
- SupabaseにPhase 3-Aのテーブルを追加してから、本番で投稿下書き作成やAI改善提案作成を確認してください。
- Phase 4-AのCSV / Excel取り込みにはSupabase Storage bucket `import-files` が必要です。
- 日本語フォントを完全埋め込みする方式へ移行する場合は、フォントファイルをリポジトリに含め、サーバー側だけでPDF生成してください。
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用し、`NEXT_PUBLIC_` を付けません。

## MVP Release Readiness

AIO Growth PartnerのMVPは、地域店舗・中小店舗が最初の1店舗を登録し、顧客、商品・サービス、見積、請求、入金、外部売上データ、月次レポート、集客アクションまで一通り確認できる状態を目標にします。

MVPでできること:

- `/onboarding` で初回導入手順を確認できます。
- `/stores/new` で実店舗を作成できます。作成店舗は `profile_data.data_mode = production` として扱います。
- `store-auto-demo` と `store-general-demo` はデモ専用です。実店舗とは画面上で「デモ」「本番」として区別します。
- 店舗プロフィール、商品・部品・サービス、在庫、顧客、見積、請求、受注、入金、会計CSV、証跡ログを管理できます。
- CSV / Excelの売上データを取り込み、売上一覧と簡易レポートへ反映できます。
- AI月次レポート、需要予測、在庫アラート、集客アクションを生成できます。
- Gmail下書き作成とGoogleカレンダー予定作成はGoogle OAuth接続後に利用できます。
- Google Business ProfileはAPI Basic Accessが承認されていない場合でも、手動投稿支援モードで投稿文、CTA、URL、画像メモ、チェックリスト、手動投稿済みログを管理できます。
- `/settings` でFree / Starter / Proのプラン設計案と利用状況の下地を確認できます。Stripeは未接続です。

## Phase MVP-Release-Prep: 実ユーザーβリリース準備

β版は、伴走ありで実店舗に触ってもらうための状態です。新機能の完全自動化よりも、初期導線、手動運用の説明、安全性、管理者確認を優先します。

初回導入の順番:

1. `/stores/new` で実店舗を作成します。
2. 業態を選びます。まずは汎用店舗または自動車修理です。
3. `/stores/[storeId]/settings/invoice` で請求書設定を確認します。
4. 顧客、商品/サービスを登録します。
5. 見積、請求、PDF、入金登録を確認します。
6. `/stores/[storeId]/settings/payments/stripe` でStripe手動連携を確認します。
7. `/stores/[storeId]/settings/accounting/freee` と `/stores/[storeId]/accounting/exports` でfreee向けCSVを確認します。
8. `/stores/[storeId]/settings/google` でGoogle / Gmail / Calendar連携状態を確認します。
9. `/stores/[storeId]/growth-actions` でSNS手動投稿支援と集客アクションを確認します。

β版でできること:

- 店舗管理、顧客管理、商品/サービス管理
- 見積書、請求書、PDF出力、入金管理
- Stripe決済URLの手動登録
- freee向けCSV出力
- 売上CSV / Excel取込
- AI月次レポート、AI集客アクション
- Gmail下書き作成、Googleカレンダー予定作成
- SNS手動投稿支援

まだできないこと:

- AIO利用料の自動Stripe課金
- Stripe Webhook自動入金反映
- freee API自動送信
- Google Business Profile API自動投稿
- Instagram API自動投稿

管理者向け:

- `/admin/beta-release` で、登録ユーザー、組織、店舗、デモ/本番区分、外部連携状態、AI利用状況、CSV取込、エラー、直近操作ログ、βチェックリストを確認します。
- `/admin/billing-integrations` で、AIO運営側課金と店舗側Stripe/freee連携の分離を確認します。

重要な注意:

- Google Business Profile APIはGoogle側の審査やquotaの都合により、現在は手動投稿支援モードです。
- Stripeは現時点では店舗ごとの決済URL手動登録モードです。
- freeeは現時点ではCSV出力モードです。
- AI生成文は必ず人間が確認してから使用してください。
- 補助金やITツール登録の採択・登録を保証するものではありません。

## Phase Beta-Onboarding-Pack: 実店舗1社目向け導入資料

実店舗1社目に伴走ありで渡すための導入資料を、アプリ内ページとMarkdownで用意しています。

- アプリ内ページ: `/beta-onboarding`
- Markdown資料: `docs/beta-onboarding-pack.md`

β導入パックに含むもの:

- AIO Growth Partnerでできること
- 最初にやること
- 日常業務で使う流れ
- 初期設定チェックリスト
- 店舗ユーザー向け簡易マニュアル
- β版の注意事項
- 不具合報告テンプレート
- 管理者向けβ運用メモ

店舗ユーザーへ説明するポイント:

- Stripeは店舗自身のStripeアカウントを接続できます。決済URLの管理と入金確認は、現在は店舗担当者が確認して反映します。
- freeeはfreee向けCSVを出力する運用です。freee API自動送信は次フェーズです。
- Google Business Profileは手動投稿支援モードです。Gmail下書き作成とGoogleカレンダー予定作成は接続済みGoogleアカウントで利用できます。
- SNS投稿は投稿文、CTA、ハッシュタグ、チェックリストをコピーして手動投稿します。
- AI生成文は、店舗担当者が確認してから利用します。
- 補助金採択、ITツール登録、Google API承認を保証するものではありません。

## Phase First-Customer-Ready: 1社目導入前の最終整理

実店舗1社目へ案内する前に、販売前、契約前、導入前、運用前の確認を行うための管理者向け資料を用意しています。

- アプリ内ページ: `/admin/first-customer-ready`
- Markdown資料: `docs/first-customer-ready.md`

含まれるもの:

- 1社目導入前チェックリスト
- β利用前の確認事項
- β価格メモ
- 問い合わせ・不具合対応メモ
- バックアップ・復旧メモ
- 1社目向けデモシナリオ

AIO利用料の請求は管理者側で別管理します。AIO運営側の課金、店舗側Stripe Connect、freee連携は混同しないように運用してください。Stripe Webhookによる自動入金反映とfreee API自動送信は今後の拡張対象です。

まだできないこと:

- AIO利用料の自動課金、プラン変更。
- Stripe Webhookによる自動入金反映。
- Google Business Profile APIによる実投稿。Basic API Access / quotaが必要です。
- Instagram、LINE、X、Facebookへの実API投稿。
- マネーフォワードへの直接API連携。
- 大量CSV / Excelの非同期取り込み。
- 複数ユーザー招待、細かいロール別UI制御、完全なセルフサインアップ組織作成。

初期導入手順:

1. Supabase SQLを最新化します。全量の場合は `database/schema.sql`、`database/policies.sql`、`database/seed.sql` の順に実行します。
2. 差分だけの場合は、必要な `database/migrations/*.sql` を実行します。
3. Supabase Storageにprivate bucket `import-files` を作成します。
4. レシート読み取りを使う場合は、Supabase Storageにprivate bucket `receipt-files` を作成します。差分SQL `database/migrations/phase-store-integrations-c-receipt-ai-freee-prep.sql` にはbucket作成SQLも含めています。
5. Vercel Environment Variablesを設定します。
6. `/login` でログインします。
7. `/onboarding` を開きます。
8. `/stores/new` から実店舗を作成します。
9. 請求書設定、商品・顧客、見積・請求、入金、CSV取込、Google連携、集客アクションの順に確認します。

Vercel環境変数:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_OAUTH_SCOPES`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `FREEE_CLIENT_ID`
- `FREEE_CLIENT_SECRET`
- `FREEE_REDIRECT_URI`
- `FREEE_TOKEN_ENCRYPTION_KEY`

管理者向け運用手順:

- `/admin/applications` で公開申し込みを確認し、説明予定、説明済み、請求書発行済み、入金確認済み、承認済み、アカウント発行済み、見送りを管理します。
- `/admin/applications/[applicationId]` で営業メモ、請求状況、入金状況、承認状況、利用開始準備、ログイン案内テンプレートを確認します。
- 申し込みだけで自動的に利用開始にはしません。AIO運営側が請求書を発行し、入金確認後に管理者が承認してから組織・店舗・招待準備を行います。
- MVP期間中のAIO利用料は請求書ベースです。AIO運営側Stripe Subscription / Checkout は後続フェーズです。
- 店舗側Stripe/freee連携は、店舗のお客様決済・会計連携用です。AIO運営側の月額利用料課金とは分けて管理します。
- `/stores/[storeId]/accounting/receipts` でレシート画像を読み取り、freeeへ送る前の会計入力候補を確認します。AI解析結果は必ず人間が確認してから会計処理に利用します。
- レシート画像はSupabase Storageのprivate bucket `receipt-files` に保存し、DBには保存場所と読み取り結果だけを保存します。
- `/admin/stores` でデモ店舗と本番店舗の区分を確認します。
- `/admin/ai-logs` でAI生成ログを確認します。
- `/settings` で現在のプランと利用状況を確認します。
- Stripe接続前は、Supabaseの `organizations.plan_key` を管理者が手動更新する運用を想定します。
- Google Business Profileは、Basic API Accessが承認されるまでは手動投稿支援モードを正式運用とします。

営業から利用開始までの標準フロー:

1. AIO本体とは別の広告用ランディングページから導入希望者を集めます。
2. 導入希望者は `/apply` の公開申し込みフォームから問い合わせます。
3. AIO運営側がオンライン説明・営業を行います。
4. 契約意思が固まったら、AIO運営側が請求書を発行します。
5. 入金確認後、管理者が申込内容を承認します。
6. 承認後、管理者が利用ユーザーの招待準備またはログイン案内テンプレートを発行します。
7. ユーザーはログイン後、`/onboarding` で初回設定に進みます。
8. 店舗情報、請求書設定、商品、顧客などを登録して利用開始します。

トラブル時の確認項目:

- `Could not find table` が出る場合は、Supabase SQLの反映漏れを確認します。
- 保存後に一覧へ戻るがデータが残らない場合は、Server Actionのinsert/updateエラー、RLS、対象store_idを確認します。
- CSV / Excel取り込みで失敗する場合は、文字コード、区切り文字、列マッピング、エラー行を確認します。
- Google候補取得が失敗する場合は、Gmail / Calendarとは別にGBP API Basic API Access / quota / 対象ビジネスプロフィール管理権限を確認します。
- Gmail / Calendarが失敗する場合は、Google CloudでAPIが有効か、OAuth scope、接続期限、Vercel環境変数を確認します。
- AI生成が失敗する場合は、`OPENAI_API_KEY`、`ai_prompt_templates`、`ai_generation_logs.error_message` を確認します。

課金前に必ず確認すること:

- 実ユーザーの認証、組織作成、organization_membersの作成フロー。
- service role keyを使うサーバー処理で、ユーザーが自分の組織以外のstore_idを指定できないこと。
- 管理者画面をplatform_admin以外が開けないこと。
- Free / Starter / Proの制限を画面だけでなく保存処理でも強制すること。
- Google refresh tokenの暗号化キー `GOOGLE_TOKEN_ENCRYPTION_KEY` を本番で設定すること。

補助金・ITツール登録について:

- AIO Growth Partnerは、会計、受発注、決済、データ連携、AI活用、証跡管理を説明しやすい業務基盤として整理しています。
- 補助金採択、ITツール登録、審査通過を保証するものではありません。
