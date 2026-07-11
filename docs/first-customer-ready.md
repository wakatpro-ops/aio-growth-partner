# AIO Growth Partner 1社目導入前チェック

この資料は、AIO Growth Partnerを実店舗1社目へ案内する前に、販売前、契約前、導入前、運用前の確認を行うための管理者向けメモです。

アプリ内ページ: `/admin/first-customer-ready`

本番運用URL: `https://app.aioboost.jp`
公開申し込みURL: `https://app.aioboost.jp/apply`
旧Vercel URL `https://aio-growth-partner.vercel.app` は移行期間中の確認用です。

## 営業から承認、利用開始までの運用

1. 広告LPまたは紹介導線から、公開申し込みフォーム `https://app.aioboost.jp/apply` へ誘導します。
2. 管理者は `/admin/applications` で申し込みを確認します。
3. `/admin/applications/[applicationId]` で説明予定、説明済み、請求書発行済み、入金確認済み、承認済み、アカウント発行済み、見送りを管理します。
4. 契約意思が固まったら、AIO運営側が請求書を発行します。
5. 入金確認後にだけ、管理者が「承認して利用開始準備」を行います。
6. 管理者はログイン案内テンプレートを使って、招待メールまたはログイン案内を手動で送ります。
7. ユーザーはログイン後、`/onboarding` から店舗情報、請求書設定、商品、顧客を登録します。

申し込みだけで自動的に使える状態にはしません。AIO利用料はMVP期間中、Stripe Subscriptionではなく請求書ベースで運用します。店舗側Stripe/freee連携は、店舗のお客様決済・会計連携用であり、AIO運営側課金とは別です。

## 1社目導入前チェックリスト

- βユーザー名
- 店舗名
- 担当者名
- 連絡先
- 業態
- 初期設定完了
- 請求書設定完了
- 顧客/商品/サービス登録確認
- 見積/請求/PDF確認
- 入金管理確認
- Stripe手動決済URL説明済み
- freee CSV説明済み
- Gmail/Calendar接続確認済み
- Google Business Profile手動投稿支援説明済み
- SNS投稿支援説明済み
- AI生成文の確認ルール説明済み
- 不具合報告方法説明済み

## β利用前の確認事項

- AIO Growth Partnerはβ版であり、伴走しながら改善する前提です。
- 一部機能は手動運用です。Stripeは決済URL手動登録、freeeはCSV出力、Google Business ProfileとSNSは手動投稿支援です。
- 外部サービス連携は、Google、Stripe、freeeなど各社の仕様、審査、権限、利用制限の影響を受けます。
- Google OAuthは `https://app.aioboost.jp/api/google/oauth/callback` で本番接続確認済みです。Gmail下書き作成とGoogleカレンダー予定作成も本番成功済みです。
- AI生成文は提案であり、店舗担当者が内容を確認してから利用します。
- 補助金採択、ITツール登録、Google API承認、外部サービス審査通過を保証するものではありません。
- 重要データは利用者側でも内容確認し、必要に応じてPDF、CSV、会計ソフト側で保管します。

## β価格メモ

一般公開用ではなく、管理者が1社目との条件整理に使うメモです。

- β導入価格: 1社目は個別見積。伴走内容と店舗数に応じて調整します。
- 月額: MVP期間は請求書ベースで請求します。Stripe自動課金は使いません。
- 初期設定費: 店舗作成、請求書設定、商品/顧客初期登録、Google接続確認を含めるか個別に決めます。
- 伴走サポート範囲: 初回設定、操作説明、不具合一次受付、月次レポート確認、集客アクション作成支援を想定します。
- 無料期間: 必要に応じて初月無料またはトライアル期間を設定できます。終了日を必ず記録します。
- 正式版移行: 正式版料金、機能範囲、手動運用から自動連携への移行条件を事前に説明します。

## 問い合わせ・不具合対応メモ

- 発生画面URL、操作内容、表示エラー、スクリーンショット、店舗名、発生日時を確認します。
- 緊急度は、業務停止、保存不可、表示崩れ、操作質問の4段階で分類します。
- ユーザーには、画面全体のスクリーンショットと直前に押したボタンを共有してもらいます。
- Codex開発チャットへ渡す情報は、再現手順、対象URL、店舗ID、発生日時、期待動作、実際の動作です。
- Supabaseでは対象テーブル、RLS、直近データ、audit_logs、external_integration_logsを確認します。
- Vercelでは最新デプロイ、Function Logs、環境変数の有無を確認します。
- GitHubでは最新コミット、差分、関連ファイル、未反映のpush有無を確認します。
- 修正後は、ローカル確認、lint、build、secretチェック、push、Vercel反映、本番URL確認の順で戻します。

## バックアップ・復旧メモ

- Supabaseのバックアップ設定と復元方法をプロジェクト側で確認します。
- 重要な請求書、入金、会計CSV、売上CSVは定期的にエクスポートして控えます。
- 重要テーブルは `stores`、`customers`、`items`、`estimates`、`invoices`、`payments`、`sales_transactions`、`accounting_export_jobs`、`audit_logs`、`google_oauth_connections`、`store_payment_integrations`、`store_accounting_integrations` です。
- 誤操作時は、`audit_logs`、`invoice_pdf_issues`、`accounting_export_jobs`、`external_integration_logs` を先に確認します。
- 削除系操作は本番DBで直接行わず、対象 `store_id`、`organization_id`、バックアップ有無を確認してから実施します。
- 本番DBを触る場合は、実行SQL、実行日時、対象テーブル、想定影響、実行後確認をメモに残します。

## 1社目向けデモシナリオ

1. 店舗を開き、デモ店舗ではなく実店舗であることを確認します。
2. 顧客を1件登録します。
3. 商品/サービスを1件登録します。
4. 見積書を作成します。
5. 請求書を作成します。
6. PDFを出力し、内容を確認します。
7. Stripe決済URLを請求書に登録します。
8. Stripe決済済みとして手動で入金済みにします。
9. freee向けCSVを出力します。
10. 売上レポートを確認します。
11. AI月次レポートを確認します。
12. AI集客アクションを作成します。
13. Gmail下書きを作成します。
14. Googleカレンダー予定を作成します。
15. SNS手動投稿支援で投稿文をコピーできることを確認します。
