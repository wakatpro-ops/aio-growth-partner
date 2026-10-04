# Google口コミの集客・販促統合

Issue #185 / 2026-10-05。新しい契約・API・DB migration は不要。

- 正規URLは `/stores/:storeId/marketing/reviews`。旧 `/reviews` は一時リダイレクトでクエリを保持。
- サイドバーから独立したGoogle口コミを除き、集客・販促タブへ集約。詳細、同期、返信、AI返信案は閉じた機能一覧に保持。
- 要返信バッジは正確なDB件数。下書き・承認待ち・承認済みは公開返信がなければ含める。公開返信のあるものとpublishedは除外。
- 選択中・未削除のGoogle店舗だけを対象に、店舗・法人で絞り込み。表示は未返信を初期フィルターとし20件ごとにページ送り。返信済み履歴も確認可能。
- 取得失敗は0件や未接続に置換しない。バッジは件数未取得、本文は取得エラー、AIは取得不可と表示。
- Google接続済みだけでなく、接続に対応するGoogle店舗の明示選択まで確認。未完了ならマーケティング提案で優先度120（未返信100、緊急下書き110より優先）。利用者の明示した後回しは維持。
- 口コミタブのAIは同じ集計を参照して接続案内／返信案内を開始。AIによる無断の接続、同期、返信承認、公開は行わない。
- 閲覧者には保存・承認・公開・AI生成操作を表示しない。既存のサーバー書込認可は保持。
- 返信操作後は新URLへ戻り、機能一覧を開く。旧ブックマーク、店トップ、Google設定からの導線も新URLへ統一。

検証: marketing-reviews unit tests、marketing conversation/service、marketing/AIO integration、Google workflows、型検査・lint・production build。実Googleへの返信公開・OAuth変更は対象外。
