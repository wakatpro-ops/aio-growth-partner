# Instagram直接接続（Facebook連携を維持）

## 確認結果・2026-10-14

- ユーザー依頼: Instagram直接接続の権限・審査状況を確認し、既存Facebook連携を維持して追加実装する。
- Chromeで既存のMetaアプリ `AIO boost`（App ID `1756636388611237`、portfolio `1386074122966628`）の管理画面を開いた。既存ログインが有効。
- Instagram製品 `AIO boost-IG` / Instagram App ID `1069884112049122` は存在する。InstagramビジネスログインのリダイレクトURLは未設定。秘密キーはマスクのままで未取得。
- `instagram_business_basic` と `instagram_business_content_publish` は「アプリレビューに追加」状態で、承認済みとは表示されていない。
- 既存の再申請下書き `1800352460906296` は「未申請」。既存のFacebook経由6権限は前回非承認、`public_profile` のみ承認済み。アプリは未公開。Facebook設定・下書き・接続・公開状態は変更していない。
- 直接接続では上記2権限だけを要求する。DM・コメント・広告・追加インサイト権限は今回の範囲外。

確認先: MetaアプリのInstagramユースケース「アクセス許可と機能」「InstagramログインによるAPI設定」およびアプリレビュー画面。

## 実装方針

1. 接続画面の主入口を「Instagramを接続」にする。Facebookページの接続・選択・解除は別セクションとして維持する。
2. Instagram直接接続を別providerで保存し、既存の `external_provider=meta` の資格情報や接続履歴を上書きしない。
3. 認証はInstagramアプリID・Instagram App Secretを使う。Facebook用App Secretを流用しない。
4. OAuth stateを操作者・店舗・環境・ブラウザに紐付け、期限・改ざん・再使用を検証する。別店舗・無権限・停止アカウントを拒否する。
5. 短期トークンを長期トークンへ交換し、店舗に紐付けて暗号化する。有効期限・再接続・更新・解除・監査を扱う。
6. 投稿ジョブに承認時の接続providerとアカウントを記録する。接続変更で既存の予約投稿を別アカウントへ送らない。Facebookと既存Facebook経由Instagramジョブは従来経路を維持する。
7. 一般店舗向けの審査承認を確認するまでは、直接接続を審査専用の許可済みテスト店舗に限定する。未設定・審査中を「接続済み」と表示しない。
8. 合成データとモックで認証・トークン更新・解除・店舗分離・既存Facebookの回帰を検証した後、承認された審査用アカウントで接続テストを行う。正式申請・規約同意・実投稿は別途確認する。

## 実装・設定状況（2026-10-15）

ユーザーから2権限追加・専用callback登録・既存Instagram秘密キーの保護済みVercel保存について具体的承認を受領。正式申請・規約同意・公開投稿はこの承認に含まれない。

- Chrome上の既存Metaログインと対象アプリの所有関係を確認。別のFacebookアカウントには切り替えていない。個人のログイン識別子はこの公開リポジトリには掲載しない。
- 上記2権限を追加し、アプリレビュー画面の「未申請」に両方が表示されていることを再確認。既存Facebookの6権限・設定は保持。アプリは未公開のまま。
- 専用callbackを保存済み。本番 `https://app.aioboost.jp/api/instagram/oauth/callback`、staging `https://staging.aioboost.jp/api/instagram/oauth/callback`。この2件以外の環境への認証は拒否する。
- 秘密キーはマスクのまま未取得。Vercelの既存所有者でのログインが認証アプリの本人確認で停止。ユーザーへChrome上での確認を依頼し、別の資格情報や経路で回避していない。Vercelへの新しいキー設定保存・実機OAuthは未完了。
- コード実装済み。直接InstagramとFacebook経由を別providerとして保持。旧予約ジョブの投稿先は変更しない。接続の世代と対象IDを固定し、公開直前も権限を再確認する。
- ステージング `zlqqjifitnvorudxbepy` と本番 `tykanoxkfmixdrmyqelq` に、マイグレーション `202610150001` を適用・履歴登録済み。本番の既存Facebook接続5件は適用前後のフィンガープリントが完全一致。一般店舗への有効化は行わない。
- 合成ユーザー・店舗で所属、無権限、停止、別環境、state再使用、競合、解除、更新、再接続、Facebook不変を検証し成功。合成データは削除済み。既存Facebook行数0・フィンガープリント不変、認証試行0を確認。実店舗データ・公開投稿・メール送信は行っていない。
- 単体・投稿実行・マーケティング会話の回帰、型・Lint、本番ビルド、秘密キー漏えい・UX・即時反応の検査成功。ローカル隔離画面をPCと390pxスマホで確認し、ページ全体の横はみ出しなし。実機認証成功とは区別する。

