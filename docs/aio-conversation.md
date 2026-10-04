# AIO改善を会話から進める

## 承認された範囲

- 対象は全店舗共通の `/stores/[storeId]/marketing/aio-improvement`。
- 指定されたカード、目標質問フォーム、古い情報・未公開・期限超過の確認欄を、初期状態で閉じた小さな「機能一覧」にまとめる。既存の操作、履歴、深いリンクを維持。
- 右側AIが店舗の準備状況と進行中の改善から提案。メニュー／サービスの選択（自由入力可）→補足→確認→下書き生成→本文入りの編集画面へ移動。
- 3種: サービス紹介文、お店の強み、見つけてもらいたい質問。提案と別に目的を直接選べる。
- 月次の再診断や手動設定は機能一覧から利用可能。既存機能の廃止ではない。

## 境界・安全性

- `aio_conversations` は店舗＋利用者単位。投稿・販促の `marketing_conversations` と分離。
- APIで店舗アクセス、編集権限、draft_editing、同一Originを検査。RPCもアクティブ利用者の書込権限を再検査。ブラウザJWTはテーブル/RPCに直接アクセス不可。
- revision CAS、生成lease、原子的な下書き＋監査＋完了状態保存で再送時の重複を防止。生成失敗でも回答を保持。
- 保存先は既存 `aio_improvement_tasks` の追加 `draft_body/draft_kind`。既存削除済み・復元を再利用。
- 下書きと変更実績を分離。生成だけでは店舗情報・目標質問・公開状態・完了状態を更新しない。目標質問の適用は編集画面で確認して別途保存。
- 既存保護済みOpenAI設定と費用計測を利用。公開店舗情報・選択商品・入力の必要部分のみ、件数/文字数制限つき。顧客・売上・他店舗情報を送らない。
- 外部公開ジョブなし。検索順位や推薦を保証しない。

## 検証

- 単体: `node --test tests/unit/aio-conversation*.test.mjs tests/unit/marketing-conversation*.test.mjs`
- 統合: `npm run test:marketing-aio` / `npm run test:ai-usage` / 型・lint・secret・archive checks。
- 隔離Preview（DB=既存staging、保護済みAIキーは既存環境で利用）: `AIO_TEST_URL=<isolated preview> node scripts/test-aio-conversation-staging.mjs --staging-synthetic-live`。
- 合成店舗/利用者のみ作成して最後に後片付け。実API利用量の追記証跡は保持。
- 本番UIは審査用架空店舗でのみ確認。実店舗への公開・顧客への送信は行わない。

## 配備

- 追加migration `202610040003_aio_conversation.sql` をstaging検証後に本番へ適用。
- アプリrollbackは直前版へ戻す。追加テーブル/列の破壊的削除は不要。
- 最終の検証結果・デプロイIDはIssue/PRへ記録する。
