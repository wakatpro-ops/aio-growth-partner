# 成果可視化 認証・認可テストマトリクス

Issue #35の正本。成果可視化（Issue #31）を、画面の表示制御だけでなくサーバーとDBで拒否できることを確認する。

## 判定原則

- Supabase Authの認証成功だけでは店舗データへアクセスさせない。
- `user_profiles`、`organization_members`、`organizations`がすべて`active`かつ未削除であることを要求する。
- 申請が承認・入金・アカウント発行済みでも、組織所属がなければ既存店舗へはアクセスさせない。
- `viewer`は閲覧のみ。`org_owner`、`store_manager`、`staff`は成果設定を編集できる。
- `platform_admin`はactiveな運営アカウントに限り組織横断アクセスを許可する。
- APIと画面は他組織店舗の存在を404相当で秘匿する。未認証は401またはログインへ遷移する。
- DBはRLSに加え、`organization_id`と`store_id`等の親子整合性を外部キーで保証する。

## 組合せ

| 認証・セッション | アカウント | 申請 | 所属／役割 | 自組織 読取 | 自組織 編集 | 他組織 | DB RPC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| なし／無効 | - | 任意 | 任意 | 拒否 | 拒否 | 拒否 | false |
| active | active | 申請中 | 未所属 | 拒否 | 拒否 | 拒否 | false |
| active | active | 承認済み・未入金 | 未所属 | 拒否 | 拒否 | 拒否 | false |
| active | active | 承認・入金・発行済み | 未所属 | 拒否 | 拒否 | 拒否 | false |
| active | suspended/archived | 任意 | owner相当 | 拒否 | 拒否 | 拒否 | false |
| active | active | 任意 | pending/archived所属 | 拒否 | 拒否 | 拒否 | false |
| active | active | 任意 | archived/suspended組織 | 拒否 | 拒否 | 拒否 | false |
| active | active | 任意 | viewer | 許可 | 拒否 | 拒否 | member=true/editor=false |
| active | active | 任意 | staff | 許可 | 許可 | 拒否 | true/true |
| active | active | 任意 | store_manager | 許可 | 許可 | 拒否 | true/true |
| active | active | 任意 | org_owner | 許可 | 許可 | 拒否 | true/true |
| active | active | 任意 | platform_admin | 許可 | 許可 | 許可 | admin=true |

## 入口別の必須負テスト

1. URL直接入力: `/stores/:storeId/results` と `/results/deleted`。
2. Server Action: キーワード追加をviewer、未所属、他組織ユーザーで送信してDB件数が変化しない。
3. API: CSV exportと店舗summaryでデータ本文を返さない。
4. DB REST: 5つの成果テーブルを、anon／未所属／viewer／他組織JWTで読み書きできない。
5. DB RPC: `is_org_member`、`is_org_editor`、`is_platform_admin`が状態と役割を正しく返す。
6. ID差替え: 自組織の`organization_id`と他組織の`store_id`を組み合わせた挿入を拒否する。
7. 端末セッション: 2端末の有効セッション、片方のアプリログアウト、cookieなし、偽造cookieを確認する。

完全な人物・状態マトリクスはstagingで一時fixtureを作成して実施し、終了時にAuthユーザーを含めて削除する。本番では匿名・無効セッション・他組織ID差替えを非破壊で確認する。