## 環境設定と解放条件

既存プロジェクト `aio-growth-partner` と `aio-growth-partner-staging` を使う。各プロジェクトのProduction環境で別々に設定し、既存Facebook環境変数・暗号化キーは変更しない。

- `INSTAGRAM_APP_ID=1069884112049122`
- `INSTAGRAM_APP_SECRET`: 既存Instagram製品の秘密キー。Sensitive設定で保存。チャット・Git・平文ファイル・スクリーンショットに出さない。
- `INSTAGRAM_REDIRECT_URI`: それぞれの正式ドメインの上記callback。
- `INSTAGRAM_GRAPH_VERSION=v26.0`
- `INSTAGRAM_LOGIN_ENABLED=true` は秘密キー保存・審査専用店舗の設定完了後のみ。
- `INSTAGRAM_ADVANCED_ACCESS_APPROVED=false` を維持。一般店舗への解放はMetaのAdvanced Access承認とアプリ公開を実際に確認してから。
- `INSTAGRAM_LOGIN_TEST_STORE_IDS`: 本番は審査専用の架空店舗 `fd7330a4-c4f8-425a-8eea-213b9c8d5b92` のみ。stagingには本番店舗データをコピーしない。
- トークン暗号化には安定した既存 `SNS_TOKEN_ENCRYPTION_KEY` または `GOOGLE_TOKEN_ENCRYPTION_KEY` を再利用。必要な場合だけ専用キーを保護済み設定へ保存する。Instagram App Secretを暗号化キーとして流用しない。

DB初期構築時は既存の権限・メニューworkbenchマイグレーションを先に適用した後、今回の追加マイグレーションを適用する。一般店舗では接続ボタンを解放せず、下書き・手動投稿と既存Facebook経由の接続を維持する。

## 残る検証・審査準備

1. Vercelの本人確認後に保護済みキーと環境設定を保存・読み戻し、審査専用店舗のテスト設定を反映。
2. 審査専用Instagramプロアカウントのアプリ役割と利用許可を確認し、実機OAuth→プロフィール→再接続/解除の動作確認。公開投稿は別途承認。
3. 操作動画・新2権限の用途説明を準備。正式な再申請は別途確認。
4. Metaのdeauthorization URL / data-deletion request URLは未設定のまま。署名検証付きエンドポイントを実装・検証するまで、未実装URLを登録しない。既存の公開削除案内 `/data-deletion` はInstagram/Facebook別の解除方法を追記済み。

## 公式仕様

- [Instagramログインを使ったInstagram API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login): プロアカウント（ビジネス/クリエイター）が対象で、Facebookページとのリンクは不要。
- [Instagram用のビジネスログイン](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login): 自社が所有・管理していないアカウントへの提供にはAdvanced Accessが必要。Instagram専用ID・秘密キーを使用。コード交換の応答は `data` 配列を含む形式。長期トークンは60日、発行24時間後以降かつ有効な間に更新できる。`enable_fb_login=false` でFacebookログインの選択肢を非表示にできる。
- 上記の公式ページは2026-10-14にChromeで閲覧。認証・トークン・投稿APIを混同しない。
