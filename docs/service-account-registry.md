# AIO boost サービス・アカウント台帳

最終確認日: 2026-08-15

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
| Vercel | account `wakatpro-3797` / team `wakatpro-3797's projects` | project `aio-growth-partner` / `app.aioboost.jp` | project `aio-growth-partner-staging` / `staging.aioboost.jp` | 2026-08-15にPro・activeを確認。両環境のProductionへ個別のSensitiveな`CRON_SECRET`を設定。本番にはMeta用のSensitiveな`META_APP_SECRET`と`SNS_TOKEN_ENCRYPTION_KEY`も設定し、再デプロイ済み（値は記録しない） |
| Supabase | owner `waka.t.pro@gmail.com` / `wakatpro-ops's Org` (`gprkjuklwwjleoktmpvp`) | project `aio-growth-partner` (`tykanoxkfmixdrmyqelq`) | project `aio-growth-partner-staging` (`zlqqjifitnvorudxbepy`) | 2026-08-15にOrgのPro・Spend Cap有効を確認。月額基本料＋Project別Compute。横断料金台帳を参照 |
| Google Cloud | 開発操作 `waka.t.pro@gmail.com` | project `AIO Growth Partner` / ID `aio-growth-partner` / number `368944976045` / production OAuth client / `app.aioboost.jp` | staging OAuth client `AIO boost staging Vercel` / `staging.aioboost.jp` | 2026-08-07に外部・本番公開、最小scope、ABロゴ保存を確認。法人所有・権限構成は要確認 |
| Meta for Developers | Chrome既存ログイン（所有メールは要確認） | app `AIO boost` / App ID `1756636388611237` / Instagram App ID `1069884112049122` / `app.aioboost.jp` | 未作成 | 2026-08-15にABロゴ、公開URL、データ削除URL、本番OAuth callback、使用中の6権限（`public_profile`を含む）を保存し、技術提供者として確定。未使用の`business_management`は除外。データ取扱回答はVercel＝IT・米国、Supabase＝IT・シンガポール、管理主体＝株式会社 Navi Life・日本で保存済み。未公開。審査手順・認証情報、APIテスト、動画、ビジネス／アクセス認証、最終申請が未完了。秘密値は記録しない |
| Google Search Console | `waka.t.pro@gmail.com` | domain property `aioboost.jp` | なし | 2026-08-07にDNS TXTで所有権確認済み。確認文字列は記録しない |
| Google Business Profile | 開発操作 `waka.t.pro@gmail.com` | Basic API Access再申請予定 | staging実投稿なし | 2026-08-07確認。申請に使う株式会社 Navi Lifeのプロフィール管理権限は要確認 |
| Stripe Platform | organization `エーアイギフト` | account `AIO boost` | account `AIO boostサンドボックス` | 本番KYB・運営会社との契約主体整合は要確認 |

## Google審査方針

- 初回production OAuthは `openid email profile business.manage` の最小構成で申請する。
- `gmail.compose` は制限付きスコープのため、初回production審査から外しstaging検証に限定する。
- `calendar.events` は初回審査から外し、Business Profile承認後に必要性を再評価する。
- OAuthホームページは `https://app.aioboost.jp/`、利用規約は `https://app.aioboost.jp/terms`、プライバシーポリシーは `https://app.aioboost.jp/privacy` を使用する。
- Google OAuth公開審査とGoogle Business Profile Basic API Accessは別申請として管理する。
- ABロゴはGoogle Auth PlatformのDraft Brandingへ保存済み。機密・制限付きscopeのデータアクセス検証は不要。Brandingページの「Verify Branding」表示待ちとしてIssue #1で追跡する。

## 確認元

- ユーザー回答（2026-08-07）
- `https://aioboost.jp/company`
- Google Cloud Console project `aio-growth-partner`
- Meta for Developers app `1756636388611237`
- GitHub Issue `wakatpro-ops/aio-growth-partner#1`
