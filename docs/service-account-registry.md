# AIO boost サービス・アカウント台帳

最終確認日: 2026-09-01

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
| Meta for Developers | Facebook本人アカウント `中堀 茂` / business email `info@aioboost.jp` / business portfolio `株式会社 Navi Life` (`1386074122966628`) | app `AIO boost` / App ID `1756636388611237` / Instagram App ID `1069884112049122` / `app.aioboost.jp` | 未作成 | 2026-09-03確認。ビジネス認証は法人名義 `NAVI LIFE, K.K.` で認証済み（元の認証日: 2026-08-30）。AIO boostアプリは株式会社 Navi Lifeのポートフォリオにリンク済みで、中堀 茂がフルアクセス。`business_management` を含む7権限で本番再認証を完了し、審査用Facebookページ `AIO boost 審査用` (`1328570033666381`) とInstagramビジネスアカウント `@supercarowners1548` (`17841406221578652`) を本番店舗の投稿先として接続済み。2026-09-03に固定画像・固定文の審査用投稿をFacebook・Instagramの両方へ本番APIで公開し、公開画面で確認済み。操作動画を作成し、動画が必要な6権限のApp Review下書きへ添付・保存済み。MetaのAPIテスト表示は最大24時間の反映待ち。審査専用AIO boostログインと法的同意、最終送信は未完了。Instagram利用者のポートフォリオ権限は基本アクセスに制限。Instagramの公開連絡先は設定していない。アプリ未公開。秘密値は記録しない |
| Google Search Console | `waka.t.pro@gmail.com` | domain property `aioboost.jp` | 顧客店舗ごとのpropertyは未接続 | 2026-08-07にDNS TXTで所有権確認済み。2026-08-16に成果画面と`webmasters.readonly`の増分OAuth・日次同期コードを実装。顧客店舗は自身のpropertyへの閲覧権限同意が必要。確認文字列・OAuth tokenは記録しない |
| Google Business Profile | 開発操作 `waka.t.pro@gmail.com` | Basic API Access申請済み・審査中 | staging実投稿なし | 2026-08-24確認。My Business Account Management APIは有効だがRequests per minute割り当てが`0`で、Basic API Accessは未承認。審査結果メールは未確認 |
| Stripe Platform | organization `エーアイギフト` | account `AIO boost` | account `AIO boostサンドボックス` | 本番KYB・運営会社との契約主体整合は要確認 |

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
