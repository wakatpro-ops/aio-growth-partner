# AIO boost サービス・アカウント台帳

最終確認日: 2026-08-07

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
| Vercel | `wakatpro-3797` | project `aio-growth-partner` / `app.aioboost.jp` | project `aio-growth-partner-staging` / `aio-growth-partner-staging.vercel.app` | 2026-07-29確認 |
| Supabase | `wakatpro-ops's Org` | project `aio-growth-partner` | project `aio-growth-partner-staging` | 2026-07-29分離確認 |
| Google Cloud | 開発操作 `waka.t.pro@gmail.com` | project `AIO Growth Partner` / ID `aio-growth-partner` / number `368944976045` / production OAuth client | staging OAuth client `AIO boost staging Vercel` | 2026-08-07 Google Cloud画面で確認。法人所有・権限構成は要確認 |
| Google Business Profile | 開発操作 `waka.t.pro@gmail.com` | Basic API Access再申請予定 | staging実投稿なし | 2026-08-07確認。申請に使う株式会社 Navi Lifeのプロフィール管理権限は要確認 |
| Stripe Platform | organization `エーアイギフト` | account `AIO boost` | account `AIO boostサンドボックス` | 本番KYB・運営会社との契約主体整合は要確認 |

## Google審査方針

- 初回production OAuthは `openid email profile business.manage` の最小構成で申請する。
- `gmail.compose` は制限付きスコープのため、初回production審査から外しstaging検証に限定する。
- `calendar.events` は初回審査から外し、Business Profile承認後に必要性を再評価する。
- OAuthホームページは `https://aioboost.jp/`、利用規約は `https://app.aioboost.jp/terms`、プライバシーポリシーは `https://app.aioboost.jp/privacy` を使用する。
- Google OAuth公開審査とGoogle Business Profile Basic API Accessは別申請として管理する。

## 確認元

- ユーザー回答（2026-08-07）
- `https://aioboost.jp/company`
- Google Cloud Console project `aio-growth-partner`
- GitHub Issue `wakatpro-ops/aio-growth-partner#1`
