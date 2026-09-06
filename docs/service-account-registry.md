# AIO boost サービス・アカウント台帳

最終確認日: 2026-09-07

秘密鍵、APIキー、OAuthトークン、パスワード、MFAコードは記録しない。

## 運営主体

| 項目 | 確認内容 | 状態 |
| --- | --- | --- |
| サービス | AIO boost | 確認済み |
| 運営会社 | 株式会社 Navi Life | ユーザー申告・公式会社概要で確認 |
| 所在地 | 東京都杉並区梅里二丁目35番13号 | ユーザー申告・公式会社概要で確認 |
| 代表者 | 代表取締役 中堀 茂 | ユーザー申告・公式会社概要で確認 |
| 設立 | 2017年2月 | ユーザー申告・公式会社概要で確認 |
| 公式サイト | `https://aioboost.jp/` | 2026-08-07公開確認 |
| 公開問い合わせ先 | `info@aioboost.jp` | 公式会社概要で確認 |
| 開発担当 | ユーザー本人 | 2026-08-07ユーザー確認 |

## 開発サービス

| サービス | 所有ログイン／チーム | production | staging | 状態 |
| --- | --- | --- | --- | --- |
| GitHub | `wakatpro-ops` | `wakatpro-ops/aio-growth-partner` / `main` | PR・作業ブランチ | 確認済み |
| Vercel | account `wakatpro-3797` / team `wakatpro-3797's projects` | project `aio-growth-partner` / `app.aioboost.jp` | project `aio-growth-partner-staging` / `staging.aioboost.jp` | 2026-08-15にPro・activeを確認。両環境のProductionへ個別のSensitiveな`CRON_SECRET`を設定（値は記録しない） |
| Supabase | owner `waka.t.pro@gmail.com` / `wakatpro-ops's Org` (`gprkjuklwwjleoktmpvp`) | project `aio-growth-partner` (`tykanoxkfmixdrmyqelq`) | project `aio-growth-partner-staging` (`zlqqjifitnvorudxbepy`) | 2026-08-15にOrgのPro・Spend Cap有効を確認。月額基本料＋Project別Compute。横断料金台帳を参照 |
| Google Cloud | 開発操作 `waka.t.pro@gmail.com` | project `AIO Growth Partner` / ID `aio-growth-partner` / number `368944976045` / production OAuth client / `app.aioboost.jp` | staging OAuth client `AIO boost staging Vercel` / `staging.aioboost.jp` | 2026-08-24に外部・本番環境、Branding検証済み・表示中、`openid email profile business.manage`が非機密scope、機密・制限付きscopeなしを確認。法人所有・権限構成は要確認 |
| Meta for Developers | Facebook本人アカウント `中堀 茂` / business email `info@aioboost.jp` / business portfolio `株式会社 Navi Life` (`1386074122966628`) | app `AIO boost` / App ID `1756636388611237` / Instagram App ID `1069884112049122` / `app.aioboost.jp` | 未作成 | 2026-09-06確認。ビジネス認証は法人名義 `NAVI LIFE, K.K.` で認証済み（元の認証日: 2026-08-30）。AIO boostアプリは株式会社 Navi Lifeのポートフォリオにリンク済みで、中堀 茂がフルアクセス。審査用Facebookページ `AIO boost 審査用` (`1328570033666381`) とInstagramビジネスアカウント `@supercarowners1548` (`17841406221578652`) を接続し、両方への本番API投稿を確認済み。操作動画、審査担当者向け手順、審査用アカウントを含む提出情報を整備し、`business_management`、`pages_manage_posts`、`pages_show_list`、`instagram_content_publish`、`pages_read_engagement`、`public_profile`、`instagram_basic` の7権限をMeta App Reviewへ正式送信済み。申請ステータスは「審査中」で、Meta画面には20日以内の審査予定と表示。Instagram利用者のポートフォリオ権限は基本アクセスに制限。Instagramの公開連絡先は設定していない。アプリ未公開。秘密値は記録しない |
| LINE Official Account / Messaging API | LINEログイン `若園 忠義 waka` / organization `AIOBoostサポート` (`BM74147211322`) | account `AIOBoostサポート` / Basic ID `@056miwxi` / Channel ID `2011470356` | 専用アカウントなし | 2026-09-07確認。provider `株式会社 Navi Life`、Privacy `https://app.aioboost.jp/privacy`、Terms `https://app.aioboost.jp/terms`、Webhook `https://app.aioboost.jp/api/line/webhook` を設定。Channel secretと長期Channel Access TokenはVercel ProductionへSecretとして保存し、値は台帳へ記録しない。Webhook利用・再送を有効化し、LINE Developersの検証に成功。本番の署名なしWebhookと未認証CronがともにHTTP 401で拒否されることを確認。管理画面のプラン表示は「コミュニケーション」だが、課金状態は未確認（UNKNOWN） |
| Google Search Console | `waka.t.pro@gmail.com` | domain property `aioboost.jp` | 顧客店舗ごとのpropertyは未接続 | 2026-08-07にDNS TXTで所有権確認済み。2026-08-16に成果画面と`webmasters.readonly`の増分OAuth・日次同期コードを実装。顧客店舗は自身のpropertyへの閲覧権限同意が必要。確認文字列・OAuth tokenは記録しない |
| Google Business Profile | 開発操作 `waka.t.pro@gmail.com` | Basic API Access申請済み・審査中／進捗照会済み | staging実投稿なし | 2026-09-03確認。元ケース `7-9178000041162`。My Business Account Management APIの割り当ては`0 QPM`で未承認、審査結果・追加資料依頼メールなし。「一般社団法人 地熱電力推進協会」は公式申請画面で確認済みプロフィールとして選択可能。重複申請せず公式APIサポートへ進捗照会を送信し、照会ケース `9-7440000040781` が発行された |
| Stripe Platform | organization `エーアイギフト` | account `AIO boost` | account `AIO boostサンドボックス` | 本番KYB・運営会社との契約主体整合は要確認 |

