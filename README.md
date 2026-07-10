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
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
```

`SUPABASE_SERVICE_ROLE_KEY` と `OPENAI_API_KEY` はサーバー側だけで使用します。クライアント側に露出させないため、`NEXT_PUBLIC_` を付けません。
GitHubにはキーの実値を含めず、ローカルでは `.env.local`、VercelではProject SettingsのEnvironment Variablesに設定します。

将来用の拡張ポイント:

```env
# STRIPE_SECRET_KEY=
# STRIPE_WEBHOOK_SECRET=
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
# FREEE_CLIENT_ID=
# FREEE_CLIENT_SECRET=
# FREEE_REDIRECT_URI=
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

Phase 5-Cでは、Googleビジネスプロフィール、Gmail、Googleカレンダーへ安全に連携するための土台を追加します。外部APIへの実投稿、メール送信、予定作成はまだ行わず、OAuth接続、接続状態の見える化、送信前確認、ログ保存までを扱います。

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
6. 承認済みのリダイレクトURIに `https://aio-growth-partner.vercel.app/api/google/oauth/callback` を追加します。
7. Client ID と Client Secret を取得します。
8. Vercel の Project Settings から Environment Variables を開き、次の値を追加します。
9. Vercelで本番環境をRedeployします。
10. AIO Growth Partnerの `/stores/store-auto-demo/settings/google` を開き、「Googleに接続」を押します。

Vercelに入れる値:

```env
GOOGLE_CLIENT_ID=Google Cloudで取得したClient ID
GOOGLE_CLIENT_SECRET=Google Cloudで取得したClient Secret
GOOGLE_REDIRECT_URI=https://aio-growth-partner.vercel.app/api/google/oauth/callback
GOOGLE_OAUTH_SCOPES=openid email profile https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events
GOOGLE_TOKEN_ENCRYPTION_KEY=ランダムな長い文字列
```

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
- API有効化済みでもBasic API Access / quota未承認で候補取得が失敗する場合は、AIO Growth Partner側の不具合ではなくGoogle承認待ちとして扱います。承認完了まではPhase 5-Dの手動投稿支援モードを使います。
- Basic API Access申請済みケースIDは `3-6455000041311` です。審査目安は7〜10営業日で、承認待ちの間は `/stores/[storeId]/settings/google/business-profile` に「Google審査待ち」として記録します。
- 承認後は同じ画面でAPI statusを「API承認済み」に変更し、`account_id` / `location_id` 候補取得へ戻ります。
- 参考: https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list
- 参考: https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list
- 参考: https://developers.google.com/my-business/content/posts-data
- 参考: https://developers.google.com/my-business/content/limits

Phase 5-C-6: GBP手動投稿支援:

- Google Business Profile APIのBasic API Access / quota付与待ちの間は、実API投稿ではなく手動投稿運用を行います。
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

## Vercel Notes

- PDF出力に追加のVercel環境変数は不要です。
- Phase 3-A以降のAI生成、Phase 4-BのAI月次売上レポート、Phase 4-Cの次アクション提案、Phase 5-A以降の集客アクション生成には `OPENAI_API_KEY` が必要です。未設定の場合はデモ出力で画面確認できます。
- Phase 5-CのGoogle OAuth接続には `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GOOGLE_REDIRECT_URI`、`GOOGLE_TOKEN_ENCRYPTION_KEY` が必要です。
- SupabaseにPhase 3-Aのテーブルを追加してから、本番で投稿下書き作成やAI改善提案作成を確認してください。
- Phase 4-AのCSV / Excel取り込みにはSupabase Storage bucket `import-files` が必要です。
- 日本語フォントを完全埋め込みする方式へ移行する場合は、フォントファイルをリポジトリに含め、サーバー側だけでPDF生成してください。
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用し、`NEXT_PUBLIC_` を付けません。
