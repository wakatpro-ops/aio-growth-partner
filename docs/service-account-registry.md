# サービス・アカウント台帳

最終確認日: 2026-07-29

対象開発は「AIO boost」。外部サービスへログインする前に、開発名、所有アカウント、対象環境、Project IDをこの台帳で照合する。

APIキー、OAuth client secret、Webhook署名秘密、DBパスワード、アクセストークン、リフレッシュトークン、本人確認情報は記載しない。秘密値は各サービスとVercelの暗号化環境変数だけに保存する。

## 所有アカウント

| 用途 | アカウント | 使用範囲 |
| --- | --- | --- |
| GitHub | `wakatpro-ops` | Issue、ブランチ、PR、Actions |
| Google Cloud / Supabase / Vercel操作確認 | `waka.t.pro@gmail.com` | 既存AIO資産とstaging構築 |
| Stripe操作確認 | Chromeの既存ログインセッション | AIO boost Platformとsandbox。productionの所有ログインは本番申請前に再確認 |
| Codex開発用Google | `codexwakazono@gmail.com` | 今後新規作成する開発専用サービスの候補。既存AIO資産の所有権は推測で移さない |

所有権移転、新規課金、本番本人確認、本番審査提出は、対象アカウントと影響を確認してから実行する。

## 外部サービス

| サービス | 所有ログイン／チーム | production | staging | 状態 |
| --- | --- | --- | --- | --- |
| GitHub | `wakatpro-ops` | `wakatpro-ops/aio-growth-partner` / `main` | PR・作業ブランチ | 確認済み |
| Vercel | primary email `waka.t.pro@gmail.com` / account `wakatpro-3797` / team `wakatpro-3797's projects` | 既存AIO project / `app.aioboost.jp` | project `aio-growth-partner-staging` (`prj_Vy1rsYrHeROD4XO85jAMshs3tr4P`) / `aio-growth-partner-staging.vercel.app` | staging Ready・環境変数反映済み |
| Supabase | owner login `waka.t.pro@gmail.com` / org `wakatpro-ops's Org` (`gprkjuklwwjleoktmpvp`) | 既存AIO production | `aio-growth-partner-staging` (`zlqqjifitnvorudxbepy`) / Singapore | schema・RLS・seed・private buckets・Data API確認済み |
| Stripe Platform | Chrome既存ログインセッション / organization `エーアイギフト` | account `AIO boost` (`acct_1TyYSSAVpcumfF8E`) | sandbox `AIO boostサンドボックス` (`acct_1TyYSuPSI5nKdxqh`) | sandbox Connect OAuth・Webhook確認済み。本番KYB未提出 |
| Stripe Connect | 各店舗のStripeアカウント | 本番審査後に開始 | AIO専用test connected account (`acct_1TyYtxAjfTPvG2m9`) | staging OAuth接続成功 |
| Google Cloud | `waka.t.pro@gmail.com` / project `AIO Growth Partner` | project ID `aio-growth-partner` /既存production OAuth client | OAuth client `AIO boost staging Vercel` | staging OAuth・Gmail draft・Calendar event成功 |
| Google Business Profile | `waka.t.pro@gmail.com` | Basic API Access再申請予定 | OAuth scopeとAPI有効化のみ | 実投稿はBasic API Access承認後 |

## Staging境界

- URL: `https://aio-growth-partner-staging.vercel.app`
- Supabase project ref: `zlqqjifitnvorudxbepy`
- Vercel project ID: `prj_Vy1rsYrHeROD4XO85jAMshs3tr4P`
- Stripe sandbox account ID: `acct_1TyYSuPSI5nKdxqh`
- Stripe webhook destination ID: `we_1TyYbcPSI5nKdxqhskAlY2ZB`
- Google Cloud project ID: `aio-growth-partner`
- Google Cloud project number: `368944976045`
- Google OAuth audience: External / Testing
- Google test user: `waka.t.pro@gmail.com`

stagingの環境変数はVercelのProduction / Previewへ設定する。この「Production」はVercel project内の環境名であり、AIO boost本番サービスを意味しない。

## 環境変数名

値は台帳、Issue、PR、Gitへ記載しない。

### Supabase / URL

- `NEXT_PUBLIC_APP_URL`
- `APP_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CONNECT_CLIENT_ID`
- `STRIPE_CONNECT_REDIRECT_URI`
- `STRIPE_ACCOUNT_LINK_RETURN_URL`
- `STRIPE_ACCOUNT_LINK_REFRESH_URL`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TOKEN_ENCRYPTION_KEY`

### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_OAUTH_SCOPES`
- `GOOGLE_TOKEN_ENCRYPTION_KEY`

## 2026-07-29 検証記録

- Vercel deployment `DTPhkjqFi76CULQ6QVaEkba3cCRb` がReady。
- `/`、`/apply`、`/login` がHTTP 200。管理画面の認証リダイレクトを確認。
- 公開申込APIをstagingとローカルから実行し、作成した試験行を削除。
- Stripe OAuth開始先が `connect.stripe.com`、callbackがstaging URLであることを確認。
- AIO専用test connected accountを新規作成し、AIO stagingへ接続保存。
- Stripe署名付きWebhook試験がHTTP 200。店舗情報を持たない試験イベントは意図どおりignored。
- Google OAuth開始先が `accounts.google.com`、callbackがstaging URLであることを確認。
- Google OAuth接続を保存し、Gmail下書き作成とGoogleカレンダー予定作成に成功。
- Gmail下書きとカレンダー予定の外部試験データは検証後に削除。
- Google Business Profile実投稿、本番OAuth公開、本番Stripe KYBは未実施。

## 更新ルール

1. 外部サービスを作成する前に、サービス名、用途、所有アカウント、production/staging境界を追加する。
2. 同じ表示名でもIDが違う場合は作業を止め、対象を照合する。
3. productionとstagingでOAuth client、DB、Stripe mode、Webhookを共有しない。
4. 秘密値は値ではなく環境変数名と保存先だけを記録する。
5. 本番審査、本人確認、課金、所有権移転は実行日と結果を追記する。