- 2026-09-06: 予約管理第1段階は、既存のVercel ProとSupabase環境を再利用する方針とした。新しい有料サービス契約は追加せず、外部予約連携は提供元の公式API・契約・審査条件を確認してから個別に登録する。
- 2026-09-06: Issue #135のLINE予約第2段階について、ステージングSupabaseへ店舗連携・同意・会話状態・Webhook冪等履歴・前日リマインド・LINE予約専用RPCを適用。未所属、別店舗、閲覧者、未同意、誤店舗、重複時間の負の統合テストをロールバック付きで通過。本番反映と実アカウント接続はPR後に行う。
- 2026-09-07: Issue #135のLINE予約第2段階をPR #139で本番反映。Vercel ProductionへLINEの秘密情報を保存して再デプロイし、Webhook利用・再送を有効化。LINE DevelopersのWebhook検証と本番公開エンドポイント統合テスト3件が成功。実ユーザーによる友だち追加・店舗リンク・予約往復確認は最終受入テストとして残す。
- 2026-09-03: Google Workspaceで `meta-review@aioboost.jp` を `info@aiaigift.com` の予備メールアドレス（エイリアス）として追加済み。追加ライセンスなし。16:44にSupabaseのパスワード再設定メールを再送したが、`email_address_invalid`（HTTP 400）で拒否された。`aioboost.jp` の公開MXはGoogleを指しておりDNS上は有効。Supabase側のメールアドレス検証を解消するか、審査用アカウントを別の実在メールへ変更する必要がある。パスワードや再設定URLは記録しない。

## アプリ内運営管理者

| メール | 権限 | 状態 |
| --- | --- | --- |
| `info@aiaigift.com` | `platform_admin` | 2026-08-23、旧誤記 `info@aiaiagift.com` から訂正し、確認済み・有効を本番DBで確認 |
| `shige@aioboost.jp` | `platform_admin` | 2026-08-30、Google Workspaceで転送先までの配信経路は正常と確認。追加の確認メール再送はSupabaseのメール送信レート上限超過で拒否されたため未送信。本人によるメール確認・パスワード設定待ち |

- 運営管理者ログイン後は店舗用 `/dashboard` ではなく運営用 `/admin` へ遷移する。
- 管理者パスワードは台帳・Git・Issueへ保存せず、本人が招待メールから設定する。

## Google審査方針

- 初回production OAuthは `openid email profile business.manage` の最小構成で申請する。
- `gmail.compose` は制限付きスコープのため、初回production審査から外しstaging検証に限定する。
- `calendar.events` は初回審査から外し、Business Profile承認後に必要性を再評価する。
- OAuthホームページは `https://app.aioboost.jp/`、利用規約は `https://app.aioboost.jp/terms`、プライバシーポリシーは `https://app.aioboost.jp/privacy` を使用する。
- Google OAuth公開審査とGoogle Business Profile Basic API Accessは別申請として管理する。
- ABロゴはGoogle Auth PlatformのDraft Brandingへ保存済み。機密・制限付きscopeのデータアクセス検証は不要。Brandingページの「Verify Branding」表示待ちとしてIssue #1で追跡する。
- 成果画面のSearch Console連携は`webmasters.readonly`だけを増分要求する。初回production OAuthの`business.manage`審査と混同せず、Google側の同意・検証要否を確認してから顧客接続を開始する。権限未承認中も実測値の手動登録、CSV出力、印刷レポートは利用できる。

## 成果の見える化

- GitHub Issue: `wakatpro-ops/aio-growth-partner#31`
- 既存契約を再利用: Vercel Pro（画面・日次Cron）とSupabase Pro（設定、キーワード、比較snapshot、RLS、監査ログ）。新しい有料順位計測サービスは契約していない。
- 日次Cron: `/api/cron/search-visibility`。`CRON_SECRET`で保護し、Search Console権限・propertyが揃った店舗だけを同期する。
- Google Business Profileの表示・電話・経路案内はBasic API Access承認後に追加する。Google公式APIで取得できないマップ絶対順位は表示しない。
- AI回答は単発順位ではなく複数質問・複数回の定点観測として今後追加し、推薦保証には使わない。

## 確認元

- ユーザー回答（2026-08-07）
- `https://aioboost.jp/company`
- Google Cloud Console project `aio-growth-partner`
- Meta for Developers app `1756636388611237`
- GitHub Issue `wakatpro-ops/aio-growth-partner#1`
