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
