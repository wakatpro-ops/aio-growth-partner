# AIO boost staging運用手順

最終確認日: 2026-07-29

## 目的

Mac miniをAIO boostの主開発機として使い、productionへ影響を与えずにSupabase、Vercel、Stripe Connect、Google OAuthを検証する。

## 固定URLと環境

- App: `https://aio-growth-partner-staging.vercel.app`
- Supabase project ref: `zlqqjifitnvorudxbepy`
- Vercel project: `aio-growth-partner-staging`
- Stripe: `AIO boostサンドボックス`
- Google OAuth client: `AIO boost staging Vercel`

秘密値と本番キーはこの文書へ記載しない。

## Mac miniでの初期化

```sh
cd /Users/waka-macmini/Documents/Codex/Projects/aio-growth-partner
pnpm install --frozen-lockfile
./scripts/setup-staging-env.sh
pnpm check:secrets
pnpm lint
pnpm build
```

`scripts/setup-staging-env.sh` はSupabase CLIからstagingのpublishable keyと専用secret keyを取得し、mode 600の`.env.local`を作る。Stripe、Googleなどの秘密値はVercelからローカルへ自動コピーしない。

## 開発前チェック

```sh
git status -sb
git fetch --prune
git pull --ff-only
pnpm check:secrets
```

- `main`へ直接コミットしない。
- `.env*`、`.vercel/`、`supabase/.temp/`をGitへ追加しない。
- productionのSupabase project ref、Stripe live key、本番OAuth clientをstagingで使わない。

## デプロイ後チェック

1. Vercel deploymentがReadyであることを確認。
2. `/`、`/apply`、`/login` がHTTP 200であることを確認。
3. `/admin/applications` が未認証時にログインへリダイレクトすることを確認。
4. Stripe OAuthの遷移先が `connect.stripe.com`、redirect URIがstagingであることを確認。
5. Google OAuthの遷移先が `accounts.google.com`、redirect URIがstagingであることを確認。
6. Stripe Webhookの署名検証が成功することを確認。
7. Googleの実行テストは自己アカウントを使い、Gmailは下書きまで、Calendarは明確なtestタイトルで作成する。
8. 外部試験データは確認後に削除する。

## 本番へ進める前の停止点

次の操作はstaging確認完了後に、使用アカウントと提出内容を最終確認してから行う。

- Stripe live KYB、本人確認、銀行口座、本番APIキーと本番Webhookの有効化。
- Google Auth Platformの「アプリを公開」と機密・制限付きスコープ審査提出。
- Google Business Profile Basic API Access再申請と実店舗への投稿。
- Vercel production環境変数の変更。
- production DB migration。

## 本番審査資料

### Stripe

- AIO boostのサービス説明、価格、返金・キャンセル、利用規約、プライバシーポリシー。
- Platformと店舗Connected Accountの役割。
- 店舗が直接決済を受けるフロー。
- Connect onboarding、請求書決済、Webhook反映のデモ動画。

### Google

- OAuth同意画面からAIO boostへ戻る一連の動画。
- `gmail.compose` は下書き作成のみで自動送信しない説明。
- `calendar.events` は店舗の集客・点検予定作成に使う説明。
- `business.manage` は店舗が管理するGoogle Business Profile候補取得と投稿準備に使う説明。
- ホーム、利用規約、プライバシーポリシー、データ削除・接続解除手順。

## 障害切り分け

- OAuth開始でAIO画面へ戻る: Vercelの必須環境変数名とredirect URIを確認。
- OAuth callbackで失敗: client secret、state暗号化キー、Supabase service role、token保存先を確認。
- Google APIが403: API有効化、scope、test user、Basic API Accessを分けて確認。
- Stripe Webhookが400: endpointごとのsigning secretとVercel環境を確認。
- Stripe Connectが自己接続になる: Platform自身ではなくAIO専用test connected accountを選ぶ。
- build成功後だけ失敗: Vercel Runtime LogsとSupabaseの連携ログを確認する。
