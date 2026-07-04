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

## Vercel Notes

- PDF出力に追加のVercel環境変数は不要です。
- Phase 3-AのAI生成には `OPENAI_API_KEY` が必要です。未設定の場合はデモ出力で画面確認できます。
- SupabaseにPhase 3-Aのテーブルを追加してから、本番で投稿下書き作成やAI改善提案作成を確認してください。
- Phase 4-AのCSV / Excel取り込みにはSupabase Storage bucket `import-files` が必要です。
- 日本語フォントを完全埋め込みする方式へ移行する場合は、フォントファイルをリポジトリに含め、サーバー側だけでPDF生成してください。
- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側のみで使用し、`NEXT_PUBLIC_` を付けません。
